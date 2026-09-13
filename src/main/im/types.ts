/**
 * IM Gateway Type Definitions
 * Types for the IM bot channels EgoAI ships: WeCom, Weixin, QQ and Email.
 */

import type { Platform } from '../../shared/platform';
export type { Platform } from '../../shared/platform';

// ==================== QQ Types ====================

export interface QQOpenClawConfig {
  enabled: boolean;
  appId: string;
  appSecret: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
  historyLimit: number;
  markdownSupport: boolean;
  imageServerBaseUrl: string;
  debug: boolean;
}

/** @deprecated Use QQOpenClawConfig instead */
export type QQConfig = QQOpenClawConfig;

export interface QQGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

// ==================== QQ Multi-Instance Types ====================

export const MAX_QQ_INSTANCES = 5;

export interface QQInstanceConfig extends QQOpenClawConfig {
  instanceId: string;
  instanceName: string;
}

export interface QQInstanceStatus extends QQGatewayStatus {
  instanceId: string;
  instanceName: string;
}

export interface QQMultiInstanceConfig {
  instances: QQInstanceConfig[];
}

export interface QQMultiInstanceStatus {
  instances: QQInstanceStatus[];
}

// ==================== WeCom (企业微信) Types ====================

export interface WecomOpenClawConfig {
  enabled: boolean;
  botId: string;
  secret: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist' | 'disabled';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
  sendThinkingMessage: boolean;
  debug: boolean;
}

/** @deprecated Use WecomOpenClawConfig instead */
export type WecomConfig = WecomOpenClawConfig;

export interface WecomGatewayStatus {
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  botId: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

// ==================== WeCom Multi-Instance Types ====================

export const MAX_WECOM_INSTANCES = 20;

export interface WecomInstanceConfig extends WecomOpenClawConfig {
  instanceId: string;
  instanceName: string;
}

export interface WecomInstanceStatus extends WecomGatewayStatus {
  instanceId: string;
  instanceName: string;
}

export interface WecomMultiInstanceConfig {
  instances: WecomInstanceConfig[];
}

export interface WecomMultiInstanceStatus {
  instances: WecomInstanceStatus[];
}

// ==================== Weixin (微信) Types ====================

export interface WeixinOpenClawConfig {
  enabled: boolean;
  accountId: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist' | 'disabled';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
  debug: boolean;
}

export interface WeixinGatewayStatus {
  connected: boolean;
  accountId: string | null;
  startedAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

// ==================== Email Channel Types ====================

export interface EmailInstanceConfig {
  instanceId: string; // "email-1", "email-2", etc.
  instanceName: string; // Display name: "Work Email"
  enabled: boolean; // Enable/disable this account

  // Transport mode
  transport: 'imap' | 'ws'; // IMAP/SMTP or WebSocket

  // Account credentials
  email: string; // user@example.com
  password?: string; // Required if transport=imap
  apiKey?: string; // Required if transport=ws (format: ck_*)

  // Agent binding
  agentId: string; // Agent ID (default: "main")

  // IMAP/SMTP servers (optional, auto-detected if empty)
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;

  // Security & policy
  allowFrom?: string[]; // Whitelist: ["user@example.com", "*.trusted.com"]

  // Advanced options
  replyMode?: 'immediate' | 'accumulated' | 'complete';
  replyTo?: 'sender' | 'all';

