import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  normalizeVersion,
  selectLatestAndroidRelease,
  type GitHubRelease,
} from '@codeseek/shared/utils';
import { compareVersions, fetchLatestAndroidRelease } from '../appUpdate';

function release(
  tag: string,
  options: {
    draft?: boolean;
    prerelease?: boolean;
    assets?: string[];
    url?: string;
  } = {}
): GitHubRelease {
  return {
    tag_name: tag,
    name: `Atlas ${tag}`,
    html_url: options.url ?? `https://github.com/Zoroaaa/Atlas/releases/tag/${tag}`,
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? false,
    published_at: null,
    assets: (options.assets ?? [`Atlas-Android-${normalizeVersion(tag)}.apk`]).map((name) => ({
      name,
      browser_download_url: `https://github.com/Zoroaaa/Atlas/releases/download/${tag}/${name}`,
    })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('appUpdate', () => {
  it('版本号比较按数字而不是字符串', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.8.0', '1.8.0')).toBe(0);
    expect(compareVersions('v1.7.9', '1.8.0')).toBe(-1);
    expect(compareVersions('2.0', '1.9.9')).toBe(1);
  });

  it('只选择正式版且真正带 APK 的 Release', () => {
    const releaseList = [
      release('v2.0.0', { prerelease: true }),
      release('v1.11.0', { draft: true }),
      release('v1.10.0', { assets: [] }),
      release('v1.9.0'),
      release('v1.8.0'),
    ];

    expect(selectLatestAndroidRelease(releaseList)?.version).toBe('1.9.0');
    expect(selectLatestAndroidRelease([])).toBeNull();
  });

  it('多个可用 Release 时取版本最高的，而不是列表第一个', () => {
    const releaseList = [
      release('v1.9.0'),
      release('v1.10.0'),
      release('v1.8.5'),
    ];

    const latest = selectLatestAndroidRelease(releaseList);
    expect(latest?.version).toBe('1.10.0');
    expect(latest?.apkUrl).toContain('Atlas-Android-1.10.0.apk');
    expect(latest?.releaseUrl).toContain('/tag/v1.10.0');
  });

  it('忽略没有语义化版本号的标签', () => {
    expect(selectLatestAndroidRelease([release('nightly')])).toBeNull();
  });

  it('从后端代理读取最新版本并写入缓存', async () => {
    const payload = {
      success: true,
      data: {
        version: '1.9.0',
        releaseUrl: 'https://github.com/Zoroaaa/Atlas/releases/tag/v1.9.0',
        apkUrl: 'https://github.com/Zoroaaa/Atlas/releases/download/v1.9.0/Atlas-Android-1.9.0.apk',
        name: 'Atlas v1.9.0',
        publishedAt: null,
      },
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await fetchLatestAndroidRelease(true);

    expect(result?.version).toBe('1.9.0');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/app-release'),
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(localStorage.getItem('atlas:app-release-cache:v2')).toContain('1.9.0');
  });
});
