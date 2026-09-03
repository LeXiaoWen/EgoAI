import { CheckCircleIcon, ExclamationCircleIcon, SignalIcon, XCircleIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';

import type { KnowledgeBaseConnectionConfig } from '../../../shared/weknora/connection';
import { i18nService } from '../../services/i18n';

interface KnowledgeBaseConnectionSectionProps {
  value: KnowledgeBaseConnectionConfig;
  onChange: (next: KnowledgeBaseConnectionConfig) => void;
}

type TestStatus =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok' }
  | { kind: 'auth' }
  | { kind: 'unreachable' }
  | { kind: 'invalid' };

/**
 * 「知识库连接」设置区（纯客户端方向）。
 *
 * EgoAI 不再内嵌 WeKnora：建库/上传/解析等管理都在用户自备实例的 Web UI 完成，
 * 这里只保存 { baseUrl, apiKey } 一条连接，喂给内置 weknora MCP。测试连接走
 * 专用 IPC（不做通用 api:fetch），按钮与状态文案沿用既有 connection-test 风格。
 */
const KnowledgeBaseConnectionSection: React.FC<KnowledgeBaseConnectionSectionProps> = ({
  value,
  onChange,
}) => {
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' });

  const apiKeyMissing = value.apiKey.trim().length === 0;
  const baseUrlMissing = value.baseUrl.trim().length === 0;
  const isTesting = testStatus.kind === 'testing';

  const update = (patch: Partial<KnowledgeBaseConnectionConfig>) => {
    setTestStatus({ kind: 'idle' });
    onChange({ ...value, ...patch });
  };

  const handleTestConnection = async (): Promise<void> => {
    if (isTesting) return;
    setTestStatus({ kind: 'testing' });
    try {
      const result = await window.electron.knowledgeBase.testConnection({
        baseUrl: value.baseUrl,
        apiKey: value.apiKey,
      });
      if (result.ok) {
        setTestStatus({ kind: 'ok' });
        return;
      }
      switch (result.reason) {
        case 'auth':
          setTestStatus({ kind: 'auth' });
          break;
        case 'unreachable':
          setTestStatus({ kind: 'unreachable' });
          break;
        default:
          setTestStatus({ kind: 'invalid' });
          break;
      }
    } catch (error) {
      console.error('[KnowledgeBase] test connection failed:', error);
      setTestStatus({ kind: 'invalid' });
    }
  };

  const renderTestFeedback = (): React.ReactNode | null => {
    switch (testStatus.kind) {
      case 'ok':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
            <CheckCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('connectionSuccess')}
          </span>
        );
      case 'auth':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 dark:text-red-400">
            <XCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('kbConnectionTestAuthError')}
          </span>
        );
      case 'unreachable':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <ExclamationCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('kbConnectionTestUnreachable')}
          </span>
        );
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 dark:text-red-400">
            <XCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('connectionFailed')}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">
          {i18nService.t('kbConnectionTitle')}
        </div>
        <div className="text-xs text-secondary">
          {i18nService.t('kbConnectionTitleHint')}
        </div>
      </div>

      <div className="space-y-3 pt-1">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            {i18nService.t('kbConnectionBaseUrlLabel')}
          </label>
          <input
            type="text"
            value={value.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="http://127.0.0.1:8080"
            spellCheck={false}
            className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
          />
          <p className="mt-1 text-xs text-secondary">
            {i18nService.t('kbConnectionBaseUrlHint')}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            {i18nService.t('kbConnectionApiKeyLabel')}
          </label>
          <input
            type="password"
            value={value.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            spellCheck={false}
            className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
          />
          <p className="mt-1 text-xs text-secondary">
            {i18nService.t('kbConnectionApiKeyHint')}
          </p>
        </div>

        <p className="text-xs leading-5 text-secondary">
          {i18nService.t('kbConnectionExternalUiHint')}
        </p>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => { void handleTestConnection(); }}
            disabled={isTesting || baseUrlMissing || apiKeyMissing}
            title={apiKeyMissing ? i18nService.t('testConnectionRequiresApiKey') : undefined}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SignalIcon className="h-3.5 w-3.5 mr-1.5" />
            {isTesting ? i18nService.t('testing') : i18nService.t('testConnection')}
          </button>
          {!isTesting && renderTestFeedback()}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseConnectionSection;
