/**
 * 封面对象的纯函数规则
 *
 * 这里只做「URL → 对象 key」的确定性计算，不读写数据库、不发请求。
 * 代理接口与后台回填必须共用本文件，否则同一张图会算出两个 key。
 *
 * key 规则：
 *   covers/v1/orig/<namespace>/<sha256 前 2 位>/<sha256>
 *
 * 不变式：host → namespace 的映射只增不改。已有 host 不允许改分类，
 * 否则同一 URL 会算出两个 key，产生重复对象。
 */
import { normalizeJavdbCover } from './javdb-cover';

export type CoverNamespace = 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'person' | 'misc';

export interface CoverObjectRef {
  /** 归一化后的完整 URL，也是 cover_assets.url 的值 */
  normalizedUrl: string;
  /** sha256(normalizedUrl) 的小写 hex */
  hash: string;
  namespace: CoverNamespace;
  /** covers/v1/orig/<namespace>/<hash[0:2]>/<hash> */
  objectKey: string;
}

/** 允许代理的封面 host。与旧版 jav.ts 的白名单保持一致。 */
const ALLOWED_IMAGE_HOSTS = new Set([
  'www.javbus.com',
  'javbus.com',
  'pics.javbus.com',
  'img.javbus.com',
  'tp.spfcas.com',
  'javdb.com',
  'www.javdb.com',
  'lain.bgm.tv',
  'image.tmdb.org',
  'uploads.mangadex.org',
  'zh.annas-archive.gl',
  'zh.annas-archive.pk',
  'zh.annas-archive.gd',
  'annas-archive.gl',
  'annas-archive.pk',
  'annas-archive.gd',
  'covers.z-lib.sk',
  'covers.z-lib.to',
  'covers.z-lib.se',
  'covers.z-lib.org',
  'covers1.z-lib.sk',
  'www.xqishuta.org',
  'www.minnano-av.com',
]);

export function isAllowedCoverHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_IMAGE_HOSTS.has(host)) return true;
  return host === 'jdbstatic.com'
    || host.endsWith('.jdbstatic.com')
    || host === 'javdb.com'
    || host.endsWith('.javdb.com');
}

export function coverNamespaceForHost(hostname: string): CoverNamespace {
  const host = hostname.toLowerCase();
  if (
    host === 'javbus.com' || host.endsWith('.javbus.com')
    || host === 'javdb.com' || host.endsWith('.javdb.com')
    || host === 'jdbstatic.com' || host.endsWith('.jdbstatic.com')
    || host === 'tp.spfcas.com'
  ) return 'jav';
  if (host === 'lain.bgm.tv') return 'anime';
  if (host === 'image.tmdb.org') return 'movie';
  if (host === 'uploads.mangadex.org') return 'manga';
  if (host.includes('annas-archive.') || host.startsWith('covers.z-lib.') || host.startsWith('covers1.z-lib.')) {
    return 'novel';
  }
  if (host === 'www.minnano-av.com') return 'person';
  return 'misc';
}

function extractProxiedUrl(value: string): string | null {
  const match = value.match(/[?&]url=([^&#]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * 归一化封面 URL。
 * 返回 null 表示不可缓存（相对路径、非 http(s)、非法 URL）。
 */
export function normalizeCoverUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value) return null;

  // 抓取 HTML 里的 &amp; 在入库前可能没有解码
  value = value.replace(/&amp;/g, '&');

  // 历史数据里可能存的是旧代理地址，先取出内层原始地址
  const inner = extractProxiedUrl(value);
  if (inner) value = inner.trim();
  if (!value) return null;

  if (value.startsWith('//')) value = `https:${value}`;
  // 相对路径无法确定 host，按不可缓存处理
  if (value.startsWith('/')) return null;

  // JavDB 令牌 CDN → 公网 CDN；非法 URL 会原样返回，交给下面 new URL 判定
  value = normalizeJavdbCover(value) ?? value;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  // query 必须保留：不少图床的签名/令牌在 query 里
  parsed.hash = '';
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * URL → R2 对象引用。
 * host 不在白名单或 URL 不可解析时返回 null（调用方决定是否记账为 failed）。
 */
export async function coverObjectRef(raw: string | null | undefined): Promise<CoverObjectRef | null> {
  const normalizedUrl = normalizeCoverUrl(raw);
  if (!normalizedUrl) return null;

  const parsed = new URL(normalizedUrl);
  if (!isAllowedCoverHost(parsed.hostname)) return null;

  const hash = await sha256Hex(normalizedUrl);
  const namespace = coverNamespaceForHost(parsed.hostname);
  return {
    normalizedUrl,
    hash,
    namespace,
    objectKey: `covers/v1/orig/${namespace}/${hash.slice(0, 2)}/${hash}`,
  };
}

/**
 * 给无法归一化 / 不在白名单的 cover 生成一个稳定的失败账本 key。
 * 不会写入 R2，只用于避免每条批次反复重试同一条坏数据。
 */
export async function invalidCoverObjectRef(raw: string): Promise<CoverObjectRef> {
  const hash = await sha256Hex(String(raw));
  const namespace: CoverNamespace = 'misc';
  return {
    normalizedUrl: String(raw).slice(0, 2000),
    hash,
    namespace,
    objectKey: `covers/v1/orig/${namespace}/${hash.slice(0, 2)}/${hash}`,
  };
}
