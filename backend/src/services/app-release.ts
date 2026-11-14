import {
  selectLatestAndroidRelease,
  type AndroidRelease,
  type GitHubRelease,
} from '@codeseek/shared/utils';

const RELEASES_API = 'https://api.github.com/repos/Zoroaaa/Atlas/releases?per_page=10';

/**
 * 查询 GitHub Releases，返回最新一个真正附带 APK 的正式版本。
 * 有 GITHUB_RELEASE_TOKEN 时使用认证请求，避免共享出口 IP 被限流。
 */
export async function fetchLatestAndroidRelease(token?: string): Promise<AndroidRelease | null> {
  const response = await fetch(RELEASES_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Atlas-App-Release-Checker',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}`);
  }

  const releases = (await response.json()) as GitHubRelease[];
  return selectLatestAndroidRelease(releases);
}
