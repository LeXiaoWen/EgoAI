import type { KnowledgeBaseScope } from '../../../shared/weknora/kbScope';

/**
 * 会话级「知识库范围」出站指令（模型向开发者指令，非用户可见文案，故不 i18n）。
 *
 * 检索 100% agent 驱动：EgoAI 不预检索，只把范围约束写进出站 system prompt 前缀，
 * 让 agent 在 weknora MCP 工具上按范围自调工具。knowledge-base-qa 预设的散文仍可能
 * 劝 agent 检索，因此三种 mode 都会产出显式块（none 也要抑制），并点名确切工具名以
 * 覆盖预设措辞；写/管理工具一律禁用（顺带的安全收敛，不做工具过滤）。
 */
const KB_SCOPE_BLOCK_TITLE = '[EgoAI knowledge-base scope]';

const WRITE_TOOL_BAN_LINES = [
  'Do NOT call any knowledge-base writing, management or provisioning tool while this',
  'scope is active: create_knowledge_base, delete_knowledge_base, update_knowledge_base,',
  'create_knowledge_from_file, create_knowledge_from_url, create_knowledge_from_text,',
  'delete_knowledge, create_tenant, create_model and their variants are forbidden.',
].join('\n');

function buildNoneBlock(): string {
  return [
    KB_SCOPE_BLOCK_TITLE,
    'This session must NOT search or query any knowledge base.',
    'Do not call weknora retrieval tools such as list_knowledge_bases,',
    'list_shared_knowledge_bases, hybrid_search, list_knowledge, wiki_search,',
    'wiki_read_page, get_knowledge_base or get_knowledge.',
    'Answer from general knowledge instead. If you cannot answer well without a',
    'knowledge base, say so clearly rather than guessing or searching.',
    WRITE_TOOL_BAN_LINES,
  ].join('\n');
}

function buildAllBlock(): string {
  return [
    KB_SCOPE_BLOCK_TITLE,
    'This session may search ALL knowledge bases reachable through the weknora',
    'integration. Discover them with list_knowledge_bases and',
    'list_shared_knowledge_bases, then for every knowledge base relevant to the',
    'question call hybrid_search(kb_id=<id or name>, query=<your query>).',
    'When an answer needs more than one source, aggregate the results,',
    'de-duplicate overlapping passages, and label each claim with the knowledge',
    'base it came from. Do not silently restrict yourself to a single knowledge base.',
    WRITE_TOOL_BAN_LINES,
  ].join('\n');
}

function buildSpecificBlock(kbId: string, kbName: string): string {
  return [
    KB_SCOPE_BLOCK_TITLE,
    `This session may search ONLY the single knowledge base "${kbName}" (id ${kbId})`,
    'through the weknora integration, using hybrid_search(kb_id=<that id or name>,',
    'query=<your query>).',
    'Do NOT call list_knowledge_bases or list_shared_knowledge_bases, and do NOT',
    'search or read any other knowledge base even if the user mentions one.',
    'If that knowledge base cannot answer the question, say so rather than widening',
    'the search on your own.',
    WRITE_TOOL_BAN_LINES,
  ].join('\n');
}

export function buildKbScopeSystemPromptBlock(scope: KnowledgeBaseScope | null | undefined): string {
  if (!scope) return '';
  switch (scope.mode) {
    case 'none':
      return buildNoneBlock();
    case 'all':
      return buildAllBlock();
    case 'specific': {
      const kbId = scope.kbId?.trim() ?? '';
      if (!kbId) {
        // 脏数据防御：specific 无目标库 ID 时等同不检索（与 normalizeKbScope 语义一致）。
        return buildNoneBlock();
      }
      const kbName = scope.kbName?.trim() || kbId;
      return buildSpecificBlock(kbId, kbName);
    }
    default:
      return '';
  }
}
