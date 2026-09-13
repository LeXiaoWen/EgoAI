/**
 * IM Gateway Manager
 * Unified manager for the QQ, WeCom, Weixin and Email channels, which all run
 * through OpenClaw rather than through a native in-process gateway.
 */

import Database from 'better-sqlite3';
import { EventEmitter } from 'events';

import { t } from '../i18n';
import { fetchJsonWithTimeout } from './http';
import { IMStore } from './imStore';
import {
  IMConnectivityCheck,
  IMConnectivityTestResult,
  IMConnectivityVerdict,
  IMGatewayConfig,
  IMGatewayStatus,
  Platform,
} from './types';

const WEIXIN_OPENCLAW_CHANNEL = 'openclaw-weixin';
const WEIXIN_ALREADY_CONNECTED_MESSAGE = '已连接过此 OpenClaw';

const CONNECTIVITY_TIMEOUT_MS = 10_000;
const INBOUND_ACTIVITY_WARN_AFTER_MS = 2 * 60 * 1000;

type GatewayClientLike = {
  request: <T = Record<string, unknown>>(
    method: string,
    params?: unknown,
    opts?: { expectFinal?: boolean },
  ) => Promise<T>;
};

interface WeixinQrLoginStartResult {
  qrDataUrl?: string;
  message: string;
  sessionKey?: string;
}

interface WeixinQrLoginWaitResult {
  connected: boolean;
  message: string;
  accountId?: string;
  alreadyConnected?: boolean;
}

interface OpenClawChannelAccountSnapshot {
  accountId?: unknown;
  running?: unknown;
  configured?: unknown;
  enabled?: unknown;
  lastError?: unknown;
  lastStartAt?: unknown;
  lastInboundAt?: unknown;
  lastOutboundAt?: unknown;
}

interface OpenClawChannelsStatusResult {
  channelAccounts?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isWeixinAlreadyConnectedMessage(message?: string): boolean {
  return Boolean(message?.includes(WEIXIN_ALREADY_CONNECTED_MESSAGE));
}

export interface IMGatewayManagerOptions {
  syncOpenClawConfig?: (
    reason?: string,
    options?: { restartGatewayIfRunning?: boolean },
  ) => Promise<void>;
  ensureOpenClawGatewayConnected?: () => Promise<void>;
  getOpenClawGatewayClient?: () => GatewayClientLike | null;
  ensureOpenClawGatewayReady?: () => Promise<void>;
  getOpenClawSessionKeysForCoworkSession?: (sessionId: string) => string[];
}

export class IMGatewayManager extends EventEmitter {
  private imStore: IMStore;
  private syncOpenClawConfig:
    | ((reason?: string, options?: { restartGatewayIfRunning?: boolean }) => Promise<void>)
    | null = null;
  private ensureOpenClawGatewayConnected: (() => Promise<void>) | null = null;
  private getOpenClawGatewayClient: (() => GatewayClientLike | null) | null = null;
  private ensureOpenClawGatewayReady: (() => Promise<void>) | null = null;
  private getOpenClawSessionKeysForCoworkSession: ((sessionId: string) => string[]) | null = null;

  constructor(db: Database.Database, options?: IMGatewayManagerOptions) {
    super();

    this.imStore = new IMStore(db);

    this.syncOpenClawConfig = options?.syncOpenClawConfig ?? null;
    this.ensureOpenClawGatewayConnected = options?.ensureOpenClawGatewayConnected ?? null;
    this.getOpenClawGatewayClient = options?.getOpenClawGatewayClient ?? null;
    this.ensureOpenClawGatewayReady = options?.ensureOpenClawGatewayReady ?? null;
    this.getOpenClawSessionKeysForCoworkSession = options?.getOpenClawSessionKeysForCoworkSession ?? null;
  }

  /**
   * Reconnect all disconnected gateways
   * Called when network is restored via IPC event
   */
  reconnectAllDisconnected(): void {
    console.log('[IMGatewayManager] Reconnecting all disconnected gateways...');

    // All four channels run inside OpenClaw, which owns its own reconnection
    // and restart behavior; there is no in-process gateway to reconnect.
  }

  // ==================== Configuration ====================

  getConfig(): IMGatewayConfig {
    return this.imStore.getConfig();
  }

  getIMStore(): IMStore {
    return this.imStore;
  }

  /**
   * Persist IM config to SQLite.
   *
   * Every channel runs inside OpenClaw, so there is no in-process gateway to
   * reconfigure here. Pushing the change into OpenClaw is the caller's job:
   * the IPC layer diffs the config fingerprint and calls `syncOpenClawConfig`
   * itself, which is why `options` is accepted but unused.
   */
  setConfig(
    config: Partial<IMGatewayConfig>,
    _options?: { syncGateway?: boolean; restartGatewayIfRunning?: boolean },
  ): void {
    this.imStore.setConfig(config);
  }

