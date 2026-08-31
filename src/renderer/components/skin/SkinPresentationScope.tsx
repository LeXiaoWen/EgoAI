import './skinPresentation.css';

import React, { type CSSProperties } from 'react';

import type { SkinPresentation } from '../../../shared/skin/presentation';
import { useSkin } from '../../providers/SkinProvider';

type SkinPresentationStyle = CSSProperties & Record<`--ego-skin-${string}`, string>;

export const buildSkinPresentationStyle = (
  presentation: SkinPresentation,
): SkinPresentationStyle => ({
  '--ego-skin-canvas': presentation.palette.canvas,
  '--ego-skin-panel': presentation.palette.panel,
  '--ego-skin-panel-raised': presentation.palette.panelRaised,
  '--ego-skin-accent': presentation.palette.accent,
  '--ego-skin-accent-foreground': presentation.palette.accentForeground,
  '--ego-skin-accent-alt': presentation.palette.accentAlt,
  '--ego-skin-foreground': presentation.palette.foreground,
  '--ego-skin-muted': presentation.palette.muted,
  '--ego-skin-border': presentation.palette.border,
  '--ego-skin-focus-x': `${(presentation.art?.focusX ?? 0.5) * 100}%`,
  '--ego-skin-focus-y': `${(presentation.art?.focusY ?? 0.5) * 100}%`,
});

interface SkinPresentationScopeProps extends React.HTMLAttributes<HTMLDivElement> {
  enabled: boolean;
}

const SkinPresentationScope: React.FC<SkinPresentationScopeProps> = ({
  children,
  enabled,
  style,
  ...props
}) => {
  const { activeSkin } = useSkin();
  const presentation = enabled ? activeSkin?.presentation : undefined;

  return (
    <div
      {...props}
      data-skin-presentation={presentation?.mode}
      style={presentation ? { ...style, ...buildSkinPresentationStyle(presentation) } : style}
    >
      {children}
    </div>
  );
};

export default SkinPresentationScope;
