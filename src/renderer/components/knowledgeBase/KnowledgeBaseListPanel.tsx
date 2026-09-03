import React, { useCallback, useEffect, useState } from 'react';

import type { KnowledgeBase } from '../../../shared/weknora/types';
import { i18nService } from '../../services/i18n';
import { weknoraService } from '../../services/weknora';
import {
  MANAGEMENT_BODY_TEXT,
  MANAGEMENT_META_TEXT,
  MANAGEMENT_TITLE_TEXT,
} from '../common/managementTypography';
import Modal from '../common/Modal';
import ErrorMessage from '../ErrorMessage';
import FolderIcon from '../icons/FolderIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import TrashIcon from '../icons/TrashIcon';

interface KnowledgeBaseListPanelProps {
  onOpen: (kb: KnowledgeBase) => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm rounded-lg bg-background text-foreground placeholder-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary';
const LABEL_CLASS = 'text-xs font-semibold tracking-wide text-secondary';

const KnowledgeBaseListPanel: React.FC<KnowledgeBaseListPanelProps> = ({ onOpen }) => {
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await weknoraService.listKnowledgeBases();
    setLoading(false);
    if (res.success) setItems(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setDescription('');
    setError(null);
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (creating) return;
    setShowCreate(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    const res = await weknoraService.createKnowledgeBase({
      name: name.trim(),
      description: description.trim(),
    });
    setCreating(false);
    if (res.success) {
      setShowCreate(false);
      await load();
    } else {
      setError(res.error);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);
    const res = await weknoraService.deleteKnowledgeBase(deleteTarget.id);
    setDeleting(false);
    if (res.success) {
      setDeleteTarget(null);
      await load();
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="relative space-y-4">
      <div className="flex items-start justify-between gap-3 pb-2">
        <p className={`${MANAGEMENT_BODY_TEXT} text-secondary`}>
          {i18nService.t('knowledgeBaseListDescription')}
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-raised"
        >
          <PlusCircleIcon className="h-4 w-4" />
          <span>{i18nService.t('knowledgeBaseCreateButton')}</span>
        </button>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

      {loading ? (
        <div className="py-12 text-center text-sm text-secondary">
          {i18nService.t('knowledgeBaseLoading')}
        </div>
      ) : items.length === 0 && error ? (
        <div className="py-6" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <p className="mb-3 text-sm text-secondary">
            {i18nService.t('knowledgeBaseListEmpty')}
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-raised"
          >
            <PlusCircleIcon className="h-3.5 w-3.5 text-secondary" />
            {i18nService.t('knowledgeBaseCreateButton')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {items.map(kb => (
            <div
              key={kb.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(kb)}
              onKeyDown={e => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(kb);
                }
              }}
              className="group flex cursor-pointer flex-col rounded-2xl border border-border bg-surface p-4 shadow-subtle transition-all hover:border-primary/50 hover:shadow-card focus-within:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-muted text-primary">
                  <FolderIcon className="h-5 w-5" />
                </span>
                <div
                  className={`min-w-0 flex-1 truncate ${MANAGEMENT_TITLE_TEXT} font-semibold leading-snug text-foreground`}
                >
                  {kb.name}
                </div>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setDeleteTarget(kb);
                  }}
                  className="rounded p-1.5 text-secondary opacity-0 transition-opacity hover:bg-surface-raised hover:text-red-500 group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:text-red-400"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-3 line-clamp-2 min-h-[2.6em] text-xs leading-relaxed text-secondary">
                {kb.description || i18nService.t('knowledgeBaseNoDescription')}
              </p>

              <div
                className={`mt-auto flex min-w-0 items-center gap-1.5 ${MANAGEMENT_META_TEXT} text-muted`}
              >
                <span>
                  {i18nService
                    .t('knowledgeBaseDocCount')
                    .replace('{count}', String(kb.knowledge_count ?? 0))}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建知识库 */}
      {showCreate && (
        <Modal
          onClose={closeCreate}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center modal-backdrop px-4"
          className="modal-content flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-modal"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">
              {i18nService.t('knowledgeBaseCreateTitle')}
            </h2>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="space-y-1.5">
              <label className={LABEL_CLASS}>
                {i18nService.t('knowledgeBaseNameLabel')}
                <span className="ml-0.5 text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleCreate();
                }}
                autoFocus
                className={INPUT_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL_CLASS}>
                {i18nService.t('knowledgeBaseDescriptionLabel')}
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleCreate();
                }}
                className={INPUT_CLASS}
              />
            </div>
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={closeCreate}
              disabled={creating}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {i18nService.t('knowledgeBaseCreateConfirm')}
            </button>
          </div>
        </Modal>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <Modal
          onClose={() => setDeleteTarget(null)}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        >
          <div className="text-lg font-semibold text-foreground">
            {i18nService.t('knowledgeBaseDeleteTitle')}
          </div>
          <p className="mt-2 text-sm text-secondary">
            {i18nService
              .t('knowledgeBaseDeleteConfirm')
              .replace('{name}', deleteTarget.name)}
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-red-400"
            >
              {i18nService.t('confirmDelete')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default KnowledgeBaseListPanel;
