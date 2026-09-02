import React, { useEffect, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { MANAGEMENT_PAGE_TITLE_TEXT } from '../common/managementTypography';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';

interface KnowledgeBaseViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

// Embeds the bundled WeKnora-lite web UI. The URL is a loopback address
// resolved lazily from the main process, which starts the server on demand.
const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({ isSidebarCollapsed, onToggleSidebar }) => {
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electron.weknora
      .getWebUrl()
      .then(({ url }) => {
        if (cancelled) return;
        if (url) setUrl(url);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-skin-management-page="true" className="relative z-10 flex-1 flex flex-col bg-background h-full">
      <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && !isWindows && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
            </div>
          )}
          <h1 className={`${MANAGEMENT_PAGE_TITLE_TEXT} font-semibold text-foreground`}>
            {i18nService.t('knowledgeBaseSidebarTitle')}
          </h1>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {url ? (
          React.createElement('webview', {
            src: url,
            className: 'h-full w-full',
            allowpopups: 'false',
          })
        ) : failed ? (
          <div className="flex h-full items-center justify-center text-sm text-secondary">
            {i18nService.t('knowledgeBaseFailed')}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-secondary">
            {i18nService.t('knowledgeBaseLoading')}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBaseView;
