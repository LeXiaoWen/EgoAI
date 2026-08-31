import type { LibraryItem } from '../../../shared/library/types';
import { i18nService } from '../../services/i18n';

export const formatLibraryTime = (value: number): string => new Intl.DateTimeFormat(
  i18nService.getLanguage() === 'zh' ? 'zh-CN' : 'en-US',
  { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
).format(new Date(value));

export const getLibrarySourceLabel = (): string => i18nService.t('libraryLocalArtifact');

export const getLibraryItemStatus = (item: LibraryItem): string => (
  i18nService.t(`libraryAvailability_${item.availability}`)
);

export const getLibraryDisplayFileName = (item: LibraryItem): string => item.title;
