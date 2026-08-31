import { describe, expect, test } from 'vitest';

import {
  getLibraryCardActionIds,
  getLibraryPreviewActionIds,
  LibraryItemAction,
} from './libraryItemActionPolicy';

describe('library item action policy', () => {
  test('uses the overflow menu for local file management instead of preview', () => {
    expect(getLibraryCardActionIds()).toEqual([
      LibraryItemAction.ToggleFavorite,
      LibraryItemAction.OpenWithApp,
      LibraryItemAction.RevealLocal,
    ]);
  });

  test('keeps favorite in the preview header and moves local utilities into overflow', () => {
    expect(getLibraryPreviewActionIds()).toEqual([
      LibraryItemAction.OpenWithApp,
      LibraryItemAction.RevealLocal,
    ]);
  });

  test('derives preview overflow from the same complete action set as the card menu', () => {
    const cardActions = getLibraryCardActionIds();
    const previewActions = getLibraryPreviewActionIds();
    expect(cardActions.filter(action => action !== LibraryItemAction.ToggleFavorite))
      .toEqual(previewActions);
  });
});
