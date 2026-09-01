// Token-refresh protocol shared by the local OpenAI-compat proxy and the main
// process. Account/auth system was removed; only these two symbols survive
// because the compat proxy still uses them when an upstream provider's token
// refresh fails.
export const AuthRefreshOutcome = {
  NoTokens: 'no_tokens',
  Success: 'success',
  TerminalFailure: 'terminal_failure',
  TransientFailure: 'transient_failure',
} as const;

export type AuthRefreshOutcome = typeof AuthRefreshOutcome[keyof typeof AuthRefreshOutcome];

export type AuthTokenRefreshResult = {
  outcome: AuthRefreshOutcome;
  accessToken?: string;
};
