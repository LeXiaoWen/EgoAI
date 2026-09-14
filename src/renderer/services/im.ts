/**
 * IM Service
 * IPC wrapper for IM gateway operations
 */

import type { Platform } from '@shared/platform';
import { PlatformRegistry } from '@shared/platform';

import { store } from '../store';
import {
  addEmailInstance,
  addQQInstance,
  addWecomInstance,
  removeEmailInstance,
  removeQQInstance,
  removeWecomInstance,
  setConfig,
  setEmailInstanceConfig,
  setError,
  setLoading,
  setQQInstanceConfig,
  setStatus,
  setWecomInstanceConfig,
} from '../store/slices/imSlice';
import type {
  EmailInstanceConfig,
  IMConfigResult,
  IMConnectivityTestResponse,
  IMConnectivityTestResult,
  IMGatewayConfig,
  IMGatewayResult,
  IMGatewayStatus,
  IMStatusResult,
  QQInstanceConfig,
  QQOpenClawConfig,
  WecomInstanceConfig,
  WecomOpenClawConfig,
} from '../types/im';

type IMConfigUpdateOptions = {
  syncGateway?: boolean;
  restartGatewayIfRunning?: boolean;
  markRestartOnSave?: boolean;
  reloadStatus?: boolean;
};

class IMService {
  private statusUnsubscribe: (() => void) | null = null;
  private messageUnsubscribe: (() => void) | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IM service (with concurrency guard to prevent duplicate init)
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    // Set up status change listener
    this.statusUnsubscribe = window.electron.im.onStatusChange((status: IMGatewayStatus) => {
      store.dispatch(setStatus(status));
    });

    // Set up message listener (for logging/monitoring)
    this.messageUnsubscribe = window.electron.im.onMessageReceived((message) => {
      console.log('[IM Service] Message received:', message);
    });