  private async restartGateway(platform: Platform): Promise<void> {
    console.log(`[IMGatewayManager] Restarting ${platform} gateway...`);
    await this.stopGateway(platform);
    await this.startGateway(platform);
    console.log(`[IMGatewayManager] ${platform} gateway restarted successfully`);
  }

  // ==================== Status ====================

  /**
   * All four channels run via OpenClaw, so local status can only reflect the
   * configured/enabled state. Live connection state comes from OpenClaw itself
   * via `getStatusWithOpenClawRuntime`.
   */
  getStatus(): IMGatewayStatus {
    const config = this.getConfig();
    return {
      qq: {
        instances: (config.qq?.instances || []).map(inst => ({
          instanceId: inst.instanceId,
          instanceName: inst.instanceName,
          connected: Boolean(inst.enabled && inst.appId && inst.appSecret),
          startedAt: null as number | null,
          lastError: null as string | null,
          lastInboundAt: null as number | null,
          lastOutboundAt: null as number | null,
        })),
      },
      wecom: {
        instances: (config.wecom?.instances || []).map(inst => ({
          instanceId: inst.instanceId,
          instanceName: inst.instanceName,
          connected: Boolean(inst.enabled && inst.botId && inst.secret),
          startedAt: null as number | null,
          lastError: null as string | null,
          botId: inst.botId || null,
          lastInboundAt: null as number | null,
          lastOutboundAt: null as number | null,
        })),
      },
      weixin: {
        connected: Boolean(config.weixin?.enabled),
        accountId: config.weixin?.accountId?.trim() || null,
        startedAt: null as number | null,
        lastError: null as string | null,
        lastInboundAt: null as number | null,
        lastOutboundAt: null as number | null,
      },
      email: {
        instances: (config.email?.instances || []).map(inst => ({
          instanceId: inst.instanceId,
          instanceName: inst.instanceName,
          connected: Boolean(inst.enabled && inst.email),
          startedAt: null as number | null,
          lastError: null as string | null,
          email: inst.email || null,
          transport: inst.transport || null,
          lastInboundAt: null as number | null,
          lastOutboundAt: null as number | null,
        })),
      },
    };
  }

  async getStatusWithOpenClawRuntime(): Promise<IMGatewayStatus> {
    const status = this.getStatus();
    const client = this.getOpenClawGatewayClient?.();
    if (!client) return status;

    try {
      const runtimeStatus = await this.requestOpenClawChannelsStatus(client);
      const weixinAccount = this.pickWeixinAccountSnapshot(runtimeStatus, status.weixin.accountId);
      if (!weixinAccount) return status;

      const configured = weixinAccount.configured === true;
      const running = weixinAccount.running === true;
      const runtimeEnabled = weixinAccount.enabled !== false;
      const localEnabled = this.getConfig().weixin?.enabled === true;
      const accountId = readString(weixinAccount.accountId) ?? status.weixin.accountId ?? null;
      status.weixin = {
        ...status.weixin,
        accountId,
        connected: Boolean(localEnabled && (running || (runtimeEnabled && configured && status.weixin.connected))),
        startedAt: readNumber(weixinAccount.lastStartAt),
        lastError: readString(weixinAccount.lastError),
        lastInboundAt: readNumber(weixinAccount.lastInboundAt),
        lastOutboundAt: readNumber(weixinAccount.lastOutboundAt),
      };
    } catch (error) {
      console.debug('[IMGatewayManager] failed to enrich Weixin status from OpenClaw runtime:', error);
    }

    return status;
  }

  private async requestOpenClawChannelsStatus(
    client: GatewayClientLike,
  ): Promise<OpenClawChannelsStatusResult> {
    return client.request<OpenClawChannelsStatusResult>(
      'channels.status',
      { probe: false, timeoutMs: 2000 },
    );
  }

  private getWeixinAccountSnapshots(
    runtimeStatus: OpenClawChannelsStatusResult,
  ): OpenClawChannelAccountSnapshot[] {
    const rawAccounts = runtimeStatus.channelAccounts?.[WEIXIN_OPENCLAW_CHANNEL];
    if (!Array.isArray(rawAccounts)) return [];

    return rawAccounts
      .filter(isRecord)
      .map((account) => account as OpenClawChannelAccountSnapshot);
  }

  private pickWeixinAccountSnapshot(
    runtimeStatus: OpenClawChannelsStatusResult,
    preferredAccountId?: string | null,
  ): OpenClawChannelAccountSnapshot | null {
    const accounts = this.getWeixinAccountSnapshots(runtimeStatus);
    if (accounts.length === 0) return null;

    const preferred = preferredAccountId?.trim();
    if (preferred) {
      const matched = accounts.find((account) => readString(account.accountId) === preferred);
      if (matched) return matched;
    }

    return accounts.find((account) => account.running === true)
      ?? accounts.find((account) => account.configured === true)
      ?? accounts[0];
  }

