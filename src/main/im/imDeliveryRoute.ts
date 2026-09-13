import { buildManagedSessionKey } from '../libs/openclawManagedSessionKey';

export interface OpenClawDeliveryRoute {
  channel: string;
  to: string;
  accountId?: string;
}

type OpenClawSessionListEntry = {
  key?: unknown;
  deliveryContext?: unknown;
  lastChannel?: unknown;
  lastTo?: unknown;
  lastAccountId?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const readTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
};

export function extractOpenClawDeliveryRoute(entry: unknown): OpenClawDeliveryRoute | null {
  if (!isRecord(entry)) {
    return null;
  }

  const typedEntry = entry as OpenClawSessionListEntry;
  const deliveryContext = isRecord(typedEntry.deliveryContext)
    ? typedEntry.deliveryContext
    : null;

  const channel = readTrimmedString(deliveryContext?.channel) ?? readTrimmedString(typedEntry.lastChannel);
  const to = readTrimmedString(deliveryContext?.to) ?? readTrimmedString(typedEntry.lastTo);
  const accountId = readTrimmedString(deliveryContext?.accountId) ?? readTrimmedString(typedEntry.lastAccountId);

  if (!channel || !to) {
    return null;
  }

  return {
    channel,
    to,
    ...(accountId ? { accountId } : {}),
  };
}

export function findOpenClawDeliveryRouteForSession(
  sessionKey: string,
  sessions: unknown[],
): OpenClawDeliveryRoute | null {
  const normalizedSessionKey = sessionKey.trim();
  if (!normalizedSessionKey) {
    return null;
  }

  for (const entry of sessions) {
    if (!isRecord(entry)) {
      continue;
    }
    const entryKey = readTrimmedString(entry.key);
    if (entryKey !== normalizedSessionKey) {
      continue;
    }
    return extractOpenClawDeliveryRoute(entry);
  }

  return null;
}

export function resolveOpenClawDeliveryRouteForSessionKeys(
  sessionKeys: string[],
  sessions: unknown[],
): { sessionKey: string; route: OpenClawDeliveryRoute } | null {
  const seen = new Set<string>();
  for (const rawSessionKey of sessionKeys) {
    const sessionKey = rawSessionKey.trim();
    if (!sessionKey || seen.has(sessionKey)) {
      continue;
    }
    seen.add(sessionKey);

    const route = findOpenClawDeliveryRouteForSession(sessionKey, sessions);
    if (route) {
      return { sessionKey, route };
    }
  }

  return null;
}

export function resolveManagedSessionDeliveryRoute(
  coworkSessionId: string,
  sessions: unknown[],
): { sessionKey: string; route: OpenClawDeliveryRoute } | null {
  return resolveOpenClawDeliveryRouteForSessionKeys([buildManagedSessionKey(coworkSessionId)], sessions);
}
