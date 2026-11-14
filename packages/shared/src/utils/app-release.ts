export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: GitHubReleaseAsset[];
}

export interface AndroidRelease {
  version: string;
  releaseUrl: string;
  apkUrl: string;
  name: string;
  publishedAt: string | null;
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function parseVersion(version: string): [number, number, number] {
  const parts = normalizeVersion(version).split('.');
  const numbers: number[] = [];
  for (const part of parts.slice(0, 3)) {
    const value = Number.parseInt(part, 10);
    numbers.push(Number.isFinite(value) ? value : 0);
  }
  while (numbers.length < 3) numbers.push(0);
  return numbers as [number, number, number];
}

/** 返回 1 表示 a > b，-1 表示 a < b，0 表示相同 */
export function compareVersions(a: string, b: string): number {
  const versionA = parseVersion(a);
  const versionB = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = versionA[i] - versionB[i];
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** 从 GitHub Releases 中选择版本最高、且真正附带 APK 的正式版本 */
export function selectLatestAndroidRelease(releases: GitHubRelease[]): AndroidRelease | null {
  const candidates = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => {
      const version = normalizeVersion(release.tag_name);
      if (!/^\d+\.\d+\.\d+/.test(version)) return null;
      const apk = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.apk'));
      if (!apk) return null;
      return {
        version,
        releaseUrl: release.html_url,
        apkUrl: apk.browser_download_url,
        name: release.name || `Atlas v${version}`,
        publishedAt: release.published_at,
      } satisfies AndroidRelease;
    })
    .filter((release): release is AndroidRelease => release !== null);

  candidates.sort((a, b) => compareVersions(b.version, a.version));
  return candidates[0] ?? null;
}
