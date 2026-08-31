import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import { i18nService } from '../../services/i18n';
import AgentTaskRow from './AgentTaskRow';
import { AgentSidebarIndicator } from './constants';
import type { AgentSidebarTaskNode } from './types';

const makeTask = (
  overrides: Partial<AgentSidebarTaskNode> = {},
): AgentSidebarTaskNode => ({
  id: 'regular-session',
  agentId: 'main',
  title: 'Regular task',
  status: 'completed',
  pinned: false,
  pinOrder: null,
  updatedAt: 200,
  createdAt: 100,
  indicator: AgentSidebarIndicator.None,
  isSelected: false,
  ...overrides,
});

const renderTask = (
  overrides: Partial<AgentSidebarTaskNode> = {},
) => renderToStaticMarkup(
  React.createElement(AgentTaskRow, {
    task: makeTask(overrides),
    isBatchMode: false,
    isSelected: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(async () => {}),
    onShare: vi.fn(async () => {}),
    onTogglePin: vi.fn(async () => {}),
    onRename: vi.fn(async () => {}),
    onToggleSelection: vi.fn(),
    onEnterBatchMode: vi.fn(),
  }),
);

test('task rows and hidden action controls remain keyboard reachable', () => {
  const html = renderTask();
  expect(html).toContain('role="treeitem"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain('focus-visible:opacity-[0.46]');
});

test('IM task rows show platform icons and hide matching title prefixes', () => {
  const originalLanguage = i18nService.getLanguage();
  try {
    i18nService.setLanguage('zh', { persist: false });
    const html = renderTask({
      title: '[微信] group:o9cq',
      imPlatform: 'weixin',
    });
    expect(html).toContain('src="weixin.png"');
    expect(html).toContain('aria-label="微信"');
    expect(html).toContain('group:o9cq');
    expect(html).not.toContain('[微信]');
  } finally {
    i18nService.setLanguage(originalLanguage, { persist: false });
  }
});
