/**
 * Token Contract — defines all semantic variables a theme must provide.
 *
 * Naming: --ego-{category}-{name}
 * Convention: shadcn/ui background/foreground pairing + Radix 12-step gray scale
 *
 * Every theme (ThemeDefinition.tokens) must supply a value for each key.
 */
export const TOKEN_CONTRACT = {
  // ── Brand ──
  'primary':            '--ego-primary',
  'primary-foreground': '--ego-primary-foreground',
  'primary-hover':      '--ego-primary-hover',
  'primary-muted':      '--ego-primary-muted',

  // ── Accent ──
  'accent':             '--ego-accent',
  'accent-foreground':  '--ego-accent-foreground',

  // ── Surface / Background ──
  'background':         '--ego-background',
  'foreground':         '--ego-foreground',
  'surface':            '--ego-surface',
  'surface-foreground': '--ego-surface-foreground',
  'surface-raised':     '--ego-surface-raised',
  'surface-overlay':    '--ego-surface-overlay',

  // ── Chat bubbles ──
  'chat-user':              '--ego-chat-user',
  'chat-user-foreground':   '--ego-chat-user-foreground',
  'chat-bot':               '--ego-chat-bot',
  'chat-bot-foreground':    '--ego-chat-bot-foreground',

  // ── Text hierarchy ──
  'text-primary':       '--ego-text-primary',
  'text-secondary':     '--ego-text-secondary',
  'text-muted':         '--ego-text-muted',

  // ── Borders ──
  'border':             '--ego-border',
  'border-subtle':      '--ego-border-subtle',
  'input-border':       '--ego-input-border',

  // ── Scrollbar ──
  'scroll-thumb':       '--ego-scroll-thumb',
  'scroll-thumb-hover': '--ego-scroll-thumb-hover',

  // ── Decorative gradients ──
  'gradient-1':         '--ego-gradient-1',
  'gradient-2':         '--ego-gradient-2',

  // ── Status ──
  'destructive':            '--ego-destructive',
  'destructive-foreground': '--ego-destructive-foreground',
  'success':                '--ego-success',
  'warning':                '--ego-warning',

  // ── Gray scale 11 steps (gray-1=lightest → gray-11=darkest, all themes) ──
  'gray-1':  '--ego-gray-1',
  'gray-2':  '--ego-gray-2',
  'gray-3':  '--ego-gray-3',
  'gray-4':  '--ego-gray-4',
  'gray-5':  '--ego-gray-5',
  'gray-6':  '--ego-gray-6',
  'gray-7':  '--ego-gray-7',
  'gray-8':  '--ego-gray-8',
  'gray-9':  '--ego-gray-9',
  'gray-10': '--ego-gray-10',
  'gray-11': '--ego-gray-11',

  // ── Radius ──
  'radius':  '--ego-radius',
} as const;

export type TokenName = keyof typeof TOKEN_CONTRACT;
export type CSSVarName = (typeof TOKEN_CONTRACT)[TokenName];

/** All token keys as an array */
export const TOKEN_NAMES = Object.keys(TOKEN_CONTRACT) as TokenName[];
