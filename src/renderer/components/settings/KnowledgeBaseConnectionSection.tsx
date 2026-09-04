import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon, ListBulletIcon, SignalIcon, XCircleIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';

import type {
  KnowledgeBaseConnectionConfig,
  WeknoraKnowledgeBaseInfo,
} from '../../../shared/weknora/connection';
import { i18nService } from '../../services/i18n';
import { listKnowledgeBases } from '../../services/knowledgeBase';

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

type ListStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
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
  const [listStatus, setListStatus] = useState<ListStatus>({ kind: 'idle' });
  const [knowledgeBases, setKnowledgeBases] = useState<WeknoraKnowledgeBaseInfo[]>([]);

  const apiKeyMissing = value.apiKey.trim().length === 0;
  const baseUrlMissing = value.baseUrl.trim().length === 0;
  const isTesting = testStatus.kind === 'testing';
  const isListing = listStatus.kind === 'loading';

  const update = (patch: Partial<KnowledgeBaseConnectionConfig>) => {
    setTestStatus({ kind: 'idle' });
    setListStatus({ kind: 'idle' });
    setKnowledgeBases([]);
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

  const handleListKnowledgeBases = async (): Promise<void> => {
    if (isTesting || isListing) return;
    setListStatus({ kind: 'loading' });
    setKnowledgeBases([]);
    try {
      const result = await listKnowledgeBases({ baseUrl: value.baseUrl, apiKey: value.apiKey });
      if (result.ok) {
        setKnowledgeBases(result.knowledgeBases);
        setListStatus({ kind: 'ready' });
        return;
      }
      switch (result.reason) {
        case 'auth':
          setListStatus({ kind: 'auth' });
          break;
        case 'unreachable':
          setListStatus({ kind: 'unreachable' });
          break;
        default:
          setListStatus({ kind: 'invalid' });
          break;
      }
    } catch (error) {
      console.error('[KnowledgeBase] list knowledge bases failed:', error);
      setListStatus({ kind: 'invalid' });
    }
  };

  const renderListFeedback = (): React.ReactNode | null => {
    switch (listStatus.kind) {
      case 'auth':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 dark:text-red-400">
            <XCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('kbListLoadAuthError')}
          </span>
        );
      case 'unreachable':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            <ExclamationCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('kbListLoadUnreachable')}
          </span>
        );
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 dark:text-red-400">
            <XCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('kbListLoadFailed')}
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
            disabled={isTesting || isListing || baseUrlMissing || apiKeyMissing}
            title={apiKeyMissing ? i18nService.t('testConnectionRequiresApiKey') : undefined}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SignalIcon className="h-3.5 w-3.5 mr-1.5" />
            {isTesting ? i18nService.t('testing') : i18nService.t('testConnection')}
          </button>
          {!isTesting && renderTestFeedback()}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => { void handleListKnowledgeBases(); }}
            disabled={isTesting || isListing || baseUrlMissing || apiKeyMissing}
            title={apiKeyMissing ? i18nService.t('testConnectionRequiresApiKey') : undefined}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ListBulletIcon className="h-3.5 w-3.5 mr-1.5" />
            {isListing ? i18nService.t('kbListLoading') : i18nService.t('kbListButton')}
          </button>
          {!isListing && renderListFeedback()}
          {!isListing && listStatus.kind === 'ready' && (
            <button
              type="button"
              onClick={() => { void handleListKnowledgeBases(); }}
              className="inline-flex items-center px-2 py-1.5 text-xs font-medium rounded-lg text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <ArrowPathIcon className="h-3.5 w-3.5 mr-1" />
              {i18nService.t('kbListRefresh')}
            </button>
          )}
        </div>

        {listStatus.kind === 'ready' && (
          <div className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2">
            {knowledgeBases.length === 0 ? (
              <p className="text-xs text-secondary">{i18nService.t('kbListEmpty')}</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {knowledgeBases.map((kb) => (
                  <li key={kb.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-foreground truncate">{kb.name}</span>
                    <span className="text-[11px] text-secondary font-mono shrink-0">{kb.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBaseConnectionSection;
