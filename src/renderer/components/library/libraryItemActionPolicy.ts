export const LibraryItemAction = {
  ToggleFavorite: 'toggle_favorite',
  OpenWithApp: 'open_with_app',
  RevealLocal: 'reveal_local',
} as const;

export type LibraryItemAction =
  (typeof LibraryItemAction)[keyof typeof LibraryItemAction];

const LOCAL_ACTIONS = [
  LibraryItemAction.ToggleFavorite,
  LibraryItemAction.OpenWithApp,
  LibraryItemAction.RevealLocal,
] as const;

const PREVIEW_PROMOTED_ACTIONS = new Set<LibraryItemAction>([
  LibraryItemAction.ToggleFavorite,
]);

export const getLibraryCardActionIds = (): readonly LibraryItemAction[] => LOCAL_ACTIONS;

export const getLibraryPreviewActionIds = (): readonly LibraryItemAction[] => (
  LOCAL_ACTIONS.filter(action => !PREVIEW_PROMOTED_ACTIONS.has(action))
);
