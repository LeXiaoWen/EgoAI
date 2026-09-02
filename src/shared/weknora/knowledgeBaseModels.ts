// 知识库模型配置：跨 renderer（配置 UI）与 main（weknoraModelSync 注入）共享。
//
// EgoAI 是唯一模型配置入口，chat/embedding/rerank 三类模型经 WeKnora REST
// 注入 models 表。chat 复用现有 provider（AppConfig.providers / model），
// embedding/rerank 独立新增（与记忆 embedding 的 cowork_config 分离，语义不同）。

export const KnowledgeBaseEmbeddingSource = {
  Local: 'local', // Ollama
  Remote: 'remote', // 任意 OpenAI 兼容端点（generic）
} as const;
export type KnowledgeBaseEmbeddingSource =
  typeof KnowledgeBaseEmbeddingSource[keyof typeof KnowledgeBaseEmbeddingSource];

export interface KnowledgeBaseModelsConfig {
  embedding: {
    source: KnowledgeBaseEmbeddingSource;
    model: string;
    baseUrl: string;
    apiKey: string;
  };
  rerank: {
    // Ollama 不支持 rerank，纯本地默认禁用；启用时固定走 remote generic。
    enabled: boolean;
    model: string;
    baseUrl: string;
    apiKey: string;
  };
}

export const defaultKnowledgeBaseModels: KnowledgeBaseModelsConfig = {
  embedding: {
    source: KnowledgeBaseEmbeddingSource.Local,
    model: 'bge-m3',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
  },
  rerank: {
    enabled: false,
    model: '',
    baseUrl: '',
    apiKey: '',
  },
};
