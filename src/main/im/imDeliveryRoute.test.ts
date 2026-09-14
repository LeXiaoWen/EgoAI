import { expect,test } from 'vitest';

import {
  extractOpenClawDeliveryRoute,
  resolveManagedSessionDeliveryRoute,
  resolveOpenClawDeliveryRouteForSessionKeys,
} from './imDeliveryRoute';

test('managed session delivery route prefers deliveryContext over legacy last route fields', () => {
  const resolved = resolveManagedSessionDeliveryRoute('session-1', [
    {
      key: 'agent:main:egoai:session-1',
      lastChannel: 'wecom',
      lastTo: 'user:legacy-user',
      lastAccountId: 'legacy-account',
      deliveryContext: {
        channel: 'wecom',
        to: 'group:cid-123',
        accountId: '__default__',
      },
    },
  ]);

  expect(resolved).toEqual({
    sessionKey: 'agent:main:egoai:session-1',
    route: {
      channel: 'wecom',
      to: 'group:cid-123',
      accountId: '__default__',
    },
  });
});

test('managed session delivery route falls back to last route fields', () => {
  const resolved = resolveManagedSessionDeliveryRoute('session-2', [
    {
      key: 'agent:main:egoai:session-2',
      lastChannel: 'qqbot',
      lastTo: 'user:staff-42',
      lastAccountId: 'acct-1',
    },
  ]);

  expect(resolved).toEqual({
    sessionKey: 'agent:main:egoai:session-2',
    route: {
      channel: 'qqbot',
      to: 'user:staff-42',
      accountId: 'acct-1',
    },
  });
});

test('route lookup matches the first candidate key that has a delivery route', () => {
  const resolved = resolveOpenClawDeliveryRouteForSessionKeys(
    ['agent:main:egoai:missing', 'agent:main:egoai:session-3'],
    [
      {
        key: 'agent:main:egoai:session-3',
        deliveryContext: {
          channel: 'openclaw-weixin',
          to: 'group:cid-42',
          accountId: '__default__',
        },
      },
    ],
  );

  expect(resolved).toEqual({
    sessionKey: 'agent:main:egoai:session-3',
    route: {
      channel: 'openclaw-weixin',
      to: 'group:cid-42',
      accountId: '__default__',
    },
  });
});

test('delivery route extraction ignores incomplete session rows', () => {
  expect(extractOpenClawDeliveryRoute({ key: 'agent:main:egoai:session-3' })).toBe(null);
  expect(extractOpenClawDeliveryRoute({ deliveryContext: { channel: 'wecom' } })).toBe(null);
  expect(extractOpenClawDeliveryRoute(null)).toBe(null);
});

test('managed session route lookup returns null when no session matches', () => {
  expect(resolveManagedSessionDeliveryRoute('session-4', [])).toBe(null);
  expect(resolveManagedSessionDeliveryRoute('  ', [])).toBe(null);
});
