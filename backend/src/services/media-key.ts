/**
 * 封面对象 key 的纯函数规则：只做 URL → R2 key 的确定性计算，不读写数据库、不发请求。
 *
 * 代理接口与后台回填必须共用本文件，否则同一张图会算出两个 key；key 格式为
 * covers/v1/orig/<namespace>/<sha256 前 2 位>/<sha256>，host → namespace 映射只增不改。
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

/**
 * 允许代理/缓存的封面 host 白名单。
 * 新增图床必须同时在 coverNamespaceForHost 里指定命名空间，否则 key 会落到 misc。
 */
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
  'www.qishuxia.com',
  'www.minnano-av.com',
  'pics.dmm.co.jp',
  'image.mgstage.com',
]);

/** 白名单判断；javdb/jdbstatic 用子域后缀放行，避免新增 CDN 节点时漏配。 */
export function isAllowedCoverHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_IMAGE_HOSTS.has(host)) return true;
  return host === 'jdbstatic.com'
    || host.endsWith('.jdbstatic.com')
    || host === 'javdb.com'
    || host.endsWith('.javdb.com');
}

/**
 * host → 命名空间映射。
 * 该映射只增不改：改分类会让同一 URL 算出两个 key，形成重复对象且无法回收。
 */
export function coverNamespaceForHost(hostname: string): CoverNamespace {
  const host = hostname.toLowerCase();
  if (
    host === 'javbus.com' || host.endsWith('.javbus.com')
    || host === 'javdb.com' || host.endsWith('.javdb.com')
    || host === 'jdbstatic.com' || host.endsWith('.jdbstatic.com')
    || host === 'tp.spfcas.com'
    || host === 'pics.dmm.co.jp'
    || host === 'image.mgstage.com'
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

/** 计算小写 hex SHA-256，作为对象 key 与墓碑 key 的共同来源。 */
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
