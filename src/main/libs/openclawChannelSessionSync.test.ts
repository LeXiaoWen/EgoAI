import { expect, test, vi } from 'vitest';

import {
  buildChannelDisplayName,
  OpenClawChannelSessionSync,
  parseChannelSessionKey,
} from './openclawChannelSessionSync';
import { isManagedSessionKey } from './openclawManagedSessionKey';

function createSync() {
  return new OpenClawChannelSessionSync({
    coworkStore: {
      getSession: () => null,
      createSession: () => {
        throw new Error('createSession should not be called in this test');
      },
    },
    imStore: {
      getSessionMapping: () => null,
      updateSessionLastActive: () => {},
      deleteSessionMapping: () => {},
      createSessionMapping: () => {},
    },
    getDefaultCwd: () => '/tmp',
  });
}

test('parseChannelSessionKey ignores managed local session keys', () => {
  expect(parseChannelSessionKey('egoai:abc-123')).toBe(null);
  expect(parseChannelSessionKey('agent:main:egoai:abc-123')).toBe(null);
});

test('channel sync does not treat managed local session keys as channel sessions', () => {
  const sync = createSync();

  expect(isManagedSessionKey('agent:main:egoai:abc-123')).toBe(true);
  expect(sync.isChannelSessionKey('agent:main:egoai:abc-123')).toBe(false);
  expect(sync.resolveOrCreateSession('agent:main:egoai:abc-123')).toBe(null);
  expect(sync.resolveOrCreateMainAgentSession('agent:main:egoai:abc-123')).toBe(null);
});

test('channel sync still recognizes real channel session keys', () => {
  const sync = createSync();

  expect(parseChannelSessionKey('agent:main:wecom:dm:ou_123')).toEqual({
    platform: 'wecom',
    conversationId: 'dm:ou_123',
  });
  expect(sync.isChannelSessionKey('agent:main:main')).toBe(true);
});

test('channel sync resolves the conversation record for a delivery target', () => {
  const knownSessions = new Set(['weixin-live', 'wecom-live']);
  const mappings = [
    {
      imConversationId: 'weixin-bot-1:direct:wxid_zhangsan@im.wechat',
      platform: 'weixin',
      coworkSessionId: 'weixin-live',
      agentId: 'main',
      openClawSessionKey:
        'agent:main:openclaw-weixin:weixin-bot-1:direct:wxid_zhangsan@im.wechat',
      createdAt: 1,
      lastActiveAt: 3,
    },
    {
      // Stale mapping from a replaced bot account without a session key.
      imConversationId: 'direct:wxid_zhangsan@im.wechat',
      platform: 'weixin',
      coworkSessionId: 'weixin-old',
      agentId: 'main',
      createdAt: 1,
      lastActiveAt: 2,
    },
    {
      imConversationId: 'd1d2f8d1:direct:ou_c167',
      platform: 'wecom',
      coworkSessionId: 'wecom-live',
      agentId: 'main',
      openClawSessionKey: 'agent:main:wecom:d1d2f8d1:direct:ou_c167',
      createdAt: 1,
      lastActiveAt: 1,
    },
  ];
  const sync = new OpenClawChannelSessionSync({
    coworkStore: {
      getSession: (id: string) => (knownSessions.has(id) ? { id } : null),
      createSession: () => {
        throw new Error('createSession should not be called in this test');
      },
    },
    imStore: {
      getSessionMapping: () => null,
      updateSessionLastActive: () => {},
      deleteSessionMapping: () => {},
      createSessionMapping: () => {},
      listSessionMappings: (platform: string) =>
        mappings.filter(m => m.platform === platform),
    },
    getDefaultCwd: () => '/tmp',
  });

  // Delivery targets keep the channel-native casing; mappings are lowercase.
  expect(
    sync.resolveConversationByDeliveryTarget(
      'openclaw-weixin',
      'WxId_ZhangSan@im.wechat',
      'weixin-bot-1',
    ),
  ).toEqual({
    sessionId: 'weixin-live',
    sessionKey:
      'agent:main:openclaw-weixin:weixin-bot-1:direct:wxid_zhangsan@im.wechat',
  });

  expect(sync.resolveConversationByDeliveryTarget('wecom', 'ou_c167')).toEqual({
    sessionId: 'wecom-live',
    sessionKey: 'agent:main:wecom:d1d2f8d1:direct:ou_c167',
  });

  // Unknown peers and unknown channels resolve to nothing.
  expect(sync.resolveConversationByDeliveryTarget('wecom', 'ou_unknown')).toBe(null);
  expect(sync.resolveConversationByDeliveryTarget('not-a-channel', 'ou_c167')).toBe(null);
});

