const EGOAI_SESSION_PREFIX = 'egoai:';
const AGENT_SESSION_PREFIX = 'agent:';
const EGOAI_SESSION_MARKER = 'egoai';
const SUBAGENT_SESSION_MARKER = 'subagent';

export function isEgoAiDesktopSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? '').trim();
  if (!raw) return false;

  if (raw.startsWith(EGOAI_SESSION_PREFIX)) {
    return raw.slice(EGOAI_SESSION_PREFIX.length).trim().length > 0;
  }

  if (!raw.startsWith(AGENT_SESSION_PREFIX)) {
    return false;
  }

  const parts = raw.split(':');
  if (parts.length < 4 || parts[0] !== 'agent') {
    return false;
  }

  const agentId = parts[1]?.trim() ?? '';
  const source = parts[2]?.trim() ?? '';
  const sessionId = parts.slice(3).join(':').trim();
  return agentId.length > 0
    && sessionId.length > 0
    && (source === EGOAI_SESSION_MARKER || source === SUBAGENT_SESSION_MARKER);
}