  private async resolveWeixinRuntimeAccountId(client: GatewayClientLike): Promise<string | undefined> {
    try {
      const runtimeStatus = await this.requestOpenClawChannelsStatus(client);
      const preferred = this.getConfig().weixin?.accountId;
      const account = this.pickWeixinAccountSnapshot(runtimeStatus, preferred);
      return readString(account?.accountId) ?? undefined;
    } catch (error) {
      console.debug('[IMGatewayManager] failed to resolve Weixin account from OpenClaw runtime:', error);
      return undefined;
    }
  }

  async testGateway(
    platform: Platform,
    configOverride?: Partial<IMGatewayConfig>
  ): Promise<IMConnectivityTestResult> {
    // Every channel runs in OpenClaw mode
    if (platform === 'wecom') {
      return this.testWecomOpenClawConnectivity(configOverride);
    }

    if (platform === 'weixin') {
      return this.testWeixinOpenClawConnectivity(configOverride);
    }

    if (platform === 'qq') {
      return this.testQQOpenClawConnectivity(configOverride);
    }

    // Email connectivity test (IMAP login or WS API key validation)
    if (platform === 'email') {
      return this.testEmailConnectivity(configOverride);
    }

    const config = this.buildMergedConfig(configOverride);
    const checks: IMConnectivityCheck[] = [];
    const testedAt = Date.now();

    const addCheck = (check: IMConnectivityCheck) => {
      checks.push(check);
    };

    const missingCredentials = this.getMissingCredentials(platform, config);
    if (missingCredentials.length > 0) {
      addCheck({
        code: 'missing_credentials',
        level: 'fail',
        message: t('imMissingCredentials', { fields: missingCredentials.join(', ') }),
        suggestion: t('imFillCredentials'),
      });

      return {
        platform,
        testedAt,
        verdict: 'fail',
        checks,
      };
    }

    try {
      const authMessage = await this.withTimeout(
        this.runAuthProbe(platform, config),
        CONNECTIVITY_TIMEOUT_MS,
        t('imAuthProbeTimeout')
      );
      addCheck({
        code: 'auth_check',
        level: 'pass',
        message: authMessage,
      });
    } catch (error: any) {
      addCheck({
        code: 'auth_check',
        level: 'fail',
        message: t('imAuthFailed', { error: error.message }),
        suggestion: t('imAuthFailedSuggestion'),
      });
      return {
        platform,
        testedAt,
        verdict: 'fail',
        checks,
      };
    }

    const status = this.getStatus();
    const p = platform as string;
    let enabled: boolean;
    if (p === 'qq') {
      enabled = config.qq?.instances?.some(i => i.enabled) ?? false;
    } else if (p === 'wecom') {
      enabled = config.wecom?.instances?.some(i => i.enabled) ?? false;
    } else {
      enabled = Boolean((config[platform] as { enabled?: boolean })?.enabled);
    }
    const connected = this.isConnected(platform);

    if (enabled && !connected) {
      addCheck({
        code: 'gateway_running',
        level: 'warn',
        message: t('imChannelEnabledNotConnected'),
        suggestion: t('imChannelEnabledNotConnectedSuggestion'),
      });
    } else {
      addCheck({
        code: 'gateway_running',
        level: connected ? 'pass' : 'info',
        message: connected ? t('imChannelRunning') : t('imChannelNotEnabled'),
        suggestion: connected ? undefined : t('imChannelNotEnabledSuggestion'),
      });
    }

    const startedAt = this.getStartedAtMs(platform, status);
    const lastInboundAt = this.getLastInboundAt(platform, status);
    const lastOutboundAt = this.getLastOutboundAt(platform, status);

    if (connected && startedAt && testedAt - startedAt >= INBOUND_ACTIVITY_WARN_AFTER_MS) {
      if (!lastInboundAt) {
        addCheck({
          code: 'inbound_activity',
          level: 'warn',
          message: t('imNoInboundAfter2Min'),
          suggestion: t('imNoInboundSuggestion'),
        });
      } else {
        addCheck({
          code: 'inbound_activity',
          level: 'pass',
          message: t('imInboundDetected'),
        });
      }
    } else if (connected) {
      addCheck({
        code: 'inbound_activity',
        level: 'info',
        message: t('imGatewayJustStarted'),
      });
    }

    if (connected && lastInboundAt) {
      if (!lastOutboundAt) {
        addCheck({
          code: 'outbound_activity',
          level: 'warn',
          message: t('imNoOutbound'),
          suggestion: t('imNoOutboundSuggestion'),
        });
      } else {
        addCheck({
          code: 'outbound_activity',
          level: 'pass',
          message: t('imOutboundDetected'),
        });
      }
    } else if (connected) {
      addCheck({
        code: 'outbound_activity',
        level: 'info',
        message: t('imNoInboundForOutboundCheck'),
      });
    }

    const lastError = this.getLastError(platform, status);
    if (lastError) {
      addCheck({
        code: 'platform_last_error',
        level: connected ? 'warn' : 'fail',
        message: t('imRecentError', { error: lastError }),
        suggestion: connected
          ? t('imRecentErrorConnectedSuggestion')
          : t('imRecentErrorDisconnectedSuggestion'),
      });
    }

    if (platform === 'qq') {
      addCheck({
        code: 'qq_guild_mention_hint',
        level: 'info',
        message: t('imQqOpenClawHint'),
        suggestion: t('imQqMentionHint'),
      });
    }

    return {
      platform,
      testedAt,
      verdict: this.calculateVerdict(checks),
      checks,
    };
  }

