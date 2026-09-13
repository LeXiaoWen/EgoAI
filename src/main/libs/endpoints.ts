const GITHUB_REPO = 'LeXiaoWen/EgoAI';

export const getGitHubReleaseApiUrl = (): string => (
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
);

export const getFallbackDownloadUrl = (): string => (
  `https://github.com/${GITHUB_REPO}/releases`
);
