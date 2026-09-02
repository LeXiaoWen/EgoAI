import React from 'react';

import {
  KnowledgeBaseEmbeddingSource,
  type KnowledgeBaseModelsConfig,
} from '../../../shared/weknora/knowledgeBaseModels';
import { i18nService } from '../../services/i18n';

interface KnowledgeBaseModelsSectionProps {
  value: KnowledgeBaseModelsConfig;
  onChange: (next: KnowledgeBaseModelsConfig) => void;
}

const KnowledgeBaseModelsSection: React.FC<KnowledgeBaseModelsSectionProps> = ({
  value,
  onChange,
}) => {
  const updateEmbedding = (patch: Partial<KnowledgeBaseModelsConfig['embedding']>) => {
    onChange({ ...value, embedding: { ...value.embedding, ...patch } });
  };
  const updateRerank = (patch: Partial<KnowledgeBaseModelsConfig['rerank']>) => {
    onChange({ ...value, rerank: { ...value.rerank, ...patch } });
  };

  const isLocalEmbedding = value.embedding.source === KnowledgeBaseEmbeddingSource.Local;

  return (
    <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">
          {i18nService.t('knowledgeBaseModelsTitle')}
        </div>
        <div className="text-xs text-secondary">
          {i18nService.t('knowledgeBaseModelsTitleHint')}
        </div>
      </div>

      {/* Embedding 模型 */}
      <div className="space-y-3 pt-2">
        <div>
          <div className="text-xs font-semibold text-foreground">
            {i18nService.t('knowledgeBaseEmbeddingTitle')}
          </div>
          <div className="text-xs text-secondary mt-0.5">
            {i18nService.t('knowledgeBaseEmbeddingHint')}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            {i18nService.t('knowledgeBaseSource')}
          </label>
          <select
            value={value.embedding.source}
            onChange={(e) =>
              updateEmbedding({
                source: e.target.value as KnowledgeBaseModelsConfig['embedding']['source'],
              })
            }
            className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface"
          >
            <option value={KnowledgeBaseEmbeddingSource.Local}>
              {i18nService.t('knowledgeBaseSourceLocal')}
            </option>
            <option value={KnowledgeBaseEmbeddingSource.Remote}>
              {i18nService.t('knowledgeBaseSourceRemote')}
            </option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            {i18nService.t('knowledgeBaseModel')}
          </label>
          <input
            type="text"
            value={value.embedding.model}
            onChange={(e) => updateEmbedding({ model: e.target.value })}
            placeholder="bge-m3"
            className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            {i18nService.t('knowledgeBaseBaseUrl')}
          </label>
          <input
            type="text"
            value={value.embedding.baseUrl}
            onChange={(e) => updateEmbedding({ baseUrl: e.target.value })}
            placeholder="http://localhost:11434/v1"
            className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
          />
        </div>

        {!isLocalEmbedding && (
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {i18nService.t('knowledgeBaseApiKey')}
            </label>
            <input
              type="password"
              value={value.embedding.apiKey}
              onChange={(e) => updateEmbedding({ apiKey: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
            />
          </div>
        )}
      </div>

      {/* Rerank 模型 */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-foreground">
              {i18nService.t('knowledgeBaseRerankTitle')}
            </div>
            <div className="text-xs text-secondary">
              {i18nService.t('knowledgeBaseRerankEnabledHint')}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={value.rerank.enabled}
            onClick={() => updateRerank({ enabled: !value.rerank.enabled })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              value.rerank.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                value.rerank.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {value.rerank.enabled && (
          <>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {i18nService.t('knowledgeBaseModel')}
              </label>
              <input
                type="text"
                value={value.rerank.model}
                onChange={(e) => updateRerank({ model: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {i18nService.t('knowledgeBaseBaseUrl')}
              </label>
              <input
                type="text"
                value={value.rerank.baseUrl}
                onChange={(e) => updateRerank({ baseUrl: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {i18nService.t('knowledgeBaseApiKey')}
              </label>
              <input
                type="password"
                value={value.rerank.apiKey}
                onChange={(e) => updateRerank({ apiKey: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBaseModelsSection;