  // Agent-to-Agent collaboration
  a2aEnabled?: boolean;
  a2aAgentDomains?: string[];
  a2aMaxPingPongTurns?: number;
}

export interface EmailMultiInstanceConfig {
  instances: EmailInstanceConfig[];
}

export interface EmailInstanceStatus {
  instanceId: string;
  instanceName: string;
  connected: boolean;
  startedAt: number | null;
  lastError: string | null;
  email: string | null;
  transport: 'imap' | 'ws' | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

export interface EmailMultiInstanceStatus {
  instances: EmailInstanceStatus[];
}

export const DEFAULT_EMAIL_INSTANCE_CONFIG: Partial<EmailInstanceConfig> = {
  enabled: false,
  transport: 'ws',
  agentId: 'main',
  replyMode: 'complete',
  replyTo: 'sender',
  a2aEnabled: true,
  a2aMaxPingPongTurns: 20,
};

export const DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG: EmailMultiInstanceConfig = {
  instances: [],
};

export const MAX_EMAIL_INSTANCES = 20;

// ==================== Common IM Types ====================

export interface IMGatewayConfig {
  qq: QQMultiInstanceConfig;
  wecom: WecomMultiInstanceConfig;
  weixin: WeixinOpenClawConfig;
  email: EmailMultiInstanceConfig;
  settings: IMSettings;
}

export interface IMSettings {
  systemPrompt?: string;
  skillsEnabled: boolean;
  /** Per-platform agent binding. Key = platform name, value = agent ID. Absent or 'main' = default. */
  platformAgentBindings?: Record<string, string>;
}

export interface IMGatewayStatus {
  qq: QQMultiInstanceStatus;
  wecom: WecomMultiInstanceStatus;
  weixin: WeixinGatewayStatus;
  email: EmailMultiInstanceStatus;
}

// ==================== Media Attachment Types ====================

export type IMMediaType = 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker';

export interface IMMediaAttachment {
  type: IMMediaType;
  localPath: string; // 下载后的本地路径
  mimeType: string; // MIME 类型
  fileName?: string; // 原始文件名
  fileSize?: number; // 文件大小（字节）
  width?: number; // 图片/视频宽度
  height?: number; // 图片/视频高度
  duration?: number; // 音视频时长（秒）
}

export interface IMMessage {
  platform: Platform;
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  groupName?: string; // 群名/频道名（用于会话标题）
  content: string;
  chatType: 'direct' | 'group';
  timestamp: number;
  attachments?: IMMediaAttachment[];
  mediaGroupId?: string; // 媒体组 ID（用于合并多张图片）
}

export interface IMReplyContext {
  platform: Platform;
  conversationId: string;
  messageId?: string;
}

// ==================== IM Session Mapping ====================

export interface IMSessionMapping {
  imConversationId: string;
  platform: Platform;
  coworkSessionId: string;
  agentId: string;
  openClawSessionKey?: string;
  createdAt: number;
  lastActiveAt: number;
}

// ==================== IPC Result Types ====================

export interface IMConfigResult {
  success: boolean;
  config?: IMGatewayConfig;
  error?: string;
}

export interface IMStatusResult {
  success: boolean;
  status?: IMGatewayStatus;
  error?: string;
}

export interface IMGatewayResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

// ==================== Connectivity Test Types ====================

export type IMConnectivityVerdict = 'pass' | 'warn' | 'fail';

export type IMConnectivityCheckLevel = 'pass' | 'info' | 'warn' | 'fail';

export type IMConnectivityCheckCode =
  | 'missing_credentials'
  | 'auth_check'
  | 'gateway_running'
  | 'inbound_activity'
  | 'outbound_activity'
  | 'platform_last_error'
  | 'openclaw_gateway_not_running'
  | 'qq_guild_mention_hint'
  | 'qq_mention_hint';

export interface IMConnectivityCheck {
  code: IMConnectivityCheckCode;
  level: IMConnectivityCheckLevel;
  message: string;
  suggestion?: string;
}

export interface IMConnectivityTestResult {
  platform: Platform;
  testedAt: number;
  verdict: IMConnectivityVerdict;
  checks: IMConnectivityCheck[];
}

export interface IMConnectivityTestResponse {
  success: boolean;
  result?: IMConnectivityTestResult;
  error?: string;
}

// ==================== Default Configurations ====================

export const DEFAULT_QQ_CONFIG: QQOpenClawConfig = {
  enabled: false,
  appId: '',
  appSecret: '',
  dmPolicy: 'open',
  allowFrom: [],
  groupPolicy: 'open',
  groupAllowFrom: [],
  historyLimit: 50,
  markdownSupport: true,
  imageServerBaseUrl: '',
  debug: false,
};

export const DEFAULT_QQ_MULTI_INSTANCE_CONFIG: QQMultiInstanceConfig = {
  instances: [],
};

export const DEFAULT_WECOM_CONFIG: WecomOpenClawConfig = {
  enabled: false,
  botId: '',
  secret: '',
  dmPolicy: 'open',
  allowFrom: [],
  groupPolicy: 'open',
  groupAllowFrom: [],
  sendThinkingMessage: true,
  debug: true,
};

export const DEFAULT_WECOM_MULTI_INSTANCE_CONFIG: WecomMultiInstanceConfig = { instances: [] };

export const DEFAULT_WEIXIN_CONFIG: WeixinOpenClawConfig = {
  enabled: false,
  accountId: '',
  dmPolicy: 'open',
  allowFrom: [],
  groupPolicy: 'open',
  groupAllowFrom: [],
  debug: true,
};

export const DEFAULT_IM_SETTINGS: IMSettings = {
  systemPrompt: '',
  skillsEnabled: true,
};

export const DEFAULT_IM_CONFIG: IMGatewayConfig = {
  qq: DEFAULT_QQ_MULTI_INSTANCE_CONFIG,
  wecom: DEFAULT_WECOM_MULTI_INSTANCE_CONFIG,
  weixin: DEFAULT_WEIXIN_CONFIG,
  email: DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG,
  settings: DEFAULT_IM_SETTINGS,
};

export const DEFAULT_QQ_STATUS: QQGatewayStatus = {
  connected: false,
  startedAt: null,
  lastError: null,
  lastInboundAt: null,
  lastOutboundAt: null,
};

export const DEFAULT_WECOM_STATUS: WecomGatewayStatus = {
  connected: false,
  startedAt: null,
  lastError: null,
  botId: null,
  lastInboundAt: null,
  lastOutboundAt: null,
};

export const DEFAULT_WEIXIN_STATUS: WeixinGatewayStatus = {
  connected: false,
  accountId: null,
  startedAt: null,
  lastError: null,
  lastInboundAt: null,
  lastOutboundAt: null,
};

export const DEFAULT_IM_STATUS: IMGatewayStatus = {
  qq: { instances: [] },
  wecom: { instances: [] },
  weixin: DEFAULT_WEIXIN_STATUS,
  email: { instances: [] },
};

// ==================== Media Marker Types ====================

export interface MediaMarker {
  type: 'image' | 'video' | 'audio' | 'file';
  path: string;
  name?: string;
  originalMarker: string;
}
