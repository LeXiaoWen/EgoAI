const PROJECT_DIRECTORY_STORAGE_PREFIX = 'egoai:node-deployment-project-directory:';

interface LocalServiceProjectDirectoryCache {
  projectDirectory: string;
  updatedAt?: number;
}

function normalizeLocalServiceOrigin(value: string): string {
  try {
    return new URL(value.trim()).origin.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase();
  }
}

function getProjectDirectoryStorageKey(sessionId: string, localServiceUrl: string): string {
  return `${PROJECT_DIRECTORY_STORAGE_PREFIX}${sessionId}:${normalizeLocalServiceOrigin(localServiceUrl)}`;
}

function getLegacyProjectDirectoryStorageKey(sessionId: string, localServiceUrl: string): string {
  return `${PROJECT_DIRECTORY_STORAGE_PREFIX}${sessionId}:${localServiceUrl}`;
}

function parseProjectDirectoryCache(value: string | null): LocalServiceProjectDirectoryCache | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<LocalServiceProjectDirectoryCache>;
    if (typeof parsed.projectDirectory === 'string' && parsed.projectDirectory.trim()) {
      return {
        projectDirectory: parsed.projectDirectory.trim(),
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : undefined,
      };
    }
  } catch {
    // Older versions stored the directory directly.
  }
  return { projectDirectory: trimmed };
}

export function readLocalServiceProjectDirectory(
  sessionId: string,
  localServiceUrl?: string,
): string | undefined {
  if (!localServiceUrl || typeof window === 'undefined') return undefined;
  try {
    const currentValue = window.localStorage.getItem(
      getProjectDirectoryStorageKey(sessionId, localServiceUrl),
    );
    const legacyValue = window.localStorage.getItem(
      getLegacyProjectDirectoryStorageKey(sessionId, localServiceUrl),
    );
    const cache = parseProjectDirectoryCache(currentValue) ??
      parseProjectDirectoryCache(legacyValue);
    return cache?.projectDirectory || undefined;
  } catch {
    return undefined;
  }
}

export function writeLocalServiceProjectDirectory(
  sessionId: string,
  localServiceUrl: string,
  projectDirectory?: string,
): void {
  const value = projectDirectory?.trim();
  if (!value || typeof window === 'undefined') return;
  try {
    const cacheValue = JSON.stringify({
      projectDirectory: value,
      updatedAt: Date.now(),
    } satisfies LocalServiceProjectDirectoryCache);
    const currentKey = getProjectDirectoryStorageKey(sessionId, localServiceUrl);
    window.localStorage.setItem(currentKey, cacheValue);
    const legacyKey = getLegacyProjectDirectoryStorageKey(sessionId, localServiceUrl);
    if (legacyKey !== currentKey) {
      window.localStorage.setItem(legacyKey, cacheValue);
    }
  } catch {
    // Local cache is best-effort only.
  }
}
