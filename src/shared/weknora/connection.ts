/**
 * 知识库连接（纯客户端方向）。
 *
 * EgoAI 不内嵌/拉起 WeKnora 引擎，知识库的建库/上传/解析等管理都在用户自备
 * WeKnora 实例的 Web UI 中完成。这里只保存一条「连接」配置 { baseUrl, apiKey }，
 * 喂给内置 weknora MCP server（stdio）以及设置里的「测试连接」探测。
 */

/** 用户在设置里填的知识库连接：实例源地址 + tenant API key。 */
export interface KnowledgeBaseConnectionConfig {
  baseUrl: string;
  apiKey: string;
}

export const defaultKnowledgeBaseConnection: KnowledgeBaseConnectionConfig = {
  baseUrl: '',
  apiKey: '',
};

/**
 * 把用户在设置里填的实例源地址（不含 /api/v1）规整为 REST/MCP 用的 API 前缀。
 * 去除首尾空白与末尾斜杠后统一追加 /api/v1。
 */
export function knowledgeBaseApiBaseUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/api/v1`;
}

/** 「测试连接」探测走专用 IPC（不做通用 api:fetch，端点固定为 /api/v1 前缀）。 */
export const WeknoraTestConnectionChannel = 'weknora:testConnection';

export type WeknoraTestConnectionResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'auth' | 'unreachable'; detail?: string };
