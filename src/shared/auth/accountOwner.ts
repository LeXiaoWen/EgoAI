export interface AccountOwnerUser {
  userId?: unknown;
  id?: unknown;
  yid?: unknown;
}

export const AccountOwnerKeyPrefix = {
  Personal: 'personal:',
} as const;

const normalizeAccountOwnerPart = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
};

export const resolveAccountOwnerUserId = (
  user: AccountOwnerUser | null | undefined,
): string | null => (
  normalizeAccountOwnerPart(user?.userId)
  ?? normalizeAccountOwnerPart(user?.id)
  ?? normalizeAccountOwnerPart(user?.yid)
);

export const createAccountOwnerKey = (input: {
  user: AccountOwnerUser | null | undefined;
}): string | null => {
  const userId = resolveAccountOwnerUserId(input.user);
  if (!userId) return null;
  return `${AccountOwnerKeyPrefix.Personal}${userId}`;
};
