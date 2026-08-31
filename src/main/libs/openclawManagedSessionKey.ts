/**
 * OpenClaw managed session key format for desktop-originated sessions.
 *
 * Desktop sessions created by the OpenClaw gateway use a "managed" key
 * (`egoai:<sessionId>` for the main agent, or
 * `agent:<agentId>:egoai:<sessionId>` for a specific agent) so the gateway
 * can route callbacks back to the correct local Cowork session.
 */

const EGOAI_SESSION_PREFIX = 'egoai:';
export const DEFAULT_MANAGED_AGENT_ID = 'main';

export interface ManagedSessionKey {
  agentId: string | null;
  sessionId: string;
}

export function buildManagedSessionKey(
  sessionId: string,
  agentId = DEFAULT_MANAGED_AGENT_ID,
): string {
  const normalizedSessionId = sessionId.trim();
  const normalizedAgentId = agentId.trim() || DEFAULT_MANAGED_AGENT_ID;
  return `agent:${normalizedAgentId}:egoai:${normalizedSessionId}`;
}

export function parseManagedSessionKey(
  sessionKey: string | undefined | null,
): ManagedSessionKey | null {
  const raw = (sessionKey ?? '').trim();
  if (!raw) return null;

  if (raw.startsWith(EGOAI_SESSION_PREFIX)) {
    const sessionId = raw.slice(EGOAI_SESSION_PREFIX.length).trim();
    return sessionId ? { agentId: null, sessionId } : null;
  }

  if (!raw.startsWith('agent:')) {
    return null;
  }

  const parts = raw.split(':');
  if (parts.length < 4 || parts[0] !== 'agent' || parts[2] !== 'egoai') {
    return null;
  }

  const agentId = parts[1]?.trim();
  const sessionId = parts.slice(3).join(':').trim();
  if (!agentId || !sessionId) {
    return null;
  }

  return { agentId, sessionId };
}

export function isManagedSessionKey(sessionKey: string | undefined | null): boolean {
  return parseManagedSessionKey(sessionKey) !== null;
}