test('channel sync resolves account-less group delivery target by selected bot binding', () => {
  const knownSessions = new Set(['wecom-main-group', 'wecom-bound-group']);
  const mappings = [
    {
      imConversationId: 'group:grp_zhangsan_group',
      platform: 'wecom',
      coworkSessionId: 'wecom-main-group',
      agentId: 'main',
      openClawSessionKey: 'agent:main:wecom:group:grp_zhangsan_group',
      createdAt: 1,
      lastActiveAt: 3,
    },
    {
      imConversationId: 'group:grp_zhangsan_group',
      platform: 'wecom',
      coworkSessionId: 'wecom-bound-group',
      agentId: 'agent-wecom-bot-1',
      openClawSessionKey:
        'agent:agent-wecom-bot-1:wecom:group:grp_zhangsan_group',
      createdAt: 1,
      lastActiveAt: 2,
    },
  ];
  const sync = new OpenClawChannelSessionSync({
    coworkStore: {
      getSession: (id: string) => (knownSessions.has(id) ? { id } : null),
      createSession: () => {
        throw new Error('createSession should not be called in this test');
      },
    },
    imStore: {
      getSessionMapping: () => null,
      getIMSettings: () => ({
        platformAgentBindings: {
          'wecom:wecom-bot-1': 'agent-wecom-bot-1',
        },
      }),
      updateSessionLastActive: () => {},
      deleteSessionMapping: () => {},
      createSessionMapping: () => {},
      listSessionMappings: (platform: string) =>
        mappings.filter(m => m.platform === platform),
    },
    getDefaultCwd: () => '/tmp',
  });

  expect(
    sync.resolveConversationByDeliveryTarget(
      'wecom',
      'grp_zhangsan_group',
      'wecom-bot-1',
    ),
  ).toEqual({
    sessionId: 'wecom-bound-group',
    sessionKey: 'agent:agent-wecom-bot-1:wecom:group:grp_zhangsan_group',
  });
});

test('channel sync treats stale agent ids as non-current after platform binding changes', () => {
  const sync = new OpenClawChannelSessionSync({
    coworkStore: {
      getSession: () => null,
      createSession: () => {
        throw new Error('createSession should not be called in this test');
      },
    },
    imStore: {
      getIMSettings: () => ({
        skillsEnabled: true,
        platformAgentBindings: {
          weixin: 'agent-2',
        },
      }),
      getSessionMapping: () => null,
      updateSessionLastActive: () => {},
      deleteSessionMapping: () => {},
      createSessionMapping: () => {},
    },
    getDefaultCwd: () => '/tmp',
  });

  expect(sync.isCurrentBindingKey('agent:main:openclaw-weixin:bot-1:direct:user-1')).toBe(false);
  expect(sync.isCurrentBindingKey('agent:agent-2:openclaw-weixin:bot-1:direct:user-1')).toBe(true);
});

test('channel sync stores the real OpenClaw session key when creating a mapping', () => {
  const createSessionMapping = vi.fn();
  const getDefaultCwd = vi.fn((agentId?: string) => `/tmp/${agentId || 'fallback'}`);
  const createSession = vi.fn((
    title: string,
    cwd: string,
    systemPrompt: string,
    executionMode: 'local',
    activeSkillIds: string[],
    agentId: string,
  ) => ({
    id: 'cowork-1',
    title,
    claudeSessionId: null,
    status: 'idle' as const,
    pinned: false,
    cwd,
    systemPrompt,
    modelOverride: '',
    executionMode,
    activeSkillIds,
    agentId,
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  }));
  const sync = new OpenClawChannelSessionSync({
    coworkStore: {
      getSession: () => null,
      createSession,
    },
    imStore: {
      getIMSettings: () => ({ skillsEnabled: true }),
      getSessionMapping: () => null,
      updateSessionLastActive: () => {},
      deleteSessionMapping: () => {},
      createSessionMapping,
    },
    getDefaultCwd,
  });

  const sessionKey = 'agent:main:wecom:dm:ou_123';

  expect(sync.resolveOrCreateSession(sessionKey)).toBe('cowork-1');
  expect(getDefaultCwd).toHaveBeenCalledWith('main');
  expect(createSession).toHaveBeenCalledWith(
    expect.any(String),
    '/tmp/main',
    '',
    'local',
    [],
    'main',
  );
  expect(createSessionMapping).toHaveBeenCalledWith(
    'dm:ou_123',
    'wecom',
    'cowork-1',
    'main',
    sessionKey,
  );
});

