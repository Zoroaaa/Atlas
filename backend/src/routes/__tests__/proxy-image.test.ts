import { afterEach, describe, expect, it, vi } from 'vitest';
import { javRoutes } from '@/routes/jav';

function createMediaMock(overrides: Record<string, unknown> = {}) {
  return {
    head: vi.fn(async () => null),
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    list: vi.fn(async () => ({ objects: [] })),
    ...overrides,
  };
}

function envWith(media: unknown) {
  return {
    MEDIA: media,
    APP_ENV: 'production',
    MEDIA_PUBLIC_BASE: '',
  } as never;
}

function proxyUrl(target: string): string {
  return `/proxy-image?url=${encodeURIComponent(target)}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('proxy-image 归一化与白名单', () => {
  it('旧代理形态先解包再校验，内层白名单域名可正常取图', async () => {
    const media = createMediaMock();
    const fetchMock = vi.fn(async () => new Response(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      { status: 200, headers: { 'content-type': 'image/jpeg' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const inner = 'https://pics.dmm.co.jp/digital/video/x/xpl.jpg';
    const legacy = `https://old.example.com/api/jav/proxy-image?url=${encodeURIComponent(inner)}`;
    const res = await javRoutes.request(proxyUrl(legacy), undefined, envWith(media));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });

  it('解包后的 host 不在白名单时退回占位图，不回源', async () => {
    const media = createMediaMock();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const inner = 'https://evil.example.com/a.jpg';
    const legacy = `https://old.example.com/api/jav/proxy-image?url=${encodeURIComponent(inner)}`;
    const res = await javRoutes.request(proxyUrl(legacy), undefined, envWith(media));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get('content-type')).toBe('image/gif');
  });

  it('命中失败墓碑时不再回源', async () => {
    const media = createMediaMock({
      head: vi.fn(async (key: string) => (
        key.startsWith('covers/v1/miss/') ? { uploaded: new Date(), size: 0 } : null
      )),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await javRoutes.request(
      proxyUrl('https://pics.dmm.co.jp/digital/video/x/xpl.jpg'),
      undefined,
      envWith(media),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get('content-type')).toBe('image/gif');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });
});
