import { BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { WeknoraIpcChannel } from '../../../shared/weknora/constants';
import type {
  CreateKnowledgeBaseInput,
  HybridSearchInput,
  Knowledge,
  KnowledgeBase,
  KnowledgeList,
  SearchResult,
  UploadDocumentInput,
  WeknoraResult,
} from '../../../shared/weknora/types';
import type { WeknoraManager } from '../../libs/weknoraManager';
import { weknoraHttpRequest, weknoraUploadFile } from '../../libs/weknoraManager';

export interface WeknoraHandlerDeps {
  getWeknoraManager: () => WeknoraManager;
}

// 首批只放行 SimpleFormatReader（Go 内置）可解析的纯文本格式；PDF/Office 等
// 富格式待 docreader 拉起后再开放（见融合计划阶段 2「docreader 最小拉起」）。
const ALLOWED_TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.text']);

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

type ReadyResult = { ok: true; port: number; apiKey: string } | { ok: false; error: string };

// 路径参数仅放行安全字符（字母/数字/下划线/连字符），拒绝 `/`、`..`、空格等，
// 防止 renderer 经拼接 path 注入访问白名单之外的端点。
function normalizeId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function normalizeCreateKbInput(input: unknown): CreateKnowledgeBaseInput {
  const obj = (input ?? {}) as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name || name.length > 200) throw new Error('invalid name');
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  return { name, description };
}

function normalizeDocListInput(input: unknown): { kbId: string; page: number; pageSize: number } {
  const obj = (input ?? {}) as Record<string, unknown>;
  const kbId = normalizeId(obj.kbId, 'kbId');
  const page = typeof obj.page === 'number' && obj.page >= 1 ? Math.floor(obj.page) : 1;
  const pageSize =
    typeof obj.pageSize === 'number' && obj.pageSize >= 1 && obj.pageSize <= 100
      ? Math.floor(obj.pageSize)
      : 20;
  return { kbId, page, pageSize };
}

function normalizeUploadInput(input: unknown): UploadDocumentInput {
  const obj = (input ?? {}) as Record<string, unknown>;
  const kbId = normalizeId(obj.kbId, 'kbId');
  const filePath = typeof obj.filePath === 'string' ? obj.filePath.trim() : '';
  if (!filePath) throw new Error('invalid filePath');
  const fileName = typeof obj.fileName === 'string' ? obj.fileName.trim() : '';
  return { kbId, filePath, fileName };
}

function normalizeSearchInput(input: unknown): Required<
  Pick<HybridSearchInput, 'kbId' | 'query'>
> &
  Omit<HybridSearchInput, 'kbId' | 'query'> {
  const obj = (input ?? {}) as Record<string, unknown>;
  const kbId = normalizeId(obj.kbId, 'kbId');
  const query = typeof obj.query === 'string' ? obj.query.trim() : '';
  if (!query || query.length > 1000) throw new Error('invalid query');
  const matchCount =
    typeof obj.matchCount === 'number' && obj.matchCount >= 1 && obj.matchCount <= 50
      ? Math.floor(obj.matchCount)
      : 5;
  const vectorThreshold =
    typeof obj.vectorThreshold === 'number' ? obj.vectorThreshold : undefined;
  const keywordThreshold =
    typeof obj.keywordThreshold === 'number' ? obj.keywordThreshold : undefined;
  return { kbId, query, matchCount, vectorThreshold, keywordThreshold };
}

// WeKnora 统一错误结构为 { success:false, error:{ code, message } }，提取 message。
function extractError(data: unknown): string {
  if (data && typeof data === 'object') {
    const body = data as { error?: unknown; message?: unknown };
    if (body.error && typeof body.error === 'object') {
      const inner = body.error as { message?: unknown };
      if (typeof inner.message === 'string') return inner.message;
    }
    if (typeof body.message === 'string') return body.message;
  }
  return 'WeKnora request failed';
}

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : 'Failed' };
}

async function ensureReady(manager: WeknoraManager): Promise<ReadyResult> {
  if (!manager.getWebUrl()) {
    const state = await manager.start();
    if (state.phase !== 'ready' || !state.port) {
      return { ok: false, error: 'WeKnora server not ready' };
    }
  }
  const port = manager.getPort();
  const apiKey = manager.getWeknoraApiKey();
  if (!port || !apiKey) {
    return { ok: false, error: 'WeKnora API key not available' };
  }
  return { ok: true, port, apiKey };
}

