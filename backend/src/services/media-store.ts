/**
 * 封面 R2 读写与上游抓取辅助
 *
 * 图片代理与后台回填共用，保证 Content-Type 判定、请求头、大小上限一致。
 */
import type { Env } from '@/types';

/** 单张封面最大 8MB；超过不写入 R2，避免异常大文件占满存储 */
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** 失败墓碑有效期：命中后代理直接出占位图，避免每个页面渲染都回源 */
export const COVER_TOMBSTONE_TTL_MS = 10 * 60_000;

const TOMBSTONE_PREFIX = 'covers/v1/miss';

/** 失败墓碑 key：与封面对象一样是 URL hash 的纯函数 */
export function coverTombstoneKey(hash: string): string {
  return `${TOMBSTONE_PREFIX}/${hash.slice(0, 2)}/${hash}`;
}

/** 记录一次抓取失败，短时间内的代理请求不再回源 */
export async function putCoverTombstone(env: Env, hash: string, error: string): Promise<void> {
  if (!env.MEDIA) return;
  await env.MEDIA.put(coverTombstoneKey(hash), new Uint8Array(0), {
    httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'no-store' },
    customMetadata: { error: error.slice(0, 200), failedAt: String(Date.now()) },
  });
}

/** 抓取成功后立刻清墓碑，源站恢复时不必等 TTL */
export async function clearCoverTombstone(env: Env, hash: string): Promise<void> {
  if (!env.MEDIA) return;
  await env.MEDIA.delete(coverTombstoneKey(hash)).catch(() => undefined);
}

/** 是否存在未过期的失败墓碑 */
export async function hasFreshCoverTombstone(env: Env, hash: string): Promise<boolean> {
  if (!env.MEDIA) return false;
  const head = await env.MEDIA.head(coverTombstoneKey(hash));
  if (!head) return false;
  const uploadedAt = head.uploaded instanceof Date ? head.uploaded.getTime() : new Date(head.uploaded).getTime();
  return Number.isFinite(uploadedAt) && Date.now() - uploadedAt < COVER_TOMBSTONE_TTL_MS;
}

/**
 * 读取响应体并限制大小。
 * 先看 Content-Length 快速拒绝；缺失或不准时边读边计数，超限立即取消，
 * 避免把异常大文件整个读进内存。返回 null 表示超过上限。
 */
export async function readBodyWithLimit(resp: Response, maxBytes: number): Promise<ArrayBuffer | null> {
  const declared = Number(resp.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!resp.body) {
    const data = await resp.arrayBuffer();
    return data.byteLength > maxBytes ? null : data;
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

/** 部分 CDN 返回 application/octet-stream，按文件头识别图片类型 */
export function detectImageMime(data: ArrayBuffer): string | null {
  const bytes = new Uint8Array(data.slice(0, 12));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return null;
}

/** 按目标域名设置 Referer，部分图床没有 Referer 会 403 */
export function buildCoverFetchHeaders(url: URL): Record<string, string> {
  const refererMap: Record<string, string> = {
    'lain.bgm.tv': 'https://bgm.tv/',
    'www.javbus.com': 'https://www.javbus.com/',
    'javbus.com': 'https://www.javbus.com/',
    'pics.javbus.com': 'https://www.javbus.com/',
    'img.javbus.com': 'https://www.javbus.com/',
    'tp.spfcas.com': 'https://javdb.com/',
    'www.xqishuta.org': 'https://www.xqishuta.org/',
    'www.minnano-av.com': 'https://www.minnano-av.com/',
  };
  const host = url.hostname;
  const referer = host.endsWith('jdbstatic.com') || host.endsWith('javdb.com')
    ? 'https://javdb.com/'
    : refererMap[host] || `https://${host}/`;

  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': referer,
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

/** 公网访问地址；未配置或本地开发时返回 null，代理退化为从 R2 直出字节 */
export function coverPublicUrl(env: Env, objectKey: string): string | null {
  // 本地 wrangler dev 的 R2 是模拟器，不能跳到生产公网域名，否则图片 404
  if (env.APP_ENV === 'development') return null;
  const base = env.MEDIA_PUBLIC_BASE?.trim().replace(/\/+$/, '');
  return base ? `${base}/${objectKey}` : null;
}

/**
 * 写入 R2。对象不可变：同一 key 重复写入等价于覆盖，内容应保持一致。
 * 元数据里的 Cache-Control 是 CDN 长缓存的前提。
 */
export async function putCoverObject(
  env: Env,
  objectKey: string,
  data: ArrayBuffer,
  contentType: string,
  sourceHost: string,
): Promise<void> {
  if (!env.MEDIA) return;
  await env.MEDIA.put(objectKey, data, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      srcHost: sourceHost.slice(0, 255),
      storedAt: String(Date.now()),
    },
  });
}
