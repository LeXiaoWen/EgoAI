import React, { useState } from 'react';

import type { KnowledgeBase } from '../../../shared/weknora/types';
import { i18nService } from '../../services/i18n';
import { MANAGEMENT_PAGE_TITLE_TEXT } from '../common/managementTypography';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import KnowledgeBaseDetailPanel from './KnowledgeBaseDetailPanel';
import KnowledgeBaseListPanel from './KnowledgeBaseListPanel';

interface KnowledgeBaseViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

/**
 * 知识库页（原生视图独占）。两级导航：知识库卡片列表 → 单个库的
 * 「文档 / 检索」详情。信息架构沿用 WeKnora，视觉完全走 EgoAI 主题 token。
 *
 * 历史说明：此前顶部有一个「高级管理」入口，嵌入 WeKnora-lite 的完整 Web UI
 * 作功能兜底。该 webview 是独立 TDesign 皮肤、不随 EgoAI 主题走，且其内置
 * 模型设置会绕过 EgoAI 的模型统一层造成状态漂移，与深度融合方向相悖，故已
 * 从 UI 隐藏（webview 服务与 GET /api 能力仍保留，后续 docreader 拉起后在
 * 原生放开 PDF/Office 上传，不再依赖 web 兜底）。
 */
const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);

  return (
    <div data-skin-management-page="true" className="relative z-10 flex flex-1 flex-col bg-background h-full">
      <div className="draggable flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex h-8 items-center space-x-3">
          {isSidebarCollapsed && !isWindows && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
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

      <div className="h-full min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1120px] px-8 py-6">
          {selectedKb ? (
            <KnowledgeBaseDetailPanel
              kb={selectedKb}
              onBack={() => setSelectedKb(null)}
            />
          ) : (
            <KnowledgeBaseListPanel onOpen={setSelectedKb} />
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseView;