  // ==================== Gateway Control ====================

  async startGateway(platform: Platform): Promise<void> {
    // Channels run inside OpenClaw, so "starting" one means syncing its config
    // into OpenClaw and making sure the gateway is connected.
    console.log(`[IMGatewayManager] ${platform} in OpenClaw mode, syncing config instead of starting a direct gateway`);
    await this.syncOpenClawConfig?.(`im-gateway-start:${platform}`);
    await this.ensureOpenClawGatewayConnected?.();
  }

  async stopGateway(platform: Platform): Promise<void> {
    console.log(`[IMGatewayManager] ${platform} in OpenClaw mode, syncing disabled config`);
    await this.syncOpenClawConfig?.(`im-gateway-stop:${platform}`);
  }

  /**
   * Start all enabled gateways.
   *
   * The channels are batched so that `syncOpenClawConfig` +
   * `ensureOpenClawGatewayConnected` are called only **once** regardless of how
   * many are enabled. This avoids N serial gateway restarts, which cause
   * message loss and rate-limit issues.
   *
   * Email is intentionally absent: its instances are synced when the user saves
   * the instance config, not on startup.
   */
  async startAllEnabled(): Promise<void> {
    const config = this.getConfig();

    const openClawPlatformsToStart: Platform[] = [];

    const qqInstances = config.qq?.instances || [];
    if (qqInstances.some(i => i.enabled && i.appId && i.appSecret)) {
      openClawPlatformsToStart.push('qq');
    }
    const wecomInstances = config.wecom?.instances || [];
    if (wecomInstances.some(i => i.enabled && i.botId && i.secret)) {
      openClawPlatformsToStart.push('wecom');
    }
    if (config.weixin?.enabled) {
      openClawPlatformsToStart.push('weixin');
    }

    if (openClawPlatformsToStart.length > 0) {
      console.log(`[IMGatewayManager] Starting OpenClaw platforms in batch: ${openClawPlatformsToStart.join(', ')}`);
      try {
        await this.syncOpenClawConfig?.(`im-gateway-start-batch:${openClawPlatformsToStart.join(',')}`);
        await this.ensureOpenClawGatewayConnected?.();
      } catch (error: any) {
        console.error(`[IMGatewayManager] Failed to start OpenClaw platforms: ${error.message}`);
      }
    }
  }

  async stopAll(): Promise<void> {
    // All platforms run via OpenClaw; nothing to stop directly
  }

  isAnyConnected(): boolean {
    return false;
  }

  /**
   * Channels run via OpenClaw, so "connected" locally means "enabled and
   * configured". Live connection state comes from `getStatusWithOpenClawRuntime`.
   */
  isConnected(platform: Platform): boolean {
    const config = this.getConfig();
    if (platform === 'qq') {
      return (config.qq?.instances || []).some(i => i.enabled && i.appId && i.appSecret);
    }
    if (platform === 'wecom') {
      return (config.wecom?.instances || []).some(i => i.enabled && i.botId && i.secret);
    }
    if (platform === 'weixin') {
      return Boolean(config.weixin?.enabled);
    }
    if (platform === 'email') {
      return (config.email?.instances || []).some(i => i.enabled && i.email);
    }
    return false;
  }

  private async testWecomOpenClawConnectivity(
    configOverride?: Partial<IMGatewayConfig>
  ): Promise<IMConnectivityTestResult> {
    const checks: IMConnectivityCheck[] = [];
    const testedAt = Date.now();
    const platform: Platform = 'wecom';

    const mergedConfig = this.buildMergedConfig(configOverride);
    const wecomInstances = mergedConfig.wecom?.instances || [];
    const wcConfig = wecomInstances.find(i => i.enabled) || wecomInstances[0];

    // Check 1: Credentials present
    if (!wcConfig?.botId || !wcConfig?.secret) {
      const missing: string[] = [];
      if (!wcConfig?.botId) missing.push('botId');
      if (!wcConfig?.secret) missing.push('secret');
      checks.push({
        code: 'missing_credentials',
        level: 'fail',
        message: t('imMissingCredentials', { fields: missing.join(', ') }),
        suggestion: t('imWecomFillBotIdSecret'),
      });
      return { platform, testedAt, verdict: 'fail', checks };
    }

    // Check 2: Config completeness passes
    checks.push({
      code: 'auth_check',
      level: 'pass',
      message: t('imWecomConfigReady', { botId: wcConfig.botId }),
    });

    // Check 3: OpenClaw Gateway running info
    checks.push({
      code: 'gateway_running',
      level: 'info',
      message: t('imWecomOpenClawHint'),
    });

    const verdict: IMConnectivityVerdict = checks.some(c => c.level === 'fail')
      ? 'fail'
      : checks.some(c => c.level === 'warn')
        ? 'warn'
        : 'pass';

    return { platform, testedAt, verdict, checks };
  }