    // Load initial config and status
    await this.loadConfig();
    await this.loadStatus();
  }

  /**
   * Clean up listeners
   */
  destroy(): void {
    if (this.statusUnsubscribe) {
      this.statusUnsubscribe();
      this.statusUnsubscribe = null;
    }
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
      this.messageUnsubscribe = null;
    }
    this.initPromise = null;
  }

  /**
   * Load configuration from main process
   */
  async loadConfig(): Promise<IMGatewayConfig | null> {
    try {
      store.dispatch(setLoading(true));
      const result: IMConfigResult = await window.electron.im.getConfig();
      if (result.success && result.config) {
        store.dispatch(setConfig(result.config));
        return result.config;
      } else {
        store.dispatch(setError(result.error || 'Failed to load IM config'));
        return null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load IM config';
      store.dispatch(setError(message));
      return null;
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  /**
   * Load status from main process
   */
  async loadStatus(): Promise<IMGatewayStatus | null> {
    try {
      const result: IMStatusResult = await window.electron.im.getStatus();
      if (result.success && result.status) {
        store.dispatch(setStatus(result.status));
        return result.status;
      }
      return null;
    } catch (error) {
      console.error('[IM Service] Failed to load status:', error);
      return null;
    }
  }

  /**
   * Persist configuration and optionally trigger gateway sync/restart.
   * Settings edits and settings auth flows default to save-only; non-settings
   * callers can explicitly opt into immediate gateway activation.
   */
  async updateConfig(
    config: Partial<IMGatewayConfig>,
    options: IMConfigUpdateOptions = {},
  ): Promise<boolean> {
    try {
      store.dispatch(setLoading(true));
      const syncGateway = options.syncGateway ?? false;
      const result: IMGatewayResult = await window.electron.im.setConfig(config, {
        syncGateway,
        restartGatewayIfRunning: options.restartGatewayIfRunning ?? syncGateway,
        markRestartOnSave: options.markRestartOnSave,
      });
      if (result.success) {
        // Reload config to get merged values
        await this.loadConfig();
        if (syncGateway || options.reloadStatus) {
          await this.loadStatus();
        }
        return true;
      } else {
        store.dispatch(setError(result.error || 'Failed to update IM config'));
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update IM config';
      store.dispatch(setError(message));
      return false;
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  /**
   * Persist configuration to DB without triggering gateway sync/restart.
   * Used by onBlur handlers to save field values silently.
   */
  async persistConfig(config: Partial<IMGatewayConfig>): Promise<boolean> {
    try {
      const result: IMGatewayResult = await window.electron.im.setConfig(config, { syncGateway: false });
      if (result.success) {
        return true;
      } else {
        console.error('[IM Service] Failed to persist config:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[IM Service] Failed to persist config:', error);
      return false;
    }
  }

  /**
   * Sync IM gateway config if IM-related settings changed.
   * Called from the global Settings Save button.
   */
  async saveAndSyncConfig(): Promise<boolean> {
    try {
      const result: IMGatewayResult = await window.electron.im.syncConfig();
      return result.success;
    } catch (error) {
      console.error('[IM Service] Failed to sync IM config:', error);
      return false;
    }
  }

  /**
   * Start a gateway
   */
  async startGateway(platform: Platform): Promise<boolean> {
    try {
      store.dispatch(setLoading(true));
      store.dispatch(setError(null));
      const result: IMGatewayResult = await window.electron.im.startGateway(platform);
      if (result.success) {
        await this.loadStatus();
        return true;
      } else {
        store.dispatch(setError(result.error || `Failed to start ${platform} gateway`));
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to start ${platform} gateway`;
      store.dispatch(setError(message));
      return false;
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  /**
   * Stop a gateway
   */
  async stopGateway(platform: Platform): Promise<boolean> {
    try {
      store.dispatch(setLoading(true));
      const result: IMGatewayResult = await window.electron.im.stopGateway(platform);
      if (result.success) {
        await this.loadStatus();
        return true;
      } else {
        store.dispatch(setError(result.error || `Failed to stop ${platform} gateway`));
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to stop ${platform} gateway`;
      store.dispatch(setError(message));
      return false;
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  /**
   * Test gateway connectivity and conversation readiness
   */
  async testGateway(
    platform: Platform,
    configOverride?: Partial<IMGatewayConfig>
  ): Promise<IMConnectivityTestResult | null> {
    try {
      store.dispatch(setLoading(true));
      const result: IMConnectivityTestResponse = await window.electron.im.testGateway(platform, configOverride);
      if (result.success && result.result) {
        return result.result;
      }
      store.dispatch(setError(result.error || `Failed to test ${platform} connectivity`));
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to test ${platform} connectivity`;
      store.dispatch(setError(message));
      return null;
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  /**
   * Get current config from store
   */
  getConfig(): IMGatewayConfig {
    return store.getState().im.config;
  }

  /**
   * Get current status from store
   */
  getStatus(): IMGatewayStatus {
    return store.getState().im.status;
  }

  /**
   * Check if any gateway is connected
   */
  isAnyConnected(): boolean {
    const status = this.getStatus();
    return PlatformRegistry.platforms.some(p => {
      const s = status[p];
      if (p === 'qq' || p === 'wecom' || p === 'email') {
        return (s as { instances?: Array<{ connected?: boolean }> })?.instances?.some(i => i.connected);
      }
      return (s as { connected?: boolean })?.connected;
    });
  }

  /**
   * List pending pairing requests and approved allowFrom for a platform
   */
  async listPairingRequests(platform: string) {
    return window.electron.im.listPairingRequests(platform);
  }

  /**
   * Approve a pairing code
   */
  async approvePairingCode(platform: string, code: string) {
    return window.electron.im.approvePairingCode(platform, code);
  }

  /**
   * Reject a pairing request
   */
  async rejectPairingRequest(platform: string, code: string) {
    return window.electron.im.rejectPairingRequest(platform, code);
  }

  // ==================== QQ Multi-Instance Operations ====================

  async addQQInstance(name: string): Promise<QQInstanceConfig | null> {
    try {
      const result = await window.electron.im.addQQInstance(name);
      if (result.success && result.instance) {
        store.dispatch(addQQInstance(result.instance));
        return result.instance;
      }
      console.error('[IM Service] Failed to add QQ instance:', result.error);
      return null;
    } catch (error) {
      console.error('[IM Service] Failed to add QQ instance:', error);
      return null;
    }
  }

  async deleteQQInstance(instanceId: string): Promise<boolean> {
    try {
      const result = await window.electron.im.deleteQQInstance(instanceId);
      if (result.success) {
        store.dispatch(removeQQInstance(instanceId));
        return true;
      }
      console.error('[IM Service] Failed to delete QQ instance:', result.error);
      return false;
    } catch (error) {
      console.error('[IM Service] Failed to delete QQ instance:', error);
      return false;
    }
  }

  async persistQQInstanceConfig(instanceId: string, config: Partial<QQOpenClawConfig>): Promise<boolean> {
    try {
      const result = await window.electron.im.setQQInstanceConfig(instanceId, config, { syncGateway: false });
      if (result.success) {
        store.dispatch(setQQInstanceConfig({ instanceId, config }));
        return true;
      }
      console.error('[IM Service] Failed to persist QQ instance config:', result.error);
      return false;
    } catch (error) {
      console.error('[IM Service] Failed to persist QQ instance config:', error);
      return false;
    }
  }

  async updateQQInstanceConfig(
    instanceId: string,
    config: Partial<QQOpenClawConfig>,
    options: IMConfigUpdateOptions = {},
  ): Promise<boolean> {
    try {
      store.dispatch(setLoading(true));
      const syncGateway = options.syncGateway ?? false;
      const result = await window.electron.im.setQQInstanceConfig(instanceId, config, {
        syncGateway,
        restartGatewayIfRunning: options.restartGatewayIfRunning ?? syncGateway,
        markRestartOnSave: options.markRestartOnSave,
      });
      if (result.success) {
        await this.loadConfig();
        if (syncGateway || options.reloadStatus) {
          await this.loadStatus();
        }
        return true;
      }
      store.dispatch(setError(result.error || 'Failed to update QQ instance config'));
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update QQ instance config';
      store.dispatch(setError(message));
      return false;
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  // ==================== WeCom Multi-Instance Operations ====================

  async addWecomInstance(name: string): Promise<WecomInstanceConfig | null> {
    try {
      const result = await window.electron.im.addWecomInstance(name);
      if (result.success && result.instance) {
        store.dispatch(addWecomInstance(result.instance));
        return result.instance;
      }
      console.error('[IM Service] Failed to add WeCom instance:', result.error);
      return null;
    } catch (error) {
      console.error('[IM Service] Failed to add WeCom instance:', error);
      return null;
    }
  }

  async deleteWecomInstance(instanceId: string): Promise<boolean> {
    try {
      const result = await window.electron.im.deleteWecomInstance(instanceId);
      if (result.success) {
        store.dispatch(removeWecomInstance(instanceId));
        return true;
      }
      console.error('[IM Service] Failed to delete WeCom instance:', result.error);
      return false;
    } catch (error) {
      console.error('[IM Service] Failed to delete WeCom instance:', error);
      return false;
    }
  }

  async persistWecomInstanceConfig(instanceId: string, config: Partial<WecomOpenClawConfig>): Promise<boolean> {
    try {
      const result = await window.electron.im.setWecomInstanceConfig(instanceId, config, { syncGateway: false });
      if (result.success) {
        store.dispatch(setWecomInstanceConfig({ instanceId, config }));
        return true;
      }
      console.error('[IM Service] Failed to persist WeCom instance config:', result.error);
      return false;
    } catch (error) {
      console.error('[IM Service] Failed to persist WeCom instance config:', error);
      return false;
    }
  }

  async updateWecomInstanceConfig(
    instanceId: string,
    config: Partial<WecomOpenClawConfig>,
    options: IMConfigUpdateOptions = {},
  ): Promise<boolean> {
    try {
      store.dispatch(setLoading(true));
      const syncGateway = options.syncGateway ?? false;
      const result = await window.electron.im.setWecomInstanceConfig(instanceId, config, {
        syncGateway,
        restartGatewayIfRunning: options.restartGatewayIfRunning ?? syncGateway,
        markRestartOnSave: options.markRestartOnSave,
      });
      if (result.success) {
        await this.loadConfig();
        if (syncGateway || options.reloadStatus) {
          await this.loadStatus();
        }
        return true;
      }
      store.dispatch(setError(result.error || 'Failed to update WeCom instance config'));
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update WeCom instance config';
      store.dispatch(setError(message));
      return false;
    } finally {
      store.dispatch(setLoading(false));
    }
  }

  // ==================== Email Multi-Instance Operations ====================

  async addEmailInstance(name: string): Promise<EmailInstanceConfig | null> {
    try {
      const result = await window.electron.im.addEmailInstance(name);
      if (result.success && result.instance) {
        store.dispatch(addEmailInstance(result.instance));
        return result.instance;
      }
      console.error('[IM Service] Failed to add email instance:', result.error);
      return null;
    } catch (error) {
      console.error('[IM Service] Failed to add email instance:', error);
      return null;
    }
  }

  async deleteEmailInstance(instanceId: string): Promise<boolean> {
    try {
      const result = await window.electron.im.deleteEmailInstance(instanceId);
      if (result.success) {
        store.dispatch(removeEmailInstance(instanceId));
        return true;
      }
      console.error('[IM Service] Failed to delete email instance:', result.error);
      return false;
    } catch (error) {
      console.error('[IM Service] Failed to delete email instance:', error);
      return false;
    }
  }

  async persistEmailInstanceConfig(instanceId: string, config: Partial<EmailInstanceConfig>): Promise<boolean> {
    try {
      const result: IMGatewayResult = await window.electron.im.setEmailInstanceConfig(
        instanceId,
        config,
        { syncGateway: false },
      );
      if (result.success) {
        store.dispatch(setEmailInstanceConfig({ instanceId, config }));
        return true;
      }
      console.error('[IM Service] Failed to persist email instance config:', result.error);
      return false;
    } catch (error) {
      console.error('[IM Service] Failed to persist email instance config:', error);
      return false;
    }
  }

  async updateEmailInstanceConfig(
    instanceId: string,
    config: Partial<EmailInstanceConfig>,
    options: IMConfigUpdateOptions = {},
  ): Promise<boolean> {
    try {
      store.dispatch(setLoading(true));
      const syncGateway = options.syncGateway ?? false;
      const result: IMGatewayResult = await window.electron.im.setEmailInstanceConfig(
        instanceId,
        config,
        {
          syncGateway,
          restartGatewayIfRunning: options.restartGatewayIfRunning ?? syncGateway,
          markRestartOnSave: options.markRestartOnSave,
        },
      );
      if (result.success) {
        await this.loadConfig();
        if (syncGateway || options.reloadStatus) {
          await this.loadStatus();
        }
        return true;
      }
      store.dispatch(setError(result.error || 'Failed to update email instance config'));
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update email instance config';
      store.dispatch(setError(message));
      return false;
    } finally {
      store.dispatch(setLoading(false));
    }
  }
}

export const imService = new IMService();
