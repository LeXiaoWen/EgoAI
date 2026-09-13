/**
 * IM Gateway Store
 * SQLite operations for IM configuration storage
 */

import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import { PlatformRegistry } from '../../shared/platform';
import {
  DEFAULT_EMAIL_INSTANCE_CONFIG,
  DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG,
  DEFAULT_IM_SETTINGS,
  DEFAULT_QQ_CONFIG,
  DEFAULT_QQ_MULTI_INSTANCE_CONFIG,
  DEFAULT_WECOM_CONFIG,
  DEFAULT_WECOM_MULTI_INSTANCE_CONFIG,
  DEFAULT_WEIXIN_CONFIG,
  EmailInstanceConfig,
  EmailMultiInstanceConfig,
  IMGatewayConfig,
  IMSessionMapping,
  IMSettings,
  Platform,
  QQConfig,
  QQInstanceConfig,
  QQMultiInstanceConfig,
  WecomInstanceConfig,
  WecomMultiInstanceConfig,
  WecomOpenClawConfig,
  WeixinOpenClawConfig,
} from './types';

interface StoredConversationReplyRoute {
  channel: string;
  to: string;
  accountId?: string;
}

interface SessionMappingRow {
  im_conversation_id: string;
  platform: string;
  cowork_session_id: string;
  agent_id: string;
  openclaw_session_key?: string | null;
  created_at: number;
  last_active_at: number;
}

