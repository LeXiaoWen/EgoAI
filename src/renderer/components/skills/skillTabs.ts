/**
 * Skill management tabs.
 *
 * The online skill marketplace has been retired: skills are added locally
 * (ZIP / folder / remote URL import). The active tab is deliberately not
 * persisted across visits.
 */
export const SkillTab = {
  Mine: 'mine',
  BuiltIn: 'builtIn',
} as const;
export type SkillTab = typeof SkillTab[keyof typeof SkillTab];

export const SKILL_TAB_ORDER: readonly SkillTab[] = [SkillTab.BuiltIn, SkillTab.Mine];

export const SKILL_TAB_LABEL_KEYS: Record<SkillTab, string> = {
  [SkillTab.Mine]: 'skillGroupMine',
  [SkillTab.BuiltIn]: 'skillGroupBuiltIn',
};
