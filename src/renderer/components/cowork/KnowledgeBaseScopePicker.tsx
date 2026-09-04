import {
  CheckIcon,
  ChevronDownIcon,
  CircleStackIcon,
  ExclamationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';

import type {
  KnowledgeBaseConnectionConfig,
  WeknoraKnowledgeBaseInfo,
  WeknoraListKnowledgeBasesResult,
} from '../../../shared/weknora/connection';
import type { KnowledgeBaseScope } from '../../../shared/weknora/kbScope';
import { i18nService } from '../../services/i18n';
import {
  getConfiguredKnowledgeBaseConnection,
  listKnowledgeBases,
} from '../../services/knowledgeBase';

interface KnowledgeBaseScopePickerProps {
  value: KnowledgeBaseScope;
  onChange: (next: KnowledgeBaseScope) => void;
  disabled?: boolean;
}

type ListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; items: WeknoraKnowledgeBaseInfo[] }
  | { kind: 'auth' }
  | { kind: 'unreachable' }
  | { kind: 'invalid' }
  | { kind: 'noConnection' };

/**
 * 会话级「知识库范围」选择器（纯客户端方向）。
 *
 * EgoAI 不做知识库管理，只在会话输入处约束问答范围：全部知识库 / 指定单个库 /
 * 不检索。连接配置经 configService 读取（与 main 启用 weknora MCP 同源），选择落到
 * 结构化 KnowledgeBaseScope 交父组件持久化到会话。指定库列表「按需拉取」：同一连接
 * 对象按引用缓存，设置里改连接（新对象）后自然失效。
 */
const KnowledgeBaseScopePicker: React.FC<KnowledgeBaseScopePickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [revealList, setRevealList] = useState(false);
  const [listState, setListState] = useState<ListState>({ kind: 'idle' });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const loadedConnRef = useRef<KnowledgeBaseConnectionConfig | null>(null);

  const showList = open && (revealList || value.mode === 'specific');

  // 打开选择器时的外部点击关闭。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // 指定库列表按需拉取（同一连接引用缓存，失败/成功都只请求一次）。
  useEffect(() => {
    if (!showList || disabled) return;
    const connection = getConfiguredKnowledgeBaseConnection();
    if (!connection) {
      setListState({ kind: 'noConnection' });
      return;
    }
    if (loadedConnRef.current === connection) {
      return;
    }
    let cancelled = false;
    setListState({ kind: 'loading' });
    const request = listKnowledgeBases(connection);
    request.then((result: WeknoraListKnowledgeBasesResult) => {
      if (cancelled) return;
      if (result.ok) {
        loadedConnRef.current = connection;
        setListState({ kind: 'ready', items: result.knowledgeBases });
        return;
      }
      if (result.reason === 'auth') {
        setListState({ kind: 'auth' });
      } else if (result.reason === 'unreachable') {
        setListState({ kind: 'unreachable' });
      } else {
        setListState({ kind: 'invalid' });
      }
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.error('[KnowledgeBaseScopePicker] failed to load list:', error);
      setListState({ kind: 'invalid' });
    });
    return () => {
      cancelled = true;
    };
  }, [showList, disabled]);

  const triggerLabel = ((): string => {
    switch (value.mode) {
      case 'all':
        return i18nService.t('kbScopeModeAll');
      case 'specific':
        return value.kbName?.trim() || i18nService.t('kbScopeModeSpecific');
      default:
        return i18nService.t('kbScopeModeNone');
    }
  })();

  const handleSelectMode = (next: KnowledgeBaseScope): void => {
    setRevealList(false);
    onChange(next);
  };

  const handleOpenSpecificList = (): void => {
    setOpen(true);
    setRevealList(true);
  };

  const handleSelectLibrary = (kb: WeknoraKnowledgeBaseInfo): void => {
    onChange({ mode: 'specific', kbId: kb.id, kbName: kb.name });
  };

  const renderRow = (
    mode: 'none' | 'all' | 'specific',
    label: string,
    onClick: () => void,
  ): React.ReactNode => {
    const isSelected = value.mode === mode;
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-raised ${
          isSelected ? 'text-foreground' : 'text-secondary'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {isSelected && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
      </button>
    );
  };

  const renderLibraryArea = (): React.ReactNode => {
    switch (listState.kind) {
      case 'loading':
        return (
          <p className="px-3 py-2 text-xs text-secondary">{i18nService.t('kbListLoading')}</p>
        );
      case 'noConnection':
        return (
          <p className="px-3 py-2 text-xs text-secondary">{i18nService.t('kbScopeNoConnection')}</p>
        );
      case 'auth':
        return (
          <p className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-500 dark:text-red-400">
            <XCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('kbListLoadAuthError')}
          </p>
        );
      case 'unreachable':
        return (
          <p className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            <ExclamationCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('kbListLoadUnreachable')}
          </p>
        );
      case 'invalid':
        return (
          <p className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-500 dark:text-red-400">
            <XCircleIcon className="h-3.5 w-3.5" />
            {i18nService.t('kbListLoadFailed')}
          </p>
        );
      case 'ready':
        return listState.items.length === 0 ? (
          <p className="px-3 py-2 text-xs text-secondary">{i18nService.t('kbListEmpty')}</p>
        ) : (
          <ul className="max-h-48 overflow-y-auto border-t border-border">
            {listState.items.map((kb) => {
              const isCurrent = value.mode === 'specific' && value.kbId === kb.id;
              return (
                <li key={kb.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectLibrary(kb)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-raised"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{kb.name}</span>
                      <span className="block truncate text-[11px] text-secondary font-mono">{kb.id}</span>
                    </span>
                    {isCurrent && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        );
      default:
        return null;
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 shrink">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`flex h-7 max-w-[180px] items-center gap-1.5 rounded-lg px-2 text-[13px] transition-colors disabled:opacity-50 ${
          open
            ? 'bg-background/80 text-foreground'
            : 'text-secondary hover:bg-background/80 hover:text-foreground'
        }`}
        title={i18nService.t('kbScopeLabel')}
        aria-label={i18nService.t('kbScopeLabel')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CircleStackIcon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-popover">
          <div className="px-3 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-secondary">
            {i18nService.t('kbScopeLabel')}
          </div>
          {renderRow('none', i18nService.t('kbScopeModeNone'), () => handleSelectMode({ mode: 'none' }))}
          {renderRow('all', i18nService.t('kbScopeModeAll'), () => handleSelectMode({ mode: 'all' }))}
          {renderRow(
            'specific',
            i18nService.t('kbScopeModeSpecific'),
            handleOpenSpecificList,
          )}
          {showList && <div className="border-t border-border">{renderLibraryArea()}</div>}
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseScopePicker;
