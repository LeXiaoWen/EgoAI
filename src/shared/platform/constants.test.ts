import { describe, expect, test } from 'vitest';

import { PlatformRegistry } from './constants';

// EgoAI ships a deliberately narrow IM channel set: only the four channels the
// product decided to keep. Widening it is a product decision, not a refactor —
// so this test fails loudly rather than letting a stray definition slip in.
const SHIPPED_PLATFORMS = ['weixin', 'wecom', 'qq', 'email'] as const;

describe('PlatformRegistry', () => {
  test('exposes exactly the shipped platforms, in UI display order', () => {
    expect(PlatformRegistry.platforms).toEqual([...SHIPPED_PLATFORMS]);
  });

  test('resolves every shipped platform and its channel aliases', () => {
    for (const platform of SHIPPED_PLATFORMS) {
      expect(PlatformRegistry.get(platform).id).toBe(platform);
      expect(PlatformRegistry.platformOfChannel(PlatformRegistry.channelOf(platform))).toBe(platform);
      for (const alias of PlatformRegistry.get(platform).channelAliases) {
        expect(PlatformRegistry.platformOfChannel(alias)).toBe(platform);
      }
    }
  });

  test('keeps mapping the wecom alias used by the bundled plugin id', () => {
    expect(PlatformRegistry.platformOfChannel('wecom-openclaw-plugin')).toBe('wecom');
    expect(PlatformRegistry.platformOfChannel('clawemail-email')).toBe('email');
  });

  test('rejects channels EgoAI does not ship', () => {
    for (const removed of ['dingtalk', 'feishu', 'telegram', 'discord']) {
      expect(PlatformRegistry.isIMChannel(removed)).toBe(false);
      expect(PlatformRegistry.platformOfChannel(removed)).toBeUndefined();
    }
  });

  test('every shipped platform points at a distinct logo', () => {
    const logos = SHIPPED_PLATFORMS.map(platform => PlatformRegistry.logo(platform));
    expect(logos.every(Boolean)).toBe(true);
    expect(new Set(logos).size).toBe(logos.length);
  });
});
