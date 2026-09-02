// 模型统一：把 EgoAI 的 chat/embedding/rerank 三类模型注入 WeKnora models 表。
// EgoAI 是唯一模型配置入口，chat 复用现有激活 provider（resolveRawApiConfig），
// embedding/rerank 读 app_config.knowledgeBaseModels。
//
// 幂等策略：REST 层无法自传稳定 ID（CreateModelRequest 无 ID 字段，见
// WeKnora/internal/handler/model.go），因此以 name + type 匹配，display_name
// 统一「EgoAI 」前缀作管理标记；sync 时 upsert 目标模型并清理已不在目标集合
// 的旧记录（含 rerank 禁用场景）。失败非致命、可重入。

import { ProviderName } from '../../shared/providers';
import {
  defaultKnowledgeBaseModels,
  KnowledgeBaseEmbeddingSource,
  type KnowledgeBaseModelsConfig,
} from '../../shared/weknora/knowledgeBaseModels';
import { resolveRawApiConfig } from './claudeSettings';
import { getWeknoraManager, weknoraHttpRequest } from './weknoraManager';

// 与 WeKnora internal/types/model.go 对齐的枚举串。
const ModelType = {
  KnowledgeQA: 'KnowledgeQA',
  Embedding: 'Embedding',
  Rerank: 'Rerank',
} as const;

const ModelSource = {
  Local: 'local',
  Remote: 'remote',
} as const;

// EgoAI 注入模型的 display_name 统一前缀，用作「EgoAI 管理」标记。
const DISPLAY_NAME_PREFIX = 'EgoAI ';
const DISPLAY_NAME_CHAT = `${DISPLAY_NAME_PREFIX}Chat`;
const DISPLAY_NAME_EMBEDDING = `${DISPLAY_NAME_PREFIX}Embedding`;
const DISPLAY_NAME_RERANK = `${DISPLAY_NAME_PREFIX}Rerank`;

interface TargetModel {
  name: string;
  type: string;
  source: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
}

// GET /models 返回的 ModelResponse 里同步所需的字段子集。
interface ExistingModel {
  id: string;
  name: string;
  type: string;
  source: string;
  display_name: string;
  parameters: { base_url?: string };
}

export interface SyncWeknoraModelsOptions {
  reason: string;
  getKnowledgeBaseModels: () => KnowledgeBaseModelsConfig | null;
}

export interface SyncWeknoraModelsResult {
  success: boolean;
  changed: boolean;
}

export async function syncWeknoraModels(
  options: SyncWeknoraModelsOptions,
): Promise<SyncWeknoraModelsResult> {
  try {
    const manager = getWeknoraManager();
    if (!manager.getWebUrl()) {
      const state = await manager.start();
      if (state.phase !== 'ready' || !state.port) {
        console.warn(`[WeKnora] model sync skipped (reason=${options.reason}): server not ready`);
        return { success: false, changed: false };
      }
    }
    const port = manager.getPort();
    const apiKey = manager.getWeknoraApiKey();
    if (!port || !apiKey) {
      console.warn(`[WeKnora] model sync skipped (reason=${options.reason}): no port/api-key yet`);
      return { success: false, changed: false };
    }

    const targets = buildTargets(options.getKnowledgeBaseModels());
    const existing = await listModels(port, apiKey);
    let changed = false;

    for (const target of targets) {
      const match = existing.find(m => m.name === target.name && m.type === target.type);
      if (match) {
        if (needsUpdate(match, target)) {
          await updateModel(port, apiKey, match.id, target);
          changed = true;
        }
        if (target.apiKey) {
          // GET 不返回明文 key，无法比对，因此每次都幂等覆盖。
          await putCredentials(port, apiKey, match.id, target.apiKey);
        }
      } else {
        await createModel(port, apiKey, target);
        changed = true;
      }
    }

    // 清理：EgoAI 管理但已不在目标集合的旧记录（含 rerank 禁用、模型切换）。
    const targetKeys = new Set(targets.map(t => `${t.type}::${t.name}`));
    for (const model of existing) {
      if (
        model.display_name.startsWith(DISPLAY_NAME_PREFIX)
        && !targetKeys.has(`${model.type}::${model.name}`)
      ) {
        await deleteModel(port, apiKey, model.id);
        changed = true;
      }
    }

    console.log(
      `[WeKnora] model sync done (reason=${options.reason}): ${targets.length} target(s), changed=${changed}`,
    );
    return { success: true, changed };
  } catch (error) {
    console.error('[WeKnora] model sync failed', error);
    return { success: false, changed: false };
  }
}