  private async testWeixinOpenClawConnectivity(
    configOverride?: Partial<IMGatewayConfig>
  ): Promise<IMConnectivityTestResult> {
    const checks: IMConnectivityCheck[] = [];
    const testedAt = Date.now();
    const platform: Platform = 'weixin';

    const mergedConfig = this.buildMergedConfig(configOverride);
    const wxConfig = mergedConfig.weixin;

    // Weixin has no credentials; just check if enabled
    if (!wxConfig?.enabled) {
      checks.push({
        code: 'gateway_running',
        level: 'info',
        message: t('imWeixinNotEnabled'),
        suggestion: t('imWeixinEnableSuggestion'),
      });
      return { platform, testedAt, verdict: 'pass', checks };
    }

    // Config completeness passes (no credentials needed)
    checks.push({
      code: 'auth_check',
      level: 'pass',
      message: t('imWeixinConfigReady'),
    });

    // OpenClaw Gateway running info
    checks.push({
      code: 'gateway_running',
      level: 'info',
      message: t('imWeixinOpenClawHint'),
    });

    const verdict: IMConnectivityVerdict = checks.some(c => c.level === 'fail')
      ? 'fail'
      : checks.some(c => c.level === 'warn')
        ? 'warn'
        : 'pass';

    return { platform, testedAt, verdict, checks };
  }

  /**
   * Start Weixin QR code login via OpenClaw Gateway RPC.
   * Returns the QR code data URL and a session key for polling.
   */
  async weixinQrLoginStart(): Promise<WeixinQrLoginStartResult> {
    const client = this.getOpenClawGatewayClient?.();
    if (!client) {
      await this.ensureOpenClawGatewayReady?.();
      const retryClient = this.getOpenClawGatewayClient?.();
      if (!retryClient) {
        return { message: 'OpenClaw Gateway is not running. Please start OpenClaw engine first.' };
      }
      return this.doWeixinQrLoginStart(retryClient);
    }
    return this.doWeixinQrLoginStart(client);
  }

  private async doWeixinQrLoginStart(client: GatewayClientLike): Promise<WeixinQrLoginStartResult> {
    try {
      const result = await client.request<WeixinQrLoginStartResult>(
        'web.login.start',
        { force: true, timeoutMs: 300000, verbose: true },
      );
      console.log('[IMGatewayManager] Weixin QR login start result:', result.message);
      return result;
    } catch (err) {
      console.error('[IMGatewayManager] Weixin QR login start failed:', err);
      return { message: `Failed to start Weixin login: ${String(err)}` };
    }
  }

  /**
   * Wait for Weixin QR code scan completion via OpenClaw Gateway RPC.
   */
  async weixinQrLoginWait(sessionKey?: string): Promise<WeixinQrLoginWaitResult> {
    const client = this.getOpenClawGatewayClient?.();
    if (!client) {
      return { connected: false, message: 'OpenClaw Gateway is not connected.' };
    }
    try {
      const result = await client.request<WeixinQrLoginWaitResult>(
        'web.login.wait',
        // OpenClaw's current web.login.wait schema has no sessionKey field, so
        // the QR flow still has to pass the plugin session key through accountId.
        { timeoutMs: 480000, ...(sessionKey ? { accountId: sessionKey } : {}) },
      );
      const alreadyConnected = result.alreadyConnected === true
        || isWeixinAlreadyConnectedMessage(result.message);
      const configuredAccountId = this.getConfig().weixin?.accountId?.trim() || undefined;
      const resolvedAccountId = result.accountId
        ?? (alreadyConnected ? configuredAccountId ?? await this.resolveWeixinRuntimeAccountId(client) : undefined);
      console.log('[IMGatewayManager] Weixin QR login wait completed:', JSON.stringify({
        connected: result.connected,
        alreadyConnected,
        accountId: resolvedAccountId,
      }));
      if (result.connected || alreadyConnected) {
        if (resolvedAccountId) {
          this.setConfig({
            weixin: {
              ...this.getConfig().weixin,
              enabled: true,
              accountId: resolvedAccountId,
            },
          }, { syncGateway: false });
        }
        // Keep QR login consistent with Settings save semantics: persist the
        // account locally, then let the global Save action apply IM config to
        // OpenClaw and restart the gateway once if the fingerprint changed.
      }
      return {
        ...result,
        alreadyConnected,
        accountId: resolvedAccountId,
      };
    } catch (err) {
      console.error('[IMGatewayManager] Weixin QR login wait failed:', err);
      return { connected: false, message: `Login failed: ${String(err)}` };
    }
  }

