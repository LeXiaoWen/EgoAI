import { describe, expect, test } from 'vitest';

import {
  CoworkUpdateSessionKbScopeChannel,
  DEFAULT_KB_SCOPE,
  KNOWLEDGE_BASE_QA_PRESET_ID,
  normalizeKbScope,
  parseKbScope,
  presetDefaultKbScope,
  presetDefaultKbScopeMode,
  serializeKbScope,
} from './kbScope';

describe('presetDefaultKbScope', () => {
  test('knowledge-base-qa 预设派生 all，其它/缺失派生 none', () => {
    expect(presetDefaultKbScopeMode(KNOWLEDGE_BASE_QA_PRESET_ID)).toBe('all');
    expect(presetDefaultKbScopeMode('custom-agent')).toBe('none');
    expect(presetDefaultKbScopeMode(null)).toBe('none');
    expect(presetDefaultKbScopeMode(undefined)).toBe('none');
  });

  test('presetDefaultKbScope 返回具体 mode 的壳', () => {
    expect(presetDefaultKbScope(KNOWLEDGE_BASE_QA_PRESET_ID)).toEqual({ mode: 'all' });
    expect(presetDefaultKbScope('other')).toEqual(DEFAULT_KB_SCOPE);
  });
});

describe('normalizeKbScope', () => {
  test('none / all 往返并丢弃多余字段', () => {
    expect(normalizeKbScope({ mode: 'none' })).toEqual({ mode: 'none' });
    expect(normalizeKbScope({ mode: 'all', kbId: 'junk' })).toEqual({ mode: 'all' });
  });

  test('specific 保留 kbId/kbName 并 trim', () => {
    expect(normalizeKbScope({ mode: 'specific', kbId: ' kb-1 ', kbName: ' 财务库 ' }))
      .toEqual({ mode: 'specific', kbId: 'kb-1', kbName: '财务库' });
    expect(normalizeKbScope({ mode: 'specific', kbId: 'kb-1' }))
      .toEqual({ mode: 'specific', kbId: 'kb-1' });
  });

  test('脏输入一律拒绝', () => {
    expect(normalizeKbScope(null)).toBeNull();
    expect(normalizeKbScope(undefined)).toBeNull();
    expect(normalizeKbScope('none')).toBeNull();
    expect(normalizeKbScope({})).toBeNull();
    expect(normalizeKbScope({ mode: 'banana' })).toBeNull();
    expect(normalizeKbScope({ mode: 42 })).toBeNull();
  });

  test('specific 缺 kbId 视为非法', () => {
    expect(normalizeKbScope({ mode: 'specific' })).toBeNull();
    expect(normalizeKbScope({ mode: 'specific', kbId: '   ' })).toBeNull();
    expect(normalizeKbScope({ mode: 'specific', kbName: '只有名字' })).toBeNull();
  });
});

describe('serialize/parse', () => {
  test('对称往返', () => {
    const scope = { mode: 'specific', kbId: 'kb-9', kbName: '研发知识库' } as const;
    expect(parseKbScope(serializeKbScope(scope))).toEqual(scope);
    expect(parseKbScope(serializeKbScope({ mode: 'all' }))).toEqual({ mode: 'all' });
  });

  test('空/损坏输入返回 null，不抛错', () => {
    expect(serializeKbScope(null)).toBeNull();
    expect(serializeKbScope(undefined)).toBeNull();
    expect(parseKbScope(null)).toBeNull();
    expect(parseKbScope('')).toBeNull();
    expect(parseKbScope('not json')).toBeNull();
    expect(parseKbScope('{"mode":"nope"}')).toBeNull();
  });
});

describe('常量', () => {
  test('IPC 通道与预设 id 稳定', () => {
    expect(KNOWLEDGE_BASE_QA_PRESET_ID).toBe('knowledge-base-qa');
    expect(CoworkUpdateSessionKbScopeChannel).toBe('cowork:session:updateKbScope');
  });
});
