/**
 * Tailwind CSS v3 plugin — bridges --ego-* CSS variables into Tailwind utility classes.
 *
 * Usage in tailwind.config.js:
 *   plugins: [require('./src/renderer/theme/tailwind/plugin.cjs')]
 *
 * Provides: bg-background, text-foreground, bg-primary, border-border, etc.
 * Also provides legacy claude.* aliases for backward compatibility.
 *
 * Colors are wrapped in color-mix() with the <alpha-value> placeholder so that
 * Tailwind opacity modifiers (e.g. text-foreground/90, bg-surface-raised/30)
 * generate working CSS. Without this, var()-based colors silently drop any
 * class that uses an opacity modifier.
 */
const plugin = require('tailwindcss/plugin');

const withAlpha = (variable) =>
  `color-mix(in srgb, var(${variable}) calc(<alpha-value> * 100%), transparent)`;

module.exports = plugin(function () {
  // The plugin itself is a no-op; we only extend the theme below.
}, {
  theme: {
    extend: {
      colors: {
        // === Semantic theme colors (driven by CSS variables) ===
        background:    withAlpha('--ego-background'),
        foreground:    withAlpha('--ego-foreground'),
        primary: {
          DEFAULT:     withAlpha('--ego-primary'),
          foreground:  withAlpha('--ego-primary-foreground'),
          hover:       withAlpha('--ego-primary-hover'),
          muted:       withAlpha('--ego-primary-muted'),
          dark:        withAlpha('--ego-primary-hover'),  // backward compat alias
        },
        accent: {
          DEFAULT:     withAlpha('--ego-accent'),
          foreground:  withAlpha('--ego-accent-foreground'),
        },
        surface: {
          DEFAULT:     withAlpha('--ego-surface'),
          foreground:  withAlpha('--ego-surface-foreground'),
          raised:      withAlpha('--ego-surface-raised'),
          overlay:     withAlpha('--ego-surface-overlay'),
          inset:       withAlpha('--ego-surface-raised'),  // alias
        },
        border: {
          DEFAULT:     withAlpha('--ego-border'),
          subtle:      withAlpha('--ego-border-subtle'),
          input:       withAlpha('--ego-input-border'),
        },
        muted:         withAlpha('--ego-text-muted'),
        destructive: {
          DEFAULT:     withAlpha('--ego-destructive'),
          foreground:  withAlpha('--ego-destructive-foreground'),
        },
        success:       withAlpha('--ego-success'),
        warning:       withAlpha('--ego-warning'),

        // === Legacy claude.* aliases (map to --ego-* for backward compat) ===
        claude: {
          bg:                withAlpha('--ego-background'),
          surface:           withAlpha('--ego-surface'),
          surfaceHover:      withAlpha('--ego-surface-raised'),
          surfaceMuted:      withAlpha('--ego-surface-raised'),
          surfaceInset:      withAlpha('--ego-surface-raised'),
          border:            withAlpha('--ego-border'),
          borderLight:       withAlpha('--ego-border-subtle'),
          text:              withAlpha('--ego-text-primary'),
          textSecondary:     withAlpha('--ego-text-secondary'),
          // dark.* aliases point to the same vars — theme handles light/dark
          darkBg:            withAlpha('--ego-background'),
          darkSurface:       withAlpha('--ego-surface'),
          darkSurfaceHover:  withAlpha('--ego-surface-raised'),
          darkSurfaceMuted:  withAlpha('--ego-surface-raised'),
          darkSurfaceInset:  withAlpha('--ego-surface-raised'),
          darkBorder:        withAlpha('--ego-border'),
          darkBorderLight:   withAlpha('--ego-border-subtle'),
          darkText:          withAlpha('--ego-text-primary'),
          darkTextSecondary: withAlpha('--ego-text-secondary'),
          // Accent
          accent:            withAlpha('--ego-primary'),
          accentHover:       withAlpha('--ego-primary-hover'),
          accentLight:       withAlpha('--ego-primary'),
          accentMuted:       withAlpha('--ego-primary-muted'),
        },
        secondary: {
          DEFAULT: withAlpha('--ego-text-secondary'),
          dark:    withAlpha('--ego-border'),
        },
      },
      borderRadius: {
        theme: 'var(--ego-radius)',
      },
    },
  },
});
