/**
 * 会话级「知识库范围」（纯客户端方向）。
 *
 * EgoAI 不做知识库管理界面：只让用户在会话级选择问答范围——某个知识库 /
 * 全部知识库 / 不检索。该选择持久化在 cowork_sessions 的 kb_scope_json，
 * 由主进程在每轮出站 prompt 注入成约束指令（约束粒度见
 * libs/agentEngine/knowledgeBaseScopePrompt.ts）。
 */

export type KnowledgeBaseScopeMode = 'none' | 'all' | 'specific';

export interface KnowledgeBaseScope {
  mode: KnowledgeBaseScopeMode;
  /** 仅 mode === 'specific' 使用。WeKnora 的 hybrid_search.kb_id 接受 UUID 或名称。 */
  kbId?: string;
  kbName?: string;
}

/** knowledge-base-qa 预设 agent id：其会话默认范围 = all（保持今天「搜全部库」的行为）。 */
export const KNOWLEDGE_BASE_QA_PRESET_ID = 'knowledge-base-qa';

export const DEFAULT_KB_SCOPE: KnowledgeBaseScope = { mode: 'none' };

const KB_SCOPE_MODES: readonly KnowledgeBaseScopeMode[] = ['none', 'all', 'specific'];

/** 依 agent 预设派生默认模式：knowledge-base-qa → all，其余 → none。 */
export function presetDefaultKbScopeMode(
  presetId: string | null | undefined,
): KnowledgeBaseScopeMode {
  return presetId === KNOWLEDGE_BASE_QA_PRESET_ID ? 'all' : 'none';
}

export function presetDefaultKbScope(presetId: string | null | undefined): KnowledgeBaseScope {
  return { mode: presetDefaultKbScopeMode(presetId) };
}

/**
 * 校验/规整 IPC 或存储读出的未知输入。specific 缺 kbId 视为非法；脏输入一律
 * 返回 null（调用方回退到默认值，绝不把坏数据写库）。
 */
export function normalizeKbScope(input: unknown): KnowledgeBaseScope | null {
  if (typeof input !== 'object' || input === null) return null;
  const candidate = input as Record<string, unknown>;
  const mode = candidate.mode;
  if (typeof mode !== 'string' || !(KB_SCOPE_MODES as readonly string[]).includes(mode)) {
    return null;
  }
  if (mode === 'specific') {
    const kbId = typeof candidate.kbId === 'string' ? candidate.kbId.trim() : '';
    const kbName = typeof candidate.kbName === 'string' ? candidate.kbName.trim() : undefined;
    if (!kbId) return null;
    return { mode: 'specific', kbId, ...(kbName ? { kbName } : {}) };
  }
  return { mode: mode as Exclude<KnowledgeBaseScopeMode, 'specific'> };
}

/** 落库序列化（稳定 JSON）。null/undefined → null。 */
export function serializeKbScope(scope: KnowledgeBaseScope | null | undefined): string | null {
  if (!scope) return null;
  return JSON.stringify(scope);
}

/** 读库反序列化；空/损坏 → null（调用方回退默认）。 */
export function parseKbScope(json: string | null | undefined): KnowledgeBaseScope | null {
  if (!json) return null;
  try {
    return normalizeKbScope(JSON.parse(json));
  } catch {
    return null;
  }
}

/** 会话内修改范围走专用 IPC（常量集中于此，AGENTS.md：IPC 通道名必须是常量）。 */
export const CoworkUpdateSessionKbScopeChannel = 'cowork:session:updateKbScope';
