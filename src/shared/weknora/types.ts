// WeKnora REST 代理的跨进程共享类型。
// 字段命名沿用 WeKnora REST 原始 JSON 的 snake_case（胶水零转换透传），
// 与 weknoraModelSync.ts 消费 /models 响应的方式一致。

export type WeknoraResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// 知识库（GET/POST /knowledge-bases 返回的字段子集，UI 所需）。
export interface KnowledgeBase {
  id: string;
  name: string;
  type?: string;
  description?: string;
  embedding_model_id?: string;
  summary_model_id?: string;
  knowledge_count?: number;
  chunk_count?: number;
  is_processing?: boolean;
  created_at?: number;
  updated_at?: number;
}

// 文档（WeKnora 里建模为 Knowledge，GET /knowledge 返回的字段子集）。
export interface Knowledge {
  id: string;
  knowledge_base_id?: string;
  title?: string;
  type?: string;
  source?: string;
  channel?: string;
  parse_status?: string;
  enable_status?: string;
  file_name?: string;
  folder_path?: string;
  file_type?: string;
  file_size?: number;
  error_message?: string;
  created_at?: number;
  updated_at?: number;
}

// 分页的文档列表（doc.list 重组后返回）。
export interface KnowledgeList {
  items: Knowledge[];
  total: number;
  page: number;
  page_size: number;
}

// 混合检索结果（POST /knowledge-bases/:id/hybrid-search 返回的 chunk）。
export interface SearchResult {
  id?: string;
  content?: string;
  knowledge_id?: string;
  chunk_index?: number;
  knowledge_title?: string;
  knowledge_filename?: string;
  knowledge_source?: string;
  knowledge_base_id?: string;
  start_at?: number;
  end_at?: number;
  score?: number;
  match_type?: string;
}

// 建库入参（renderer → main）。模型 ID 由 main 侧自动解析，renderer 只填名称/描述。
export interface CreateKnowledgeBaseInput {
  name: string;
  description?: string;
}

// 上传文档入参（renderer → main）。filePath 来自 openFile 的 dialog 选择结果。
export interface UploadDocumentInput {
  kbId: string;
  filePath: string;
  fileName?: string;
}

// 混合检索入参（renderer → main）。
export interface HybridSearchInput {
  kbId: string;
  query: string;
  matchCount?: number;
  vectorThreshold?: number;
  keywordThreshold?: number;
}
