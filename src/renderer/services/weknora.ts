import type {
  CreateKnowledgeBaseInput,
  HybridSearchInput,
  Knowledge,
  KnowledgeBase,
  KnowledgeList,
  SearchResult,
  UploadDocumentInput,
  WeknoraResult,
} from '../../shared/weknora/types';

// Renderer 侧对 weknora REST 代理 IPC 的封装。所有请求经 main 进程转发到
// 本地 weknora-lite（固定端点白名单），renderer 不直接与 weknora-lite 通信。
class WeknoraService {
  listKnowledgeBases(): Promise<WeknoraResult<KnowledgeBase[]>> {
    return window.electron.weknora.kbList();
  }

  createKnowledgeBase(input: CreateKnowledgeBaseInput): Promise<WeknoraResult<KnowledgeBase>> {
    return window.electron.weknora.kbCreate(input);
  }

  deleteKnowledgeBase(kbId: string): Promise<WeknoraResult<null>> {
    return window.electron.weknora.kbDelete(kbId);
  }

  listDocuments(input: {
    kbId: string;
    page?: number;
    pageSize?: number;
  }): Promise<WeknoraResult<KnowledgeList>> {
    return window.electron.weknora.docList(input);
  }

  getDocument(docId: string): Promise<WeknoraResult<Knowledge>> {
    return window.electron.weknora.docGet(docId);
  }

  deleteDocument(docId: string): Promise<WeknoraResult<null>> {
    return window.electron.weknora.docDelete(docId);
  }

  uploadDocument(input: UploadDocumentInput): Promise<WeknoraResult<Knowledge>> {
    return window.electron.weknora.docUpload(input);
  }

  search(input: HybridSearchInput): Promise<WeknoraResult<SearchResult[]>> {
    return window.electron.weknora.searchHybrid(input);
  }

  openFile(): Promise<{ path: string | null }> {
    return window.electron.weknora.openFile();
  }
}

export const weknoraService = new WeknoraService();
