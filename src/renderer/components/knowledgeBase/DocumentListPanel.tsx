import React, { useCallback, useEffect, useState } from 'react';

import type { Knowledge } from '../../../shared/weknora/types';
import { i18nService } from '../../services/i18n';
import { weknoraService } from '../../services/weknora';
import { MANAGEMENT_META_TEXT } from '../common/managementTypography';
import Modal from '../common/Modal';
import ErrorMessage from '../ErrorMessage';
import DocumentTextIcon from '../icons/DocumentTextIcon';
import TrashIcon from '../icons/TrashIcon';
import UploadIcon from '../icons/UploadIcon';

interface DocumentListPanelProps {
  kbId: string;
}

const PAGE_SIZE = 20;

/** parse_status → EgoAI 状态徽标（浅底/深底双配色，同 MCP launch 徽标）。 */
const STATUS_BADGE_CLASS: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  processing: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  finalizing: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  deleting: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  cancelled: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
};

const UPLOAD_BUTTON_CLASS =
  'inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60';

const DocumentListPanel: React.FC<DocumentListPanelProps> = ({ kbId }) => {
  const [items, setItems] = useState<Knowledge[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Knowledge | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await weknoraService.listDocuments({ kbId, page, pageSize: PAGE_SIZE });
    setLoading(false);
    if (res.success) {
      setItems(res.data.items);
      setTotal(res.data.total);
    } else {
      setError(res.error);
    }
  }, [kbId, page]);

  useEffect(() => {
    setPage(1);
  }, [kbId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = async () => {
    const { path } = await weknoraService.openFile();
    if (!path) return;
    setUploading(true);
    setError(null);
    const res = await weknoraService.uploadDocument({ kbId, filePath: path });
    setUploading(false);
    if (res.success) {
      await load();
    } else {
      setError(res.error);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);
    const res = await weknoraService.deleteDocument(deleteTarget.id);
    setDeleting(false);
    if (res.success) {
      setDeleteTarget(null);
      await load();
    } else {
      setError(res.error);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className={UPLOAD_BUTTON_CLASS}
        >
          <UploadIcon className="h-4 w-4" />
          {uploading
            ? i18nService.t('knowledgeBaseUploading')
            : i18nService.t('knowledgeBaseUploadButton')}
        </button>
        <span className={`${MANAGEMENT_META_TEXT} text-muted`}>
          {i18nService.t('knowledgeBaseUploadHint')}
        </span>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-sm text-secondary">
          {i18nService.t('knowledgeBaseLoading')}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <DocumentTextIcon className="mb-2 h-8 w-8 text-secondary/50" />
          <p className="text-sm text-secondary">{i18nService.t('knowledgeBaseDocListEmpty')}</p>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UploadIcon className="h-3.5 w-3.5 text-secondary" />
            {i18nService.t('knowledgeBaseUploadButton')}
          </button>
        </div>
      ) : error ? (
        <div className="py-4" />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {items.map(doc => (
              <li key={doc.id} className="group flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">
                    {doc.title || doc.file_name || doc.id}
                  </div>
                  {doc.file_name && (
                    <div className="truncate text-xs text-secondary">{doc.file_name}</div>
                  )}
                </div>
                {doc.parse_status && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${MANAGEMENT_META_TEXT} ${
                      STATUS_BADGE_CLASS[doc.parse_status] ??
                      'bg-surface-raised text-secondary'
                    }`}
                  >
                    {i18nService.t(`knowledgeBaseParseStatus_${doc.parse_status}`)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteTarget(doc)}
                  className="rounded p-1.5 text-secondary opacity-0 transition-opacity hover:bg-surface-raised hover:text-red-500 group-hover:opacity-100 group-focus-within:opacity-100 dark:hover:text-red-400"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <span className={`${MANAGEMENT_META_TEXT} text-secondary`}>
                {i18nService
                  .t('knowledgeBasePageInfo')
                  .replace('{page}', String(page))
                  .replace('{totalPages}', String(totalPages))
                  .replace('{total}', String(total))}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {i18nService.t('knowledgeBasePagePrev')}
                </button>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {i18nService.t('knowledgeBasePageNext')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <Modal
          onClose={() => setDeleteTarget(null)}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        >
          <div className="text-lg font-semibold text-foreground">
            {i18nService.t('knowledgeBaseDocDeleteTitle')}
          </div>
          <p className="mt-2 text-sm text-secondary">
            {i18nService
              .t('knowledgeBaseDocDeleteConfirm')
              .replace('{name}', deleteTarget.title || deleteTarget.file_name || deleteTarget.id)}
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

export default DocumentListPanel;
