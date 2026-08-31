import { describe, expect, test } from 'vitest';

import { isEgoAiDesktopSessionKey } from '../../../openclaw-extensions/ego-media-generation/sessionKey';

describe('ego-media-generation session key gating', () => {
  test('allows main agent desktop sessions', () => {
    expect(isEgoAiDesktopSessionKey('agent:main:egoai:session-1')).toBe(true);
  });

  test('allows non-main agent desktop sessions', () => {
    expect(isEgoAiDesktopSessionKey('agent:creative-agent:egoai:session-2')).toBe(true);
  });

  test('allows materialized subagent child sessions', () => {
    expect(isEgoAiDesktopSessionKey('agent:creative-agent:subagent:run-1')).toBe(true);
  });

  test('allows legacy desktop sessions', () => {
    expect(isEgoAiDesktopSessionKey('egoai:session-3')).toBe(true);
  });

  test('rejects channel and malformed session keys', () => {
    expect(isEgoAiDesktopSessionKey('agent:creative-agent:dingtalk-connector:direct:user-1')).toBe(false);
    expect(isEgoAiDesktopSessionKey('')).toBe(false);
    expect(isEgoAiDesktopSessionKey('agent::egoai:session-4')).toBe(false);
    expect(isEgoAiDesktopSessionKey('agent:creative-agent:egoai:')).toBe(false);
    expect(isEgoAiDesktopSessionKey('agent:creative-agent')).toBe(false);
  });
});
