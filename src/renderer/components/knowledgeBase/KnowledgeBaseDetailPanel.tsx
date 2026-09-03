import React, { useState } from 'react';

import type { KnowledgeBase } from '../../../shared/weknora/types';
import { i18nService } from '../../services/i18n';
import { MANAGEMENT_META_TEXT, MANAGEMENT_TITLE_TEXT } from '../common/managementTypography';
import ChevronRightIcon from '../icons/ChevronRightIcon';
import DocumentListPanel from './DocumentListPanel';
import SearchPreviewPanel from './SearchPreviewPanel';

interface KnowledgeBaseDetailPanelProps {
  kb: KnowledgeBase;
  onBack: () => void;
}

type DetailTab = 'docs' | 'search';

const DETAIL_TABS: Array<{ value: DetailTab; labelKey: string }> = [
  { value: 'docs', labelKey: 'knowledgeBaseDocsTab' },
  { value: 'search', labelKey: 'knowledgeBaseSearchTab' },
];

/** 单个知识库详情：文档列表 + 检索，模仿 WeKnora 的「列表 → 详情」导航。 */
const KnowledgeBaseDetailPanel: React.FC<KnowledgeBaseDetailPanelProps> = ({
  kb,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('docs');

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
      >
        <ChevronRightIcon className="h-4 w-4 rotate-180" />
        <span className={`${MANAGEMENT_META_TEXT} font-medium`}>
          {i18nService.t('back')}
        </span>
      </button>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`truncate ${MANAGEMENT_TITLE_TEXT} font-semibold text-foreground`}>
            {kb.name}
          </h2>
          {kb.description ? (
            <p className="mt-0.5 truncate text-xs leading-relaxed text-secondary">
              {kb.description}
            </p>
          ) : null}
        </div>
        <div className={`shrink-0 rounded-full bg-surface-raised px-2.5 py-1 ${MANAGEMENT_META_TEXT} font-medium text-secondary`}>
          {i18nService
            .t('knowledgeBaseDocCount')
            .replace('{count}', String(kb.knowledge_count ?? 0))}
        </div>
      </div>

      <div className="mb-4 flex items-center border-b border-border">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`relative px-2.5 pb-2.5 pt-0.5 ${MANAGEMENT_TITLE_TEXT} font-semibold transition-colors ${
              activeTab === tab.value
                ? 'text-foreground'
                : 'text-secondary hover:text-foreground'
            }`}
          >
            {i18nService.t(tab.labelKey)}
            <div
              className={`absolute bottom-[-1px] left-0 right-0 h-0.5 rounded-full transition-colors ${
                activeTab === tab.value ? 'bg-primary' : 'bg-transparent'
              }`}
            />
          </button>
        ))}
      </div>

      {activeTab === 'docs' ? (
        <DocumentListPanel kbId={kb.id} />
      ) : (
        <SearchPreviewPanel kbId={kb.id} />
      )}
    </div>
  );
};

export default KnowledgeBaseDetailPanel;
