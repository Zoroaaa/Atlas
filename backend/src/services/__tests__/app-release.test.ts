import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestAndroidRelease } from '../app-release';

function githubRelease(tag: string, assets: string[]) {
  return {
    tag_name: tag,
    name: `Atlas ${tag}`,
    html_url: `https://github.com/Zoroaaa/Atlas/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    published_at: null,
    assets: assets.map((name) => ({
      name,
      browser_download_url: `https://github.com/Zoroaaa/Atlas/releases/download/${tag}/${name}`,
    })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchLatestAndroidRelease', () => {
  it('只返回带 APK 的最高版本，并在配置令牌时携带认证头', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          githubRelease('v1.8.0', ['Atlas-Android-1.8.0.apk']),
          githubRelease('v1.9.0', []),
          githubRelease('v1.10.0', ['Atlas-Android-1.10.0.apk']),
        ]),
        { status: 200 }
      )
    );

    const release = await fetchLatestAndroidRelease('test-token');

    expect(release?.version).toBe('1.10.0');
    expect(release?.apkUrl).toContain('Atlas-Android-1.10.0.apk');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((requestInit.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('GitHub 返回非 2xx 时抛错，让路由返回可感知的失败状态', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 403 }));

    await expect(fetchLatestAndroidRelease()).rejects.toThrow('GitHub API 403');
  });
});