function buildTargets(kbConfig: KnowledgeBaseModelsConfig | null): TargetModel[] {
  const cfg = kbConfig ?? defaultKnowledgeBaseModels;
  const targets: TargetModel[] = [];

  // chat：复用现有激活 provider + 默认模型（KnowledgeQA，作 SummaryModel）。
  const raw = resolveRawApiConfig();
  if (raw.config && raw.providerMetadata) {
    const isLocal = raw.providerMetadata.providerName === ProviderName.Ollama
      || raw.providerMetadata.providerName === ProviderName.LmStudio;
    targets.push({
      name: raw.config.model,
      type: ModelType.KnowledgeQA,
      source: isLocal ? ModelSource.Local : ModelSource.Remote,
      displayName: DISPLAY_NAME_CHAT,
      baseUrl: raw.config.baseURL,
      // 本地 provider 无鉴权，不落占位符。
      apiKey: isLocal ? '' : raw.config.apiKey,
    });
  }

  // embedding：独立配置（默认 Ollama bge-m3）。
  const embIsLocal = cfg.embedding.source === KnowledgeBaseEmbeddingSource.Local;
  targets.push({
    name: cfg.embedding.model,
    type: ModelType.Embedding,
    source: cfg.embedding.source,
    displayName: DISPLAY_NAME_EMBEDDING,
    baseUrl: cfg.embedding.baseUrl,
    apiKey: embIsLocal ? '' : cfg.embedding.apiKey,
  });

  // rerank：仅启用时注入（Ollama 不支持 rerank，固定 remote generic）。
  if (cfg.rerank.enabled) {
    targets.push({
      name: cfg.rerank.model,
      type: ModelType.Rerank,
      source: ModelSource.Remote,
      displayName: DISPLAY_NAME_RERANK,
      baseUrl: cfg.rerank.baseUrl,
      apiKey: cfg.rerank.apiKey,
    });
  }

  return targets;
}

async function listModels(port: number, apiKey: string): Promise<ExistingModel[]> {
  const res = await weknoraHttpRequest({
    port,
    method: 'GET',
    path: '/api/v1/models',
    headers: { 'X-API-Key': apiKey },
  });
  const data = (res.data as { data?: ExistingModel[] } | undefined)?.data;
  return Array.isArray(data) ? data : [];
}

function needsUpdate(existing: ExistingModel, target: TargetModel): boolean {
  return existing.source !== target.source
    || existing.display_name !== target.displayName
    || (existing.parameters?.base_url ?? '') !== target.baseUrl;
}

// PUT /models/:id 不接受 api_key（handler 强制保留旧值），只更新非敏感字段。
async function updateModel(
  port: number,
  apiKey: string,
  id: string,
  target: TargetModel,
): Promise<void> {
  await weknoraHttpRequest({
    port,
    method: 'PUT',
    path: `/api/v1/models/${id}`,
    headers: { 'X-API-Key': apiKey },
    body: {
      name: target.name,
      display_name: target.displayName,
      type: target.type,
      source: target.source,
      parameters: {
        base_url: target.baseUrl,
        provider: target.source === ModelSource.Remote ? 'generic' : '',
      },
    },
  });
}

async function createModel(
  port: number,
  apiKey: string,
  target: TargetModel,
): Promise<void> {
  await weknoraHttpRequest({
    port,
    method: 'POST',
    path: '/api/v1/models',
    headers: { 'X-API-Key': apiKey },
    body: {
      name: target.name,
      display_name: target.displayName,
      type: target.type,
      source: target.source,
      parameters: {
        base_url: target.baseUrl,
        api_key: target.apiKey,
        provider: target.source === ModelSource.Remote ? 'generic' : '',
      },
    },
  });
}

async function putCredentials(
  port: number,
  apiKey: string,
  id: string,
  apiKeyValue: string,
): Promise<void> {
  await weknoraHttpRequest({
    port,
    method: 'PUT',
    path: `/api/v1/models/${id}/credentials`,
    headers: { 'X-API-Key': apiKey },
    body: { api_key: apiKeyValue },
  });
}

async function deleteModel(port: number, apiKey: string, id: string): Promise<void> {
  await weknoraHttpRequest({
    port,
    method: 'DELETE',
    path: `/api/v1/models/${id}`,
    headers: { 'X-API-Key': apiKey },
  });
}