  private async testQQOpenClawConnectivity(
    configOverride?: Partial<IMGatewayConfig>
  ): Promise<IMConnectivityTestResult> {
    const checks: IMConnectivityCheck[] = [];
    const testedAt = Date.now();
    const platform: Platform = 'qq';

    const mergedConfig = this.buildMergedConfig(configOverride);
    const qqInstances = mergedConfig.qq?.instances || [];
    const qqConfig = qqInstances.find(i => i.enabled) || qqInstances[0];

    // Check 1: Credentials present
    if (!qqConfig?.appId || !qqConfig?.appSecret) {
      const missing: string[] = [];
      if (!qqConfig?.appId) missing.push('appId');
      if (!qqConfig?.appSecret) missing.push('appSecret');
      checks.push({
        code: 'missing_credentials',
        level: 'fail',
        message: t('imMissingCredentials', { fields: missing.join(', ') }),
        suggestion: t('imQqFillAppIdSecret'),
      });
      return { platform, testedAt, verdict: 'fail', checks };
    }

    // Check 2: Auth probe via QQ Bot API
    try {
      const tokenResponse = await this.withTimeout(
        fetchJsonWithTimeout<{ access_token?: string; expires_in?: number; code?: number; message?: string }>(
          'https://bots.qq.com/app/getAppAccessToken',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appId: qqConfig.appId, clientSecret: qqConfig.appSecret }),
          },
          CONNECTIVITY_TIMEOUT_MS
        ),
        CONNECTIVITY_TIMEOUT_MS,
        t('imAuthProbeTimeout')
      );
      if (!tokenResponse.access_token) {
        throw new Error(tokenResponse.message || t('imQqAccessTokenFailed'));
      }
      checks.push({
        code: 'auth_check',
        level: 'pass',
        message: t('imQqAuthPassed'),
      });
    } catch (error: any) {
      checks.push({
        code: 'auth_check',
        level: 'fail',
        message: t('imQqAuthFailed', { error: error.message }),
        suggestion: t('imQqCheckAppIdSecret'),
      });
      return { platform, testedAt, verdict: 'fail', checks };
    }

    // Check 3: OpenClaw Gateway running info
    checks.push({
      code: 'gateway_running',
      level: 'info',
      message: t('imQqOpenClawHint'),
    });

    // Check 4: Mention hint
    checks.push({
      code: 'qq_mention_hint',
      level: 'info',
      message: t('imQqMentionHint'),
    });

    const verdict: IMConnectivityVerdict = checks.some(c => c.level === 'fail')
      ? 'fail'
      : checks.some(c => c.level === 'warn')
        ? 'warn'
        : 'pass';

    return { platform, testedAt, verdict, checks };
  }

  private buildMergedConfig(configOverride?: Partial<IMGatewayConfig>): IMGatewayConfig {
    const current = this.getConfig();
    if (!configOverride) {
      return current;
    }
    return {
      ...current,
      ...configOverride,
      qq: configOverride.qq || current.qq,
      wecom: configOverride.wecom || current.wecom,
      weixin: { ...current.weixin, ...(configOverride.weixin || {}) },
      email: { ...current.email, ...(configOverride.email || {}) },
      settings: { ...current.settings, ...(configOverride.settings || {}) },
    };
  }

  private getMissingCredentials(platform: Platform, config: IMGatewayConfig): string[] {
    if (platform === 'email') {
      const emailInstances = config.email?.instances || [];
      const emInst = emailInstances.find(i => i.enabled);
      if (!emInst) return ['email'];
      const fields: string[] = [];
      if (!emInst.email) fields.push('email');
      if (emInst.transport === 'ws') {
        if (!emInst.apiKey) fields.push('apiKey');
      } else if (!emInst.password) {
        fields.push('password');
      }
      return fields;
    }
    if (platform === 'qq') {
      const qqInstances = config.qq?.instances || [];
      const qqInst = qqInstances.find(i => i.enabled);
      if (!qqInst) return ['appId', 'appSecret'];
      const fields: string[] = [];
      if (!qqInst.appId) fields.push('appId');
      if (!qqInst.appSecret) fields.push('appSecret');
      return fields;
    }
    if (platform === 'wecom') {
      const wecomInstances = config.wecom?.instances || [];
      const wcInst = wecomInstances.find(i => i.enabled);
      if (!wcInst) return ['botId', 'secret'];
      const fields: string[] = [];
      if (!wcInst.botId) fields.push('botId');
      if (!wcInst.secret) fields.push('secret');
      return fields;
    }
    if (platform === 'weixin') {
      // Weixin has no credentials; nothing to check
      return [];
    }
    return [];
  }

  private async runAuthProbe(platform: Platform, config: IMGatewayConfig): Promise<string> {
    // Email never reaches this probe: `testGateway` routes it to
    // `testEmailConnectivity`, which performs the IMAP/WS check itself.
    if (platform === 'wecom') {
      const wecomInstances = config.wecom?.instances || [];
      const wcInst = wecomInstances.find(i => i.enabled && i.botId && i.secret);
      if (!wcInst) {
        throw new Error(t('imConfigIncomplete'));
      }
      return t('imWecomConfigReadyOpenClaw', { botId: wcInst.botId });

    }

    if (platform === 'weixin') {
      // Weixin has no credentials to probe; just confirm enabled
      return t('imWeixinConfigReadyOpenClaw');
    }

    if (platform === 'qq') {
      const qqInstances = config.qq?.instances || [];
      const qqInst = qqInstances.find(i => i.enabled && i.appId && i.appSecret);
      if (!qqInst) {
        throw new Error(t('imConfigIncomplete'));
      }
      const { appId, appSecret } = qqInst;
      // Verify credentials by requesting an AccessToken directly via HTTP
      // This avoids starting a full WebSocket connection just for auth check
      const tokenResponse = await fetchJsonWithTimeout<{ access_token?: string; expires_in?: number; code?: number; message?: string }>(
        'https://bots.qq.com/app/getAppAccessToken',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId, clientSecret: appSecret }),
        },
        CONNECTIVITY_TIMEOUT_MS
      );
      if (!tokenResponse.access_token) {
        throw new Error(tokenResponse.message || t('imQqAccessTokenFailed'));
      }
      return t('imQqAuthPassed');
    }

    return t('imUnknownPlatform');
  }

  /**
   * Fetch the OpenClaw config schema (JSON Schema + uiHints) from the gateway.
   * Returns { schema, uiHints } or null if the gateway is unavailable.
   */
  async getOpenClawConfigSchema(): Promise<{ schema: Record<string, unknown>; uiHints: Record<string, Record<string, unknown>> } | null> {
    try {
      return await this.requestOpenClawGateway<{ schema: Record<string, unknown>; uiHints: Record<string, Record<string, unknown>> }>('config.schema', {});
    } catch (err: any) {
      console.warn('[IMGatewayManager] Failed to fetch config.schema from OpenClaw gateway:', err.message);
      return null;
    }
  }

  private async requestOpenClawGateway<T = Record<string, unknown>>(
    method: string,
    params?: unknown,
  ): Promise<T> {
    let client = this.getOpenClawGatewayClient?.() ?? null;
    if (!client) {
      await this.ensureOpenClawGatewayReady?.();
      client = this.getOpenClawGatewayClient?.() ?? null;
    }
    if (!client) {
      throw new Error('OpenClaw gateway client is unavailable.');
    }
    return client.request<T>(method, params);
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * Resolve the status record that holds the liveness fields for a channel.
   * Weixin is a single-account channel whose status is flat; the other three
   * expose an `instances` array, and the first instance is the one reported.
   */
  private getChannelStatusEntry(
    platform: Platform,
    status: IMGatewayStatus,
  ): { startedAt?: number | null; lastInboundAt?: number | null; lastOutboundAt?: number | null; lastError?: string | null } | undefined {
    if (platform === 'weixin') {
      return status.weixin;
    }
    return status[platform]?.instances?.[0];
  }

  private getStartedAtMs(platform: Platform, status: IMGatewayStatus): number | null {
    return this.getChannelStatusEntry(platform, status)?.startedAt ?? null;
  }

  private getLastInboundAt(platform: Platform, status: IMGatewayStatus): number | null {
    return this.getChannelStatusEntry(platform, status)?.lastInboundAt ?? null;
  }

  private getLastOutboundAt(platform: Platform, status: IMGatewayStatus): number | null {
    return this.getChannelStatusEntry(platform, status)?.lastOutboundAt ?? null;
  }

  private getLastError(platform: Platform, status: IMGatewayStatus): string | null {
    return this.getChannelStatusEntry(platform, status)?.lastError ?? null;
  }

  private calculateVerdict(checks: IMConnectivityCheck[]): IMConnectivityVerdict {
    if (checks.some((check) => check.level === 'fail')) {
      return 'fail';
    }
    if (checks.some((check) => check.level === 'warn')) {
      return 'warn';
    }
    return 'pass';
  }

  private async testEmailConnectivity(
    configOverride?: Partial<IMGatewayConfig>,
  ): Promise<IMConnectivityTestResult> {
    const checks: IMConnectivityCheck[] = [];
    const testedAt = Date.now();
    const platform: Platform = 'email';

    const mergedConfig = this.buildMergedConfig(configOverride);
    const emailInstances = mergedConfig.email?.instances || [];
    const inst = emailInstances.find(i => i.enabled) || emailInstances[0];

    if (!inst) {
      checks.push({
        code: 'missing_credentials',
        level: 'fail',
        message: t('imMissingCredentials', { fields: 'email' }),
      });
      return { platform, testedAt, verdict: 'fail', checks };
    }

    if (!inst.email) {
      checks.push({
        code: 'missing_credentials',
        level: 'fail',
        message: t('imMissingCredentials', { fields: 'email address' }),
      });
      return { platform, testedAt, verdict: 'fail', checks };
    }

    if (inst.transport === 'imap') {
      // IMAP mode: test IMAP login via raw TLS socket
      const missing: string[] = [];
      if (!inst.password) missing.push('password');
      if (!inst.imapHost) missing.push('IMAP host');
      if (missing.length > 0) {
        checks.push({
          code: 'missing_credentials',
          level: 'fail',
          message: t('imMissingCredentials', { fields: missing.join(', ') }),
        });
        return { platform, testedAt, verdict: 'fail', checks };
      }

      try {
        const tls = await import('tls');
        await new Promise<void>((resolve, reject) => {
          let greeted = false;
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              socket.destroy();
              reject(new Error(t('imAuthProbeTimeout')));
            }
          }, CONNECTIVITY_TIMEOUT_MS);

          const socket = tls.connect({
            host: inst.imapHost,
            port: inst.imapPort || 993,
            rejectUnauthorized: true,
          });

          let buffer = '';
          socket.on('data', (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split('\r\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line) continue;

              // Wait for server greeting before sending LOGIN
              if (!greeted && line.startsWith('* OK')) {
                greeted = true;
                const tag = 'A001';
                const loginCmd = `${tag} LOGIN "${inst.email}" "${inst.password}"\r\n`;
                socket.write(loginCmd);
                continue;
              }

              // Check LOGIN response
              if (greeted && line.startsWith('A001')) {
                clearTimeout(timer);
                socket.destroy();
                if (!settled) {
                  settled = true;
                  if (line.includes('OK')) {
                    resolve();
                  } else {
                    reject(new Error(line.replace(/^A001\s*/, '')));
                  }
                }
                return;
              }
            }
          });

          socket.on('error', (err: Error) => {
            clearTimeout(timer);
            if (!settled) { settled = true; reject(err); }
          });
          socket.on('close', () => {
            clearTimeout(timer);
            if (!settled) { settled = true; reject(new Error('Connection closed')); }
          });
        });
        checks.push({
          code: 'auth_check',
          level: 'pass',
          message: t('imEmailImapAuthPassed'),
        });
      } catch (error: any) {
        checks.push({
          code: 'auth_check',
          level: 'fail',
          message: `${t('imEmailImapAuthFailed')}: ${error.message}`,
          suggestion: t('imAuthFailedSuggestion'),
        });
        return { platform, testedAt, verdict: 'fail', checks };
      }
    } else if (inst.transport === 'ws') {
      // WS mode: validate API Key by exchanging for IM token
      if (!inst.apiKey) {
        checks.push({
          code: 'missing_credentials',
          level: 'fail',
          message: t('imMissingCredentials', { fields: 'API Key' }),
        });
        return { platform, testedAt, verdict: 'fail', checks };
      }

      try {
        const result = await this.withTimeout(
          fetchJsonWithTimeout<{ success?: boolean; message?: string; code?: number }>(
            'https://claw.163.com/claw-api-gateway/open/v1/mail/auth/im-token',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${inst.apiKey}`,
              },
              body: JSON.stringify({ uid: inst.email }),
            },
            CONNECTIVITY_TIMEOUT_MS,
          ),
          CONNECTIVITY_TIMEOUT_MS,
          t('imAuthProbeTimeout'),
        );
        if (!result.success) {
          throw new Error(result.message || `API returned code ${result.code}`);
        }
        checks.push({
          code: 'auth_check',
          level: 'pass',
          message: t('imEmailWsAuthPassed'),
        });
      } catch (error: any) {
        checks.push({
          code: 'auth_check',
          level: 'fail',
          message: `${t('imAuthFailed', { error: error.message })}`,
          suggestion: t('imAuthFailedSuggestion'),
        });
        return { platform, testedAt, verdict: 'fail', checks };
      }
    }

    // Gateway running status
    const status = this.getStatus();
    const emailStatus = status.email?.instances?.find(
      (s: { instanceId: string }) => s.instanceId === inst.instanceId,
    );
    const connected = emailStatus?.connected ?? false;

    if (inst.enabled && !connected) {
      checks.push({
        code: 'gateway_running',
        level: 'warn',
        message: t('imChannelEnabledNotConnected'),
        suggestion: t('imChannelEnabledNotConnectedSuggestion'),
      });
    } else {
      checks.push({
        code: 'gateway_running',
        level: connected ? 'pass' : 'info',
        message: connected ? t('imChannelRunning') : t('imChannelNotEnabled'),
      });
    }

    return { platform, testedAt, verdict: this.calculateVerdict(checks), checks };
  }
}