test('channel sync backfills the real OpenClaw session key for existing mappings', () => {
  const updateSessionOpenClawSessionKey = vi.fn();
  const sync = new OpenClawChannelSessionSync({
    coworkStore: {
      getSession: () => ({
        id: 'cowork-1',
        title: '[企微] grp_123',
        claudeSessionId: null,
        status: 'idle',
        pinned: false,
        cwd: '/tmp',
        systemPrompt: '',
        modelOverride: '',
        executionMode: 'local',
        activeSkillIds: [],
        agentId: 'main',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      }),
      createSession: () => {
        throw new Error('createSession should not be called');
      },
    },
    imStore: {
      getIMSettings: () => ({ skillsEnabled: true }),
      getSessionMapping: () => ({
        imConversationId: 'dm:ou_123',
        platform: 'wecom',
        coworkSessionId: 'cowork-1',
        agentId: 'main',
        createdAt: 1,
        lastActiveAt: 1,
      }),
      updateSessionOpenClawSessionKey,
      updateSessionLastActive: () => {},
      deleteSessionMapping: () => {},
      createSessionMapping: () => {},
    },
    getDefaultCwd: () => '/tmp',
  });

  const sessionKey = 'agent:main:wecom:dm:ou_123';

  expect(sync.resolveOrCreateSession(sessionKey)).toBe('cowork-1');
  expect(updateSessionOpenClawSessionKey).toHaveBeenCalledWith('dm:ou_123', 'wecom', sessionKey, 'main');
});

test('channel sync corrects existing mapping cwd from the current bound agent', () => {
  const updateSession = vi.fn();
  const sync = new OpenClawChannelSessionSync({
    coworkStore: {
      getSession: () => ({
        id: 'cowork-1',
        title: '[企微] grp_123',
        claudeSessionId: null,
        status: 'idle',
        pinned: false,
        cwd: '/tmp/old',
        systemPrompt: '',
        modelOverride: '',
        executionMode: 'local',
        activeSkillIds: [],
        agentId: 'writer',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      }),
      createSession: () => {
        throw new Error('createSession should not be called');
      },
      updateSession,
    },
    imStore: {
      getIMSettings: () => ({
        skillsEnabled: true,
        platformAgentBindings: {
          wecom: 'writer',
        },
      }),
      getSessionMapping: () => ({
        imConversationId: 'dm:ou_123',
        platform: 'wecom',
        coworkSessionId: 'cowork-1',
        agentId: 'writer',
        openClawSessionKey: 'agent:writer:wecom:dm:ou_123',
        createdAt: 1,
        lastActiveAt: 1,
      }),
      updateSessionLastActive: () => {},
      deleteSessionMapping: () => {},
      createSessionMapping: () => {},
    },
    getDefaultCwd: (agentId?: string) => `/repo/${agentId || 'main'}`,
  });

  const sessionKey = 'agent:writer:wecom:dm:ou_123';

  expect(sync.resolveOrCreateSession(sessionKey)).toBe('cowork-1');
  expect(updateSession).toHaveBeenCalledWith(
    'cowork-1',
    { cwd: '/repo/writer' },
    { touchUpdatedAt: false },
  );
});

