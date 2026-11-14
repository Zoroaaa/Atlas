import { compareVersions, type AndroidRelease } from '@codeseek/shared/utils';
import { API_BASE_URL } from '@/constants';
import { isAndroidApp } from '@/utils/nativeShell';

export { compareVersions };
export type { AndroidRelease };

// 走自家后端代理：服务端缓存 GitHub 查询结果，避免客户端限流与网络不可达
const RELEASE_API = `${API_BASE_URL}/app-release`;
const CACHE_KEY = 'atlas:app-release-cache:v2';
const CACHE_TTL = 6 * 60 * 60 * 1000;
const EMPTY_CACHE_TTL = 30 * 60 * 1000;

interface ReleaseCache {
  savedAt: number;
  release: AndroidRelease | null;
}

function readCache(): ReleaseCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReleaseCache;
    if (typeof parsed.savedAt !== 'number') return null;
    const ttl = parsed.release ? CACHE_TTL : EMPTY_CACHE_TTL;
    if (Date.now() - parsed.savedAt > ttl) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(release: AndroidRelease | null): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), release }));
  } catch {
    // 隐私模式或存储已满时忽略
  }
}

export async function fetchLatestAndroidRelease(force = false): Promise<AndroidRelease | null> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached.release;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  // 手动检查绕过浏览器 HTTP 缓存；服务端仍按自己的缓存策略回源
  const requestUrl = force ? `${RELEASE_API}?t=${Date.now()}` : RELEASE_API;

  try {
    const response = await fetch(requestUrl, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`App release API ${response.status}`);
    }
    const payload = (await response.json()) as { success?: boolean; data?: AndroidRelease | null };
    if (!payload.success) {
      throw new Error('App release unavailable');
    }
    const release = payload.data ?? null;
    writeCache(release);
    return release;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getInstalledAppVersion(): Promise<string | null> {
  if (!isAndroidApp()) return null;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return info.version?.replace(/^v/i, '') || null;
  } catch {
    const match = navigator.userAgent.match(/AtlasApp\/([\d.]+)/);
    return match?.[1] ?? null;
  }
}
