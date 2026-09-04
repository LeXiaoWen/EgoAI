import type {
  KnowledgeBaseConnectionConfig,
  WeknoraListKnowledgeBasesResult,
} from '../../shared/weknora/connection';
import { configService } from './config';

/**
 * 知识库纯客户端服务：EgoAI 不做库管理，只读取「当前配置连接下有哪些可用知识库」，
 * 供设置区列表与会话级范围选择器展示。列表走固定 IPC（不做通用 api:fetch）。
 */

export const getConfiguredKnowledgeBaseConnection = (): KnowledgeBaseConnectionConfig | null => {
  const connection = configService.getConfig().knowledgeBaseConnection;
  if (!connection) return null;
  if (!connection.baseUrl.trim() || !connection.apiKey.trim()) return null;
  return connection;
};

export const listKnowledgeBases = async (
  connection: KnowledgeBaseConnectionConfig,
): Promise<WeknoraListKnowledgeBasesResult> => {
  try {
    return await window.electron.knowledgeBase.listKnowledgeBases(connection);
  } catch (error) {
    console.error('[KnowledgeBase] list knowledge bases failed:', error);
    return {
      ok: false,
      reason: 'unreachable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};