test('channel sync creates separate local sessions for the same group under different agents', () => {
  let nextId = 0;
  const mappings: Array<{
    imConversationId: string;
    platform: 'wecom';
    coworkSessionId: string;
    agentId: string;
    openClawSessionKey?: string;
    createdAt: number;
    lastActiveAt: number;
  }> = [
    {
      imConversationId: 'group:grp_sanitized',
      platform: 'wecom',
      coworkSessionId: 'cowork-main',
      agentId: 'main',
      openClawSessionKey: 'agent:main:wecom:group:grp_sanitized',
      createdAt: 1,
      lastActiveAt: 1,
    },
  ];
  const createSession = vi.fn(((
    title: string,
    cwd: string,
    systemPrompt: string,
    executionMode: 'local',
    activeSkillIds: string[],
    agentId: string,
  ) => ({
    id: `cowork-${++nextId}`,
    title,
    claudeSessionId: null,
    status: 'idle' as const,
    pinned: false,
    cwd,
    systemPrompt,
    modelOverride: '',
    executionMode,
    activeSkillIds,
    agentId,
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  })));
  const sync = new OpenClawChannelSessionSync({
    coworkStore: {
      getSession: (id: string) => (
        id === 'cowork-main'
          ? {
            id,
            title: '[企微] group:grp_sanitized',
            claudeSessionId: null,
            status: 'idle',
            pinned: false,
            cwd: '/repo/main',
            systemPrompt: '',
            modelOverride: '',
            executionMode: 'local',
            activeSkillIds: [],
            agentId: 'main',
            messages: [],
            createdAt: 1,
            updatedAt: 1,
          }
          : null
      ),
      createSession,
    },
    imStore: {
      getIMSettings: () => ({
        skillsEnabled: true,
        platformAgentBindings: {
          wecom: 'main',
        },
      }),
      getSessionMappingByOpenClawSessionKey: (sessionKey: string) =>
        mappings.find(mapping => mapping.openClawSessionKey === sessionKey) ?? null,
      getSessionMapping: (conversationId: string, platform: 'wecom', agentId?: string) =>
        mappings.find(mapping =>
          mapping.imConversationId === conversationId
          && mapping.platform === platform
          && (!agentId || mapping.agentId === agentId),
        ) ?? null,
      updateSessionLastActive: () => {},
      deleteSessionMapping: () => {},
      createSessionMapping: (
        imConversationId: string,
        platform: 'wecom',
        coworkSessionId: string,
        agentId: string,
        openClawSessionKey: string,
      ) => {
        mappings.push({
          imConversationId,
          platform,
          coworkSessionId,
          agentId,
          openClawSessionKey,
          createdAt: 1,
          lastActiveAt: 1,
        });
      },
    },
    getDefaultCwd: (agentId?: string) => `/repo/${agentId || 'main'}`,
  });

  expect(sync.isCurrentBindingKey('agent:agent-2:wecom:group:grp_sanitized')).toBe(true);
  expect(sync.resolveOrCreateSession('agent:agent-2:wecom:group:grp_sanitized')).toBe('cowork-1');

  expect(createSession).toHaveBeenCalledWith(
    expect.any(String),
    '/repo/agent-2',
    '',
    'local',
    [],
    'agent-2',
  );
  expect(mappings).toEqual([
    expect.objectContaining({
      coworkSessionId: 'cowork-main',
      agentId: 'main',
      openClawSessionKey: 'agent:main:wecom:group:grp_sanitized',
    }),
    expect.objectContaining({
      coworkSessionId: 'cowork-1',
      agentId: 'agent-2',
      openClawSessionKey: 'agent:agent-2:wecom:group:grp_sanitized',
    }),
  ]);
});

// --- buildChannelDisplayName ---

test('buildChannelDisplayName strips email domain and removes direct prefix', () => {
  expect(buildChannelDisplayName('direct:alice@corp.example.com')).toBe('alice');
});

test('buildChannelDisplayName keeps group prefix', () => {
  expect(buildChannelDisplayName('group:zhangsan@corp.example.com')).toBe('group:zhangsan');
});

test('buildChannelDisplayName handles account:direct:peer format', () => {
  expect(buildChannelDisplayName('bot1:direct:zhangsan@corp.example.com')).toBe('zhangsan');
});

test('buildChannelDisplayName handles account:group:peer format', () => {
  expect(buildChannelDisplayName('bot1:group:lisi@corp.example.com')).toBe('group:lisi');
});

test('buildChannelDisplayName handles channel peerKind', () => {
  expect(buildChannelDisplayName('channel:room-abc')).toBe('ch:room-abc');
});

test('buildChannelDisplayName passes through plain ids', () => {
  expect(buildChannelDisplayName('123456789')).toBe('123456789');
});

test('buildChannelDisplayName passes through non-email conversationId without peerKind', () => {
  expect(buildChannelDisplayName('dm:ou_123')).toBe('dm:ou_123');
});

test('buildChannelDisplayName truncates long results to 20 chars', () => {
  const result = buildChannelDisplayName('direct:a_very_long_username_that_exceeds_limit@example.com');
  expect(result.length).toBeLessThanOrEqual(20);
  expect(result).toBe('a_very_long_username');
});

test('buildChannelDisplayName truncates long fallback ids to 20 chars', () => {
  const result = buildChannelDisplayName('abcdefghijklmnopqrstuvwxyz1234567890');
  expect(result.length).toBeLessThanOrEqual(20);
  // fallback uses slice(-20)
  expect(result).toBe('qrstuvwxyz1234567890');
});