// 建库需要 embedding/summary 模型 ID，但 ID 是注入后由 WeKnora 生成的 UUID，
// 对 renderer 不可见。这里从 /models 按 type 解析，契合「用户无感知模型 ID」。
async function resolveDefaultModelIds(
  port: number,
  apiKey: string,
): Promise<{ embeddingId?: string; summaryId?: string }> {
  const res = await weknoraHttpRequest({
    port,
    method: 'GET',
    path: '/api/v1/models',
    headers: { 'X-API-Key': apiKey },
  });
  if (res.status >= 400) return {};
  const models =
    (res.data as { data?: Array<{ id: string; type: string }> } | undefined)?.data ?? [];
  const embedding = models.find(m => m.type === 'Embedding');
  const summary = models.find(m => m.type === 'KnowledgeQA');
  return { embeddingId: embedding?.id, summaryId: summary?.id };
}

function mimeForExt(ext: string): string {
  if (ext === '.txt' || ext === '.text') return 'text/plain';
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  return 'text/plain';
}

export function registerWeknoraHandlers(deps: WeknoraHandlerDeps): void {
  const { getWeknoraManager } = deps;

  ipcMain.handle(WeknoraIpcChannel.KbList, async (): Promise<WeknoraResult<KnowledgeBase[]>> => {
    try {
      const ready = await ensureReady(getWeknoraManager());
      if (ready.ok === false) return { success: false, error: ready.error };
      const res = await weknoraHttpRequest({
        port: ready.port,
        method: 'GET',
        path: '/api/v1/knowledge-bases',
        headers: { 'X-API-Key': ready.apiKey },
      });
      if (res.status >= 400) return { success: false, error: extractError(res.data) };
      const data = (res.data as { data?: KnowledgeBase[] } | undefined)?.data;
      return { success: true, data: Array.isArray(data) ? data : [] };
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    WeknoraIpcChannel.KbCreate,
    async (_event, input: unknown): Promise<WeknoraResult<KnowledgeBase>> => {
      try {
        const { name, description } = normalizeCreateKbInput(input);
        const ready = await ensureReady(getWeknoraManager());
        if (ready.ok === false) return { success: false, error: ready.error };
        const modelIds = await resolveDefaultModelIds(ready.port, ready.apiKey);
        const res = await weknoraHttpRequest({
          port: ready.port,
          method: 'POST',
          path: '/api/v1/knowledge-bases',
          headers: { 'X-API-Key': ready.apiKey },
          body: {
            name,
            description: description || '',
            ...(modelIds.embeddingId ? { embedding_model_id: modelIds.embeddingId } : {}),
            ...(modelIds.summaryId ? { summary_model_id: modelIds.summaryId } : {}),
          },
        });
        if (res.status >= 400) return { success: false, error: extractError(res.data) };
        return { success: true, data: (res.data as { data: KnowledgeBase }).data };
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    WeknoraIpcChannel.KbDelete,
    async (_event, input: unknown): Promise<WeknoraResult<null>> => {
      try {
        const kbId = normalizeId(input, 'kbId');
        const ready = await ensureReady(getWeknoraManager());
        if (ready.ok === false) return { success: false, error: ready.error };
        const res = await weknoraHttpRequest({
          port: ready.port,
          method: 'DELETE',
          path: `/api/v1/knowledge-bases/${kbId}`,
          headers: { 'X-API-Key': ready.apiKey },
        });
        if (res.status >= 400) return { success: false, error: extractError(res.data) };
        return { success: true, data: null };
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    WeknoraIpcChannel.DocList,
    async (_event, input: unknown): Promise<WeknoraResult<KnowledgeList>> => {
      try {
        const { kbId, page, pageSize } = normalizeDocListInput(input);
        const ready = await ensureReady(getWeknoraManager());
        if (ready.ok === false) return { success: false, error: ready.error };
        const query = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
        });
        const res = await weknoraHttpRequest({
          port: ready.port,
          method: 'GET',
          path: `/api/v1/knowledge-bases/${kbId}/knowledge?${query.toString()}`,
          headers: { 'X-API-Key': ready.apiKey },
        });
        if (res.status >= 400) return { success: false, error: extractError(res.data) };
        const body = res.data as
          | { data?: Knowledge[]; total?: number; page?: number; page_size?: number }
          | undefined;
        return {
          success: true,
          data: {
            items: Array.isArray(body?.data) ? body.data : [],
            total: body?.total ?? 0,
            page: body?.page ?? page,
            page_size: body?.page_size ?? pageSize,
          },
        };
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    WeknoraIpcChannel.DocGet,
    async (_event, input: unknown): Promise<WeknoraResult<Knowledge>> => {
      try {
        const docId = normalizeId(input, 'docId');
        const ready = await ensureReady(getWeknoraManager());
        if (ready.ok === false) return { success: false, error: ready.error };
        const res = await weknoraHttpRequest({
          port: ready.port,
          method: 'GET',
          path: `/api/v1/knowledge/${docId}`,
          headers: { 'X-API-Key': ready.apiKey },
        });
        if (res.status >= 400) return { success: false, error: extractError(res.data) };
        return { success: true, data: (res.data as { data: Knowledge }).data };
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    WeknoraIpcChannel.DocDelete,
    async (_event, input: unknown): Promise<WeknoraResult<null>> => {
      try {
        const docId = normalizeId(input, 'docId');
        const ready = await ensureReady(getWeknoraManager());
        if (ready.ok === false) return { success: false, error: ready.error };
        const res = await weknoraHttpRequest({
          port: ready.port,
          method: 'DELETE',
          path: `/api/v1/knowledge/${docId}`,
          headers: { 'X-API-Key': ready.apiKey },
        });
        if (res.status >= 400) return { success: false, error: extractError(res.data) };
        return { success: true, data: null };
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    WeknoraIpcChannel.DocUpload,
    async (_event, input: unknown): Promise<WeknoraResult<Knowledge>> => {
      try {
        const { kbId, filePath, fileName } = normalizeUploadInput(input);
        const ready = await ensureReady(getWeknoraManager());
        if (ready.ok === false) return { success: false, error: ready.error };
        const ext = path.extname(filePath).toLowerCase();
        if (!ALLOWED_TEXT_EXTENSIONS.has(ext)) {
          return { success: false, error: 'Unsupported file type (txt/md only for now)' };
        }
        const fileBuffer = await fs.promises.readFile(filePath);
        const baseName = fileName || path.basename(filePath);
        const res = await weknoraUploadFile({
          port: ready.port,
          apiKey: ready.apiKey,
          kbId,
          fileBuffer,
          fileName: baseName,
          fileType: mimeForExt(ext),
        });
        if (res.status >= 400) return { success: false, error: extractError(res.data) };
        return { success: true, data: (res.data as { data: Knowledge }).data };
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    WeknoraIpcChannel.SearchHybrid,
    async (_event, input: unknown): Promise<WeknoraResult<SearchResult[]>> => {
      try {
        const { kbId, query, matchCount, vectorThreshold, keywordThreshold } =
          normalizeSearchInput(input);
        const ready = await ensureReady(getWeknoraManager());
        if (ready.ok === false) return { success: false, error: ready.error };
        const res = await weknoraHttpRequest({
          port: ready.port,
          method: 'POST',
          path: `/api/v1/knowledge-bases/${kbId}/hybrid-search`,
          headers: { 'X-API-Key': ready.apiKey },
          body: {
            query_text: query,
            match_count: matchCount,
            ...(vectorThreshold !== undefined ? { vector_threshold: vectorThreshold } : {}),
            ...(keywordThreshold !== undefined ? { keyword_threshold: keywordThreshold } : {}),
          },
        });
        if (res.status >= 400) return { success: false, error: extractError(res.data) };
        const data = (res.data as { data?: SearchResult[] } | undefined)?.data;
        return { success: true, data: Array.isArray(data) ? data : [] };
      } catch (error) {
        return fail(error);
      }
    },
  );

  ipcMain.handle(
    WeknoraIpcChannel.OpenFile,
    async (event): Promise<{ path: string | null }> => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        const options = {
          properties: ['openFile'] as Array<'openFile'>,
          filters: [{ name: 'Text / Markdown', extensions: ['txt', 'md', 'markdown', 'text'] }],
        };
        const result = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options);
        return {
          path: result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0],
        };
      } catch (error) {
        console.error('[WeKnora] open file dialog failed', error);
        return { path: null };
      }
    },
  );
}
