import { describe, expect, test, vi } from 'vitest';

import type { InstalledKitRecord } from '../../shared/kit/constants';
import {
  SkinRecordStatus,
  SkinToolAction,
  SkinWorkflowKind,
} from '../../shared/skin/constants';
import { SkinPackKitId } from '../../shared/skin/kit';
import { SkinMediaBridge } from './skinMediaBridge';
import type { SkinRecord, SkinStore } from './skinStore';
import { SkinWorkflowRegistry } from './skinWorkflowRegistry';

const timestamp = '2026-07-16T10:00:00.000Z';
const sessionId = 'session-one';
const sessionKey = 'agent:main:egoai:session-one';
const context = { sessionKey, toolCallId: 'tool-call-one' };

const installedKit: InstalledKitRecord = {
  id: SkinPackKitId.BuiltIn,
  version: '0.1.0',
  installedAt: 1,
  workflowKind: SkinWorkflowKind.SkinPack,
  skills: null,
  mcpServers: [],
  connectors: [],
};

const createHarness = () => {
  const current: SkinRecord = {
    id: 'skin-one',
    workflowKind: SkinWorkflowKind.SkinPack,
    status: SkinRecordStatus.Draft,
    assets: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const store = {
    createDraft: vi.fn(async () => current),
    getSkin: vi.fn(async () => current),
    apply: vi.fn(async () => current),
    deactivate: vi.fn(async () => undefined),
  } as unknown as SkinStore;
  const workflowRegistry = new SkinWorkflowRegistry({
    getInstalledKits: () => ({ [SkinPackKitId.BuiltIn]: installedKit }),
    getParentSessionId: () => null,
  });
  workflowRegistry.prepareTurn({
    sessionId,
    kitIds: [SkinPackKitId.BuiltIn],
  });
  const bridge = new SkinMediaBridge({
    store,
    workflowRegistry,
    resolveSessionId: key => key === sessionKey ? sessionId : null,
  });
  return { bridge, store, workflowRegistry };
};

describe('skin media bridge', () => {
  test('clears the owning workflow only after a successful apply', async () => {
    const { bridge, workflowRegistry } = createHarness();
    await bridge.handleToolRequest({
      args: { action: SkinToolAction.CreateDraft },
      context,
    });

    const result = await bridge.handleToolRequest({
      args: { action: SkinToolAction.Apply, skinId: 'skin-one' },
      context,
    });

    expect(result.isError).not.toBe(true);
    expect(workflowRegistry.resolve(sessionId)).toBeUndefined();
  });
});
