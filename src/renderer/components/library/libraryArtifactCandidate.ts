import type { LocalArtifactItem } from '../../../shared/library/types';
import type { Artifact } from '../../types/artifact';

export const createLibraryArtifactCandidate = (item: LocalArtifactItem): Artifact => ({
  id: `library-${item.itemId}`,
  messageId: item.latestSession.lastMessageId ?? `library-${item.itemId}`,
  sessionId: item.latestSession.sessionId,
  type: item.artifactType,
  title: item.title,
  content: '',
  fileName: item.title,
  filePath: item.filePath,
  source: 'file',
  createdAt: item.createdAt,
});