function mapSessionMappingRow(row: SessionMappingRow): IMSessionMapping {
  return {
    imConversationId: row.im_conversation_id,
    platform: row.platform as Platform,
    coworkSessionId: row.cowork_session_id,
    agentId: row.agent_id || 'main',
    ...(row.openclaw_session_key ? { openClawSessionKey: row.openclaw_session_key } : {}),
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

export class IMStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeTables();
    this.migrateDefaults();
  }

  private initializeTables() {
    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS im_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
      )
      .run();

    // IM session mappings table for Cowork mode
    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS im_session_mappings (
        im_conversation_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        cowork_session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'main',
        openclaw_session_key TEXT,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        PRIMARY KEY (im_conversation_id, platform, agent_id)
      );
    `,
      )
      .run();

    // Migration: Add agent_id column to im_session_mappings
    const mappingCols = this.db.pragma('table_info(im_session_mappings)') as Array<{
      name: string;
    }>;
    const mappingColNames = mappingCols.map(r => r.name);
    if (!mappingColNames.includes('agent_id')) {
      this.db
        .prepare("ALTER TABLE im_session_mappings ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'main'")
        .run();
    }
    if (!mappingColNames.includes('openclaw_session_key')) {
      this.db
        .prepare('ALTER TABLE im_session_mappings ADD COLUMN openclaw_session_key TEXT')
        .run();
    }
    this.ensureAgentScopedSessionMappingPrimaryKey(mappingCols);
    this.db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_im_session_mappings_openclaw_session_key ON im_session_mappings(openclaw_session_key) WHERE openclaw_session_key IS NOT NULL',
      )
      .run();
    this.db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_im_session_mappings_cowork_session_id ON im_session_mappings(cowork_session_id)',
      )
      .run();
  }

  private ensureAgentScopedSessionMappingPrimaryKey(
    mappingCols: Array<{ name: string; pk?: number }>,
  ): void {
    const pkCols = mappingCols
      .filter(col => typeof col.pk === 'number' && col.pk > 0)
      .sort((a, b) => (a.pk ?? 0) - (b.pk ?? 0))
      .map(col => col.name);

    // Test fakes and some old sqlite adapters may not expose pk metadata. In
    // that case skip the rebuild; real SQLite returns pk ordinals here.
    if (pkCols.length === 0 || pkCols.includes('agent_id')) {
      return;
    }

    const migrate = this.db.transaction(() => {
      this.db.prepare('DROP TABLE IF EXISTS im_session_mappings_agent_scope_new').run();
      this.db
        .prepare(
          `
        CREATE TABLE im_session_mappings_agent_scope_new (
          im_conversation_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          cowork_session_id TEXT NOT NULL,
          agent_id TEXT NOT NULL DEFAULT 'main',
          openclaw_session_key TEXT,
          created_at INTEGER NOT NULL,
          last_active_at INTEGER NOT NULL,
          PRIMARY KEY (im_conversation_id, platform, agent_id)
        );
      `,
        )
        .run();
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO im_session_mappings_agent_scope_new (
          im_conversation_id,
          platform,
          cowork_session_id,
          agent_id,
          openclaw_session_key,
          created_at,
          last_active_at
        )
        SELECT
          im_conversation_id,
          platform,
          cowork_session_id,
          COALESCE(NULLIF(agent_id, ''), 'main'),
          openclaw_session_key,
          created_at,
          last_active_at
        FROM im_session_mappings;
      `,
        )
        .run();
      this.db.prepare('DROP TABLE im_session_mappings').run();
      this.db
        .prepare('ALTER TABLE im_session_mappings_agent_scope_new RENAME TO im_session_mappings')
        .run();
    });

    migrate();
  }

  /**
   * Migrate existing IM configs to ensure stable defaults.
   */
  private migrateDefaults(): void {
    const platforms = PlatformRegistry.platforms;

    for (const platform of platforms) {
      const row = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get(platform) as
        | { value: string }
        | undefined;
      if (!row) continue;

      try {
        const config = JSON.parse(row.value);
        if (config.debug === undefined || config.debug === false) {
          config.debug = true;
          const now = Date.now();
          this.db
            .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
            .run(JSON.stringify(config), now, platform);
        }
      } catch {
        // Ignore parse errors
      }
    }

    const settingsRow = this.db
      .prepare('SELECT value FROM im_config WHERE key = ?')
      .get('settings') as { value: string } | undefined;
    if (settingsRow) {
      try {
        const settings = JSON.parse(settingsRow.value) as Partial<IMSettings>;
        // Keep IM and desktop behavior aligned: skills auto-routing should be on by default.
        // Historical renderer default could persist `skillsEnabled: false` unintentionally.
        if (settings.skillsEnabled !== true) {
          settings.skillsEnabled = true;
          const now = Date.now();
          this.db
            .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
            .run(JSON.stringify(settings), now, 'settings');
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Migrate old native WeCom config to new OpenClaw format
    const oldWecomRow = this.db
      .prepare('SELECT value FROM im_config WHERE key = ?')
      .get('wecom') as { value: string } | undefined;
    const newWecomRow = this.db
      .prepare('SELECT value FROM im_config WHERE key = ?')
      .get('wecomOpenClaw') as { value: string } | undefined;
    if (oldWecomRow && !newWecomRow) {
      try {
        const oldConfig = JSON.parse(oldWecomRow.value) as Partial<{
          enabled: boolean;
          botId: string;
          secret: string;
          debug: boolean;
        }>;
        if (oldConfig.botId) {
          const newConfig: WecomOpenClawConfig = {
            ...DEFAULT_WECOM_CONFIG,
            enabled: oldConfig.enabled ?? false,
            botId: oldConfig.botId,
            secret: oldConfig.secret ?? '',
            debug: oldConfig.debug ?? true,
          };
          const now = Date.now();
          this.db
            .prepare('INSERT OR REPLACE INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
            .run('wecomOpenClaw', JSON.stringify(newConfig), now);
          this.db.prepare('DELETE FROM im_config WHERE key = ?').run('wecom');
          console.log('[IMStore] Migrated old WeCom config to OpenClaw format');
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Migrate single QQ config to multi-instance format
    const oldQQRow = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get('qq') as
      | { value: string }
      | undefined;
    const existingQQInstances = this.db
      .prepare('SELECT key FROM im_config WHERE key LIKE ?')
      .all('qq:%') as Array<{ key: string }>;
    if (oldQQRow && !existingQQInstances.length) {
      try {
        const oldConfig = JSON.parse(oldQQRow.value) as QQConfig;
        const instanceId = randomUUID();
        const instanceConfig: QQInstanceConfig = {
          ...DEFAULT_QQ_CONFIG,
          ...oldConfig,
          instanceId,
          instanceName: 'QQ Bot 1',
        };
        const now = Date.now();
        this.db
          .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
          .run(`qq:${instanceId}`, JSON.stringify(instanceConfig), now);
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run('qq');
        // Migrate session mappings
        this.db
          .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
          .run(`qq:${instanceId}`, 'qq');
        // Migrate agent bindings
        const settingsRow2 = this.db
          .prepare('SELECT value FROM im_config WHERE key = ?')
          .get('settings') as { value: string } | undefined;
        if (settingsRow2) {
          const settings = JSON.parse(settingsRow2.value) as IMSettings;
          if (settings.platformAgentBindings?.['qq']) {
            settings.platformAgentBindings[`qq:${instanceId}`] =
              settings.platformAgentBindings['qq'];
            delete settings.platformAgentBindings['qq'];
            this.db
              .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
              .run(JSON.stringify(settings), now, 'settings');
          }
        }
        console.log('[IMStore] Migrated single QQ config to multi-instance format');
      } catch {
        // Ignore parse errors
      }
    }

    // Migrate single WeCom config to multi-instance format
    const oldWecomSingleRow = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get('wecomOpenClaw') as
      | { value: string }
      | undefined;
    const existingWecomInstances = this.db
      .prepare('SELECT key FROM im_config WHERE key LIKE ?')
      .all('wecom:%') as Array<{ key: string }>;
    if (oldWecomSingleRow && !existingWecomInstances.length) {
      try {
        const oldConfig = JSON.parse(oldWecomSingleRow.value) as WecomOpenClawConfig;
        const instanceId = randomUUID();
        const instanceConfig: WecomInstanceConfig = {
          ...DEFAULT_WECOM_CONFIG,
          ...oldConfig,
          instanceId,
          instanceName: 'WeCom Bot 1',
        };
        const now = Date.now();
        this.db
          .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
          .run(`wecom:${instanceId}`, JSON.stringify(instanceConfig), now);
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run('wecomOpenClaw');
        // Migrate session mappings
        this.db
          .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
          .run(`wecom:${instanceId}`, 'wecom');
        // Migrate agent bindings
        const settingsRowWecom = this.db
          .prepare('SELECT value FROM im_config WHERE key = ?')
          .get('settings') as { value: string } | undefined;
        if (settingsRowWecom) {
          const settings = JSON.parse(settingsRowWecom.value) as IMSettings;
          if (settings.platformAgentBindings?.['wecom']) {
            settings.platformAgentBindings[`wecom:${instanceId}`] =
              settings.platformAgentBindings['wecom'];
            delete settings.platformAgentBindings['wecom'];
            this.db
              .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
              .run(JSON.stringify(settings), now, 'settings');
          }
        }
        console.log('[IMStore] Migrated single WeCom config to multi-instance format');
      } catch {
        // Ignore parse errors
      }
    }
  }

  private getConfigValue<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (!row) return undefined;
    const value = row.value;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.warn(`Failed to parse im_config value for ${key}`, error);
      return undefined;
    }
  }

  private setConfigValue<T>(key: string, value: T): void {
    const now = Date.now();
    this.db
      .prepare(
        `
      INSERT INTO im_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
      )
      .run(key, JSON.stringify(value), now);
  }

  // ==================== Full Config Operations ====================

  getConfig(): IMGatewayConfig {
    const qqMulti = this.getQQMultiInstanceConfig();
    const wecomMulti = this.getWecomMultiInstanceConfig();
    const weixin = this.getConfigValue<WeixinOpenClawConfig>('weixin') ?? DEFAULT_WEIXIN_CONFIG;
    const settings = this.getConfigValue<IMSettings>('settings') ?? DEFAULT_IM_SETTINGS;
    const email = this.getEmailConfig();

    // Resolve enabled field: default to false for safety
    // User must explicitly enable the service by setting enabled: true
    const resolveEnabled = <T extends { enabled?: boolean }>(stored: T, defaults: T): T => {
      const merged = { ...defaults, ...stored };
      // If enabled is not explicitly set, default to false (safer behavior)
      if (stored.enabled === undefined) {
        return { ...merged, enabled: false };
      }
      return merged;
    };

    return {
      qq: qqMulti,
      wecom: wecomMulti,
      weixin: resolveEnabled(weixin, DEFAULT_WEIXIN_CONFIG),
      email,
      settings: { ...DEFAULT_IM_SETTINGS, ...settings },
    };
  }

  setConfig(config: Partial<IMGatewayConfig>): void {
    if (config.qq) {
      this.setQQMultiInstanceConfig(config.qq);
    }
    if (config.wecom) {
      this.setWecomMultiInstanceConfig(config.wecom);
    }
    if (config.weixin) {
      this.setWeixinConfig(config.weixin);
    }
    if (config.email) {
      this.setEmailConfig(config.email);
    }
    if (config.settings) {
      this.setIMSettings(config.settings);
    }
  }

  // ==================== QQ Multi-Instance Config ====================

  /** @deprecated Use getQQMultiInstanceConfig() or getQQInstances() instead */
  getQQConfig(): QQConfig {
    const stored = this.getConfigValue<QQConfig>('qq');
    return { ...DEFAULT_QQ_CONFIG, ...stored };
  }

  /** @deprecated Use setQQInstanceConfig() instead */
  setQQConfig(config: Partial<QQConfig>): void {
    const current = this.getQQConfig();
    this.setConfigValue('qq', { ...current, ...config });
  }

  getQQInstances(): QQInstanceConfig[] {
    const rows = this.db
      .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
      .all('qq:%') as Array<{ key: string; value: string }>;
    if (!rows.length) return [];
    const instances: QQInstanceConfig[] = [];
    for (const row of rows) {
      try {
        const config = JSON.parse(row.value) as QQInstanceConfig;
        instances.push({ ...DEFAULT_QQ_CONFIG, ...config });
      } catch {
        // Ignore parse errors
      }
    }
    return instances;
  }

  getQQInstanceConfig(instanceId: string): QQInstanceConfig | null {
    const stored = this.getConfigValue<QQInstanceConfig>(`qq:${instanceId}`);
    if (!stored) return null;
    return { ...DEFAULT_QQ_CONFIG, ...stored };
  }

  setQQInstanceConfig(instanceId: string, config: Partial<QQInstanceConfig>): void {
    const current = this.getQQInstanceConfig(instanceId);
    if (current) {
      this.setConfigValue(`qq:${instanceId}`, { ...current, ...config });
    } else {
      this.setConfigValue(`qq:${instanceId}`, {
        ...DEFAULT_QQ_CONFIG,
        instanceId,
        instanceName: config.instanceName || `QQ Bot`,
        ...config,
      });
    }
  }

  deleteQQInstance(instanceId: string): void {
    const now = Date.now();
    this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`qq:${instanceId}`);
    // Clean up session mappings for this instance
    this.db.prepare('DELETE FROM im_session_mappings WHERE platform = ?').run(`qq:${instanceId}`);
    void now;
  }

  getQQMultiInstanceConfig(): QQMultiInstanceConfig {
    const instances = this.getQQInstances();
    if (instances.length === 0) return DEFAULT_QQ_MULTI_INSTANCE_CONFIG;
    return { instances };
  }

  setQQMultiInstanceConfig(config: QQMultiInstanceConfig): void {
    // Write each instance individually
    for (const inst of config.instances) {
      this.setQQInstanceConfig(inst.instanceId, inst);
    }
  }

  // ==================== WeCom Multi-Instance Config ====================

  /** @deprecated Use getWecomMultiInstanceConfig() or getWecomInstances() instead */
  getWecomConfig(): WecomOpenClawConfig {
    const stored = this.getConfigValue<WecomOpenClawConfig>('wecomOpenClaw');
    return { ...DEFAULT_WECOM_CONFIG, ...stored };
  }

  /** @deprecated Use setWecomInstanceConfig() instead */
  setWecomConfig(config: Partial<WecomOpenClawConfig>): void {
    const current = this.getWecomConfig();
    this.setConfigValue('wecomOpenClaw', { ...current, ...config });
  }

  getWecomInstances(): WecomInstanceConfig[] {
    const rows = this.db
      .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
      .all('wecom:%') as Array<{ key: string; value: string }>;
    if (!rows.length) return [];
    const instances: WecomInstanceConfig[] = [];
    for (const row of rows) {
      try {
        const config = JSON.parse(row.value) as WecomInstanceConfig;
        instances.push({ ...DEFAULT_WECOM_CONFIG, ...config });
      } catch {
        // Ignore parse errors
      }
    }
    return instances;
  }

  getWecomInstanceConfig(instanceId: string): WecomInstanceConfig | null {
    const stored = this.getConfigValue<WecomInstanceConfig>(`wecom:${instanceId}`);
    if (!stored) return null;
    return { ...DEFAULT_WECOM_CONFIG, ...stored };
  }

  setWecomInstanceConfig(instanceId: string, config: Partial<WecomInstanceConfig>): void {
    const current = this.getWecomInstanceConfig(instanceId);
    if (current) {
      this.setConfigValue(`wecom:${instanceId}`, { ...current, ...config });
    } else {
      this.setConfigValue(`wecom:${instanceId}`, {
        ...DEFAULT_WECOM_CONFIG,
        instanceId,
        instanceName: config.instanceName || `WeCom Bot`,
        ...config,
      });
    }
  }

  deleteWecomInstance(instanceId: string): void {
    this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`wecom:${instanceId}`);
    // Clean up session mappings for this instance
    this.db.prepare('DELETE FROM im_session_mappings WHERE platform = ?').run(`wecom:${instanceId}`);
  }

  getWecomMultiInstanceConfig(): WecomMultiInstanceConfig {
    const instances = this.getWecomInstances();
    if (instances.length === 0) return DEFAULT_WECOM_MULTI_INSTANCE_CONFIG;
    return { instances };
  }

  setWecomMultiInstanceConfig(config: WecomMultiInstanceConfig): void {
    // Write each instance individually
    for (const inst of config.instances) {
      this.setWecomInstanceConfig(inst.instanceId, inst);
    }
  }

  // ==================== Weixin (微信) ====================

  getWeixinConfig(): WeixinOpenClawConfig {
    const stored = this.getConfigValue<WeixinOpenClawConfig>('weixin');
    return { ...DEFAULT_WEIXIN_CONFIG, ...stored };
  }

  setWeixinConfig(config: Partial<WeixinOpenClawConfig>): void {
    const current = this.getWeixinConfig();
    this.setConfigValue('weixin', { ...current, ...config });
  }

  // ==================== IM Settings ====================

  getIMSettings(): IMSettings {
    const stored = this.getConfigValue<IMSettings>('settings');
    return { ...DEFAULT_IM_SETTINGS, ...stored };
  }

  setIMSettings(settings: Partial<IMSettings>): void {
    const current = this.getIMSettings();
    this.setConfigValue('settings', { ...current, ...settings });
  }

  // ==================== Email Channel Config ====================

  /**
   * Get email channel multi-instance configuration
   */
  getEmailConfig(): EmailMultiInstanceConfig {
    const raw = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get('email') as
      | { value: string }
      | undefined;

    if (!raw?.value) {
      return DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG;
    }

    try {
      const parsed = JSON.parse(raw.value);

      // Migration logic: detect v1 format (single account) and convert to v2 (multi-instance)
      if (parsed.email && !parsed.instances) {
        console.log('[EmailChannel] Migrating from v1 config format');
        return {
          instances: [
            {
              // Defaults first: the migrated v1 fields below must win over them.
              ...DEFAULT_EMAIL_INSTANCE_CONFIG,
              instanceId: 'email-1',
              instanceName: 'Default',
              enabled: parsed.enabled ?? false,
              transport: 'imap',
              email: parsed.email,
              password: parsed.password,
              agentId: 'main',
            },
          ],
        };
      }

      // v2 format: multi-instance mode
      return {
        instances: (parsed.instances || []).map((inst: any) => ({
          ...DEFAULT_EMAIL_INSTANCE_CONFIG,
          ...inst,
        })),
      };
    } catch (error) {
      console.error('[EmailChannel] Failed to parse config:', error);
      return DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG;
    }
  }

  /**
   * Set email channel multi-instance configuration
   */
  setEmailConfig(config: EmailMultiInstanceConfig): void {
    this.setConfigValue('email', config);
  }

  setEmailInstanceConfig(instanceId: string, config: Partial<EmailInstanceConfig>): void {
    const current = this.getEmailConfig();
    const existing = current.instances.find(i => i.instanceId === instanceId);
    if (existing) {
      const updated = current.instances.map(i =>
        i.instanceId === instanceId ? { ...i, ...config } : i,
      );
      this.setEmailConfig({ instances: updated });
    } else {
      this.setEmailConfig({
        instances: [...current.instances, { ...DEFAULT_EMAIL_INSTANCE_CONFIG, ...config, instanceId } as EmailInstanceConfig],
      });
    }
  }

  deleteEmailInstance(instanceId: string): void {
    const current = this.getEmailConfig();
    const updated = current.instances.filter(i => i.instanceId !== instanceId);
    this.setEmailConfig({ instances: updated });
    // Clean up session mappings for this instance
    this.db
      .prepare('DELETE FROM im_session_mappings WHERE platform = ?')
      .run(`email:${instanceId}`);
  }

  // ==================== Utility ====================

  /**
   * Clear all IM configuration
   */
  clearConfig(): void {
    this.db.prepare('DELETE FROM im_config').run();
  }

  // ==================== Notification Target Persistence ====================

  /**
   * Get persisted notification target for a platform
   */
  getNotificationTarget(platform: Platform): any | null {
    return this.getConfigValue<any>(`notification_target:${platform}`) ?? null;
  }

  /**
   * Persist notification target for a platform
   */
  setNotificationTarget(platform: Platform, target: any): void {
    this.setConfigValue(`notification_target:${platform}`, target);
  }

  getConversationReplyRoute(
    platform: Platform,
    conversationId: string,
  ): StoredConversationReplyRoute | null {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
      return null;
    }
    return (
      this.getConfigValue<StoredConversationReplyRoute>(
        `conversation_reply_route:${platform}:${normalizedConversationId}`,
      ) ?? null
    );
  }

  setConversationReplyRoute(
    platform: Platform,
    conversationId: string,
    route: StoredConversationReplyRoute,
  ): void {
    const normalizedConversationId = conversationId.trim();
    if (!normalizedConversationId) {
      return;
    }
    this.setConfigValue(`conversation_reply_route:${platform}:${normalizedConversationId}`, route);
  }

  // ==================== Session Mapping Operations ====================

  /**
   * Get session mapping by IM conversation ID and platform.
   *
   * When agentId is provided, this is an agent-scoped lookup. Calls without
   * agentId keep legacy behavior and return the most recent mapping for the
   * conversation, preferring the main agent when timestamps tie.
   */
  getSessionMapping(
    imConversationId: string,
    platform: Platform,
    agentId?: string,
  ): IMSessionMapping | null {
    const normalizedAgentId = agentId?.trim();
    const row = normalizedAgentId
      ? this.db
        .prepare(
          'SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?',
        )
        .get(imConversationId, platform, normalizedAgentId) as SessionMappingRow | undefined
      : this.db
        .prepare(
          `SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at
           FROM im_session_mappings
           WHERE im_conversation_id = ? AND platform = ?
           ORDER BY last_active_at DESC, CASE WHEN agent_id = 'main' THEN 0 ELSE 1 END
           LIMIT 1`,
        )
        .get(imConversationId, platform) as SessionMappingRow | undefined;
    return row ? mapSessionMappingRow(row) : null;
  }

  /**
   * Find the IM mapping that owns a real OpenClaw channel session key.
   */
  getSessionMappingByOpenClawSessionKey(openClawSessionKey: string): IMSessionMapping | null {
    const normalizedKey = openClawSessionKey.trim();
    if (!normalizedKey) return null;

    const row = this.db
      .prepare(
        'SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings WHERE openclaw_session_key = ? ORDER BY last_active_at DESC LIMIT 1',
      )
      .get(normalizedKey) as SessionMappingRow | undefined;
    return row ? mapSessionMappingRow(row) : null;
  }

  /**
   * Find the IM mapping that owns a given cowork session ID.
   */
  getSessionMappingByCoworkSessionId(coworkSessionId: string): IMSessionMapping | null {
    const row = this.db
      .prepare(
        'SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings WHERE cowork_session_id = ? LIMIT 1',
      )
      .get(coworkSessionId) as SessionMappingRow | undefined;
    return row ? mapSessionMappingRow(row) : null;
  }

  /**
   * Create a new session mapping
   */
  createSessionMapping(
    imConversationId: string,
    platform: Platform,
    coworkSessionId: string,
    agentId: string = 'main',
    openClawSessionKey: string = '',
  ): IMSessionMapping {
    const now = Date.now();
    const normalizedOpenClawSessionKey = openClawSessionKey.trim();
    this.db
      .prepare(
        'INSERT INTO im_session_mappings (im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(imConversationId, platform, coworkSessionId, agentId, normalizedOpenClawSessionKey || null, now, now);
    return {
      imConversationId,
      platform,
      coworkSessionId,
      agentId,
      ...(normalizedOpenClawSessionKey ? { openClawSessionKey: normalizedOpenClawSessionKey } : {}),
      createdAt: now,
      lastActiveAt: now,
    };
  }

  /**
   * Update last active time for a session mapping
   */
  updateSessionLastActive(imConversationId: string, platform: Platform, agentId?: string): void {
    const now = Date.now();
    const normalizedAgentId = agentId?.trim();
    if (normalizedAgentId) {
      this.db
        .prepare(
          'UPDATE im_session_mappings SET last_active_at = ? WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?',
        )
        .run(now, imConversationId, platform, normalizedAgentId);
      return;
    }
    this.db
      .prepare(
        `UPDATE im_session_mappings
         SET last_active_at = ?
         WHERE rowid = (
           SELECT rowid FROM im_session_mappings
           WHERE im_conversation_id = ? AND platform = ?
           ORDER BY last_active_at DESC, CASE WHEN agent_id = 'main' THEN 0 ELSE 1 END
           LIMIT 1
         )`,
      )
      .run(now, imConversationId, platform);
  }

  /**
   * Update the target session and agent for an existing mapping.
   * Used when the platform's agent binding changes.
   */
  updateSessionMappingTarget(
    imConversationId: string,
    platform: Platform,
    newCoworkSessionId: string,
    newAgentId: string,
    newOpenClawSessionKey?: string,
    existingAgentId?: string,
  ): void {
    const now = Date.now();
    const normalizedOpenClawSessionKey = newOpenClawSessionKey?.trim() || null;
    const normalizedExistingAgentId = existingAgentId?.trim();
    if (normalizedExistingAgentId) {
      this.db
        .prepare(
          'UPDATE im_session_mappings SET cowork_session_id = ?, agent_id = ?, openclaw_session_key = COALESCE(?, openclaw_session_key), last_active_at = ? WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?',
        )
        .run(
          newCoworkSessionId,
          newAgentId,
          normalizedOpenClawSessionKey,
          now,
          imConversationId,
          platform,
          normalizedExistingAgentId,
        );
      return;
    }
    this.db
      .prepare(
        `UPDATE im_session_mappings
         SET cowork_session_id = ?, agent_id = ?, openclaw_session_key = COALESCE(?, openclaw_session_key), last_active_at = ?
         WHERE rowid = (
           SELECT rowid FROM im_session_mappings
           WHERE im_conversation_id = ? AND platform = ?
           ORDER BY last_active_at DESC, CASE WHEN agent_id = 'main' THEN 0 ELSE 1 END
           LIMIT 1
         )`,
      )
      .run(newCoworkSessionId, newAgentId, normalizedOpenClawSessionKey, now, imConversationId, platform);
  }

  updateSessionOpenClawSessionKey(
    imConversationId: string,
    platform: Platform,
    openClawSessionKey: string,
    agentId?: string,
  ): void {
    const normalizedKey = openClawSessionKey.trim();
    if (!normalizedKey) {
      return;
    }
    const now = Date.now();
    const normalizedAgentId = agentId?.trim();
    if (normalizedAgentId) {
      this.db
        .prepare(
          'UPDATE im_session_mappings SET openclaw_session_key = ?, last_active_at = ? WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?',
        )
        .run(normalizedKey, now, imConversationId, platform, normalizedAgentId);
      return;
    }
    this.db
      .prepare(
        `UPDATE im_session_mappings
         SET openclaw_session_key = ?, last_active_at = ?
         WHERE rowid = (
           SELECT rowid FROM im_session_mappings
           WHERE im_conversation_id = ? AND platform = ?
           ORDER BY last_active_at DESC, CASE WHEN agent_id = 'main' THEN 0 ELSE 1 END
           LIMIT 1
         )`,
      )
      .run(normalizedKey, now, imConversationId, platform);
  }

  /**
   * Delete a session mapping
   */
  deleteSessionMapping(imConversationId: string, platform: Platform, agentId?: string): void {
    const normalizedAgentId = agentId?.trim();
    if (normalizedAgentId) {
      this.db
        .prepare(
          'DELETE FROM im_session_mappings WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?',
        )
        .run(imConversationId, platform, normalizedAgentId);
      return;
    }
    this.db
      .prepare('DELETE FROM im_session_mappings WHERE im_conversation_id = ? AND platform = ?')
      .run(imConversationId, platform);
  }

  /**
   * Delete all session mappings that reference a given cowork session ID.
   * Called when a cowork session is deleted so that the IM conversation
   * can be re-synced as a fresh session.
   */
  deleteSessionMappingByCoworkSessionId(coworkSessionId: string): void {
    this.db
      .prepare('DELETE FROM im_session_mappings WHERE cowork_session_id = ?')
      .run(coworkSessionId);
  }

  /**
   * List all session mappings for a platform, optionally filtered by IM bot accountId.
   *
   * The accountId is encoded as the first segment of im_conversation_id before
   * the peer subtype suffix (for example "c9c41984:direct:ou_xxx"). Filtering by
   * accountId therefore requires no schema migration.
   */
  listSessionMappings(platform?: Platform, accountId?: string): IMSessionMapping[] {
    let query: string;
    let params: unknown[];

    if (platform && accountId) {
      // Include direct conversations owned by this bot instance (prefix matches accountId)
      // and all group conversations for the platform, since group membership per-bot
      // is not yet stored — group: prefix is a temporary heuristic until im_account_id
      // column is introduced.
      query = `SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at
        FROM im_session_mappings
        WHERE platform = ?
          AND (im_conversation_id LIKE ? OR im_conversation_id LIKE 'group:%')
        ORDER BY last_active_at DESC`;
      params = [platform, `${accountId}:%`];
    } else if (platform) {
      query =
        'SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings WHERE platform = ? ORDER BY last_active_at DESC';
      params = [platform];
    } else {
      query =
        'SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings ORDER BY last_active_at DESC';
      params = [];
    }

    const rows = this.db.prepare(query).all(...params) as SessionMappingRow[];
    return rows.map(mapSessionMappingRow);
  }
}
