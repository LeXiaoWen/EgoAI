import { describe, expect, test } from 'vitest';

import { buildKbScopeSystemPromptBlock } from './knowledgeBaseScopePrompt';

describe('buildKbScopeSystemPromptBlock', () => {
  test('null / undefined 不产出块', () => {
    expect(buildKbScopeSystemPromptBlock(null)).toBe('');
    expect(buildKbScopeSystemPromptBlock(undefined)).toBe('');
  });

  test('none：禁止检索并点名写/管理工具禁用', () => {
    const block = buildKbScopeSystemPromptBlock({ mode: 'none' });
    expect(block).toContain('[EgoAI knowledge-base scope]');
    expect(block).toContain('must NOT search or query any knowledge base');
    expect(block).toContain('hybrid_search');
    expect(block).toContain('create_knowledge_base');
    expect(block).toContain('delete_knowledge');
  });

  test('all：先列库再逐库检索、聚合去重', () => {
    const block = buildKbScopeSystemPromptBlock({ mode: 'all' });
    expect(block).toContain('ALL knowledge bases');
    expect(block).toContain('list_knowledge_bases');
    expect(block).toContain('list_shared_knowledge_bases');
    expect(block).toContain('hybrid_search');
    expect(block).toContain('label each claim with the knowledge');
    expect(block).toContain('create_knowledge_base');
  });

  test('specific：仅指定库可检索，含库名与 id', () => {
    const block = buildKbScopeSystemPromptBlock({
      mode: 'specific',
      kbId: 'kb-42',
      kbName: '财务知识库',
    });
    expect(block).toContain('ONLY the single knowledge base');
    expect(block).toContain('财务知识库');
    expect(block).toContain('kb-42');
    expect(block).toContain('hybrid_search');
    expect(block).toContain('Do NOT call list_knowledge_bases');
  });

  test('specific 缺库名时回退用 id 作名', () => {
    const block = buildKbScopeSystemPromptBlock({ mode: 'specific', kbId: 'kb-7' });
    expect(block).toContain('"kb-7" (id kb-7)');
  });

  test('specific 缺 kbId 视为脏数据，回退 none 语义', () => {
    const fallback = buildKbScopeSystemPromptBlock({ mode: 'specific' });
    expect(fallback).toContain('must NOT search or query any knowledge base');
    const explicitNone = buildKbScopeSystemPromptBlock({ mode: 'none' });
    expect(fallback).toBe(explicitNone);
  });
});
