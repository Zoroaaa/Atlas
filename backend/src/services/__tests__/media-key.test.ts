import { describe, expect, it } from 'vitest';
import {
  coverNamespaceForHost,
  coverObjectRef,
  invalidCoverObjectRef,
  isAllowedCoverHost,
  normalizeCoverUrl,
} from '@/services/media-key';

describe('media-key 封面 URL 归一化', () => {
  it('协议相对地址补 https，并去掉 fragment', () => {
    expect(normalizeCoverUrl('//www.javbus.com/pics/cover/a.jpg#x'))
      .toBe('https://www.javbus.com/pics/cover/a.jpg');
  });

  it('从旧代理地址中取出内层原始 URL', () => {
    const proxied = `https://atlas.wort.uk/api/jav/proxy-image?url=${encodeURIComponent('https://lain.bgm.tv/pic/cover/l/ab/cd/1.jpg')}`;
    expect(normalizeCoverUrl(proxied)).toBe('https://lain.bgm.tv/pic/cover/l/ab/cd/1.jpg');
  });

  it('JavDB 令牌 CDN 归一化为公网 CDN', () => {
    expect(normalizeCoverUrl('https://tp.spfcas.com/token123/covers/ve/abc.jpg'))
      .toBe('https://c0.jdbstatic.com/covers/ve/abc.jpg');
  });

  it('保留 query 参数（签名参数不能删）', () => {
    expect(normalizeCoverUrl('https://image.tmdb.org/t/p/w500/a.jpg?token=1&x=2'))
      .toBe('https://image.tmdb.org/t/p/w500/a.jpg?token=1&x=2');
  });

  it('拒绝相对路径与非 http(s) 协议', () => {
    expect(normalizeCoverUrl('/local/a.jpg')).toBeNull();
    expect(normalizeCoverUrl('data:image/png;base64,abc')).toBeNull();
    expect(normalizeCoverUrl('')).toBeNull();
  });
});

describe('media-key host 与 namespace', () => {
  it('放行 JavDB 的 CDN 子域', () => {
    expect(isAllowedCoverHost('c0.jdbstatic.com')).toBe(true);
    expect(isAllowedCoverHost('evil-jdbstatic.com')).toBe(false);
    expect(isAllowedCoverHost('www.minnano-av.com')).toBe(true);
  });

  it('按 host 归类', () => {
    expect(coverNamespaceForHost('www.javbus.com')).toBe('jav');
    expect(coverNamespaceForHost('lain.bgm.tv')).toBe('anime');
    expect(coverNamespaceForHost('image.tmdb.org')).toBe('movie');
    expect(coverNamespaceForHost('uploads.mangadex.org')).toBe('manga');
    expect(coverNamespaceForHost('zh.annas-archive.gl')).toBe('novel');
    expect(coverNamespaceForHost('www.minnano-av.com')).toBe('person');
    expect(coverNamespaceForHost('www.xqishuta.org')).toBe('misc');
  });
});

describe('media-key 对象 key', () => {
  it('是 URL 的纯函数，且包含 namespace 与两位分片', async () => {
    const a = await coverObjectRef('https://www.javbus.com/pics/cover/a.jpg');
    const b = await coverObjectRef('https://www.javbus.com/pics/cover/a.jpg');
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a!.objectKey).toBe(
      `covers/v1/orig/jav/${a!.hash.slice(0, 2)}/${a!.hash}`
    );
  });

  it('白名单外的 host 不生成可缓存 key', async () => {
    await expect(coverObjectRef('https://example.com/a.jpg')).resolves.toBeNull();
  });

  it('非法 cover 生成稳定的失败账本 key', async () => {
    const a = await invalidCoverObjectRef('/local/a.jpg');
    const b = await invalidCoverObjectRef('/local/a.jpg');
    expect(a.hash).toBe(b.hash);
    expect(a.objectKey.startsWith('covers/v1/orig/misc/')).toBe(true);
  });
});
