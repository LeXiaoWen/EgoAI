import React, { useState } from 'react';

import type { SearchResult } from '../../../shared/weknora/types';
import { i18nService } from '../../services/i18n';
import { weknoraService } from '../../services/weknora';
import { MANAGEMENT_META_TEXT } from '../common/managementTypography';
import ErrorMessage from '../ErrorMessage';
import SearchIcon from '../icons/SearchIcon';

interface SearchPreviewPanelProps {
  kbId: string;
}

const SEARCH_INPUT_CLASS =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary';

const SearchPreviewPanel: React.FC<SearchPreviewPanelProps> = ({ kbId }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    const res = await weknoraService.search({ kbId, query: query.trim() });
    setSearching(false);
    setSearched(true);
    if (res.success) {
      setResults(res.data);
    } else {
      setResults([]);
      setError(res.error);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleSearch();
            }}
            placeholder={i18nService.t('knowledgeBaseSearchPlaceholder')}
            className={`${SEARCH_INPUT_CLASS} pl-9 pr-3`}
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {i18nService.t('knowledgeBaseSearchButton')}
        </button>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

      {searching ? (
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-sm text-secondary">
          {i18nService.t('knowledgeBaseLoading')}
        </div>
      ) : !searched ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-secondary">
          {i18nService.t('knowledgeBaseSearchIdle')}
        </div>
      ) : results.length === 0 && error ? null : results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-secondary">
          {i18nService.t('knowledgeBaseSearchEmpty')}
        </div>
      ) : (
        <ul className="space-y-3">
          {results.map((r, i) => (
            <li key={r.id ?? i} className="rounded-xl border border-border bg-surface p-4">
              <div className={`mb-2 flex items-center justify-between gap-2 ${MANAGEMENT_META_TEXT} text-secondary`}>
                <span className="truncate">
                  {i18nService.t('knowledgeBaseSource')}:{' '}
                  {r.knowledge_title || r.knowledge_filename || r.knowledge_id}
                </span>
                {r.score !== undefined && (
                  <span className="shrink-0">
                    {i18nService.t('knowledgeBaseScoreLabel')}: {r.score.toFixed(4)}
                  </span>
                )}
              </div>
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {r.content}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchPreviewPanel;
