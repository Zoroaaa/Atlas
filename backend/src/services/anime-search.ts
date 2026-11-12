/**
 * 动漫搜索服务
 * 元数据: Bangumi API
 * 磁力资源: Nyaa.si RSS（?page=rss）
 *
 * ⚠️ 类型契约：本文件导出的接口（BangumiSubject, NyaaTorrent, MikanItem, DmhyItem, AnimeSearchResult）
 *    与 frontend/src/types/search.ts 保持结构同步。
 *    修改任一端时，请同步更新另一端。
 *
 * 改用 RSS 原因：
 *   HTML 接口从 Cloudflare Workers 出站 IP 请求时触发 bot protection，
 *   返回 403 或 JS challenge 页，原 HTML 正则静默失败返回空数组。
 *   RSS 接口对机器客户端宽松，且字段语义明确，无需脆弱的 HTML 解析。
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface BangumiSubject {
  id: number;
  name: string;
  nameCN: string;
  cover: string;
  summary: string;
  airDate: string;
  airWeekday?: number;
  rating: number;
  ratingCount?: number;
  rank?: number;
  eps: number;
  url: string;
  type?: string;
  studio?: string;
  tags?: string[];
  collection?: { wish: number; collect: number; doing: number; dropped: number };
  status?: string;
}

export interface NyaaTorrent {
  id: string;
  title: string;
  magnet: string;
  torrentUrl: string;
  size: string;
  date: string;
  seeders: number;
  leechers: number;
  completed: number;
  trusted: boolean;
  category: string;
  source?: string;
  sourceLabel?: string;
  hasSeedData?: boolean;
  detailUrl?: string;
}

export interface MikanItem {
  title: string;
  magnet: string;
  size: string;
  pubDate: string;
  group: string;
  /** 原站番剧页（未解析磁力的条目靠它落地） */
  detailUrl: string;
}


/** DMHY（动漫花园）单条资源 */
export interface DmhyItem {
  title: string;
  magnet: string;
  size: string;
  pubDate: string;
  group: string;
  detailUrl: string;
}

/** 统一资源类型（归组用，合并各源资源） */
export interface AnimeUnifiedResource {
  /** 来源标识：nyaa | mikan | animetosho | dmhy */
  source: 'nyaa' | 'mikan' | 'animetosho' | 'dmhy';
  /** 来源显示名 */
  sourceLabel: string;
  /** 资源标题 */
  title: string;
  /** 磁力链接 */
  magnet: string;
  /** 文件大小 */
  size: string;
  /** 发布日期 */
  date: string;
  /** 做种数（DMHY/Mikan 无此数据） */
  seeders: number;
  /** 下载者数（DMHY/Mikan 无此数据） */
  leechers: number;
  /** 字幕组 */
  group?: string;
  /** 可信标记（仅 nyaa） */
  trusted?: boolean;
  /** 原站详情页 */
  detailUrl?: string;
}

/** 归组结果项 */
export interface AnimeGroupedItem {
  /** 关联的 Bangumi 作品 */
  subject: BangumiSubject;
  /** 该作品下所有匹配的资源 */
  resources: AnimeUnifiedResource[];
}

export interface AnimeSearchResult {
  keyword: string;
  page: number;
  bgm: BangumiSubject[];
  nyaa: NyaaTorrent[];
  mikan: MikanItem[];
  animetosho: NyaaTorrent[];
  dmhy: DmhyItem[];
  total: number;
  /** 是否还有下一页（Bangumi 分页结果 > 当前页末尾） */
  hasMore?: boolean;
  errors: {
    bangumi: string | null;
    nyaa: string | null;
    mikan: string | null;
    animetosho: string | null;
    dmhy: string | null;
  };
  /** 按源的失败语义（与漫画/影视/小说对齐） */
  errorKinds?: Record<string, SearchErrorKind>;
  /** 作品级归组结果（v1.3.0 新增） */
  grouped?: {
    groups: AnimeGroupedItem[];
    ungrouped: AnimeUnifiedResource[];
  };
}

import { fetchWithRetry } from '@/utils/fetch';
import { formatBytes } from '@/utils/format';
import { sanitizeError, classifySearchError, type SearchErrorKind } from '@/utils/error';
import { groupResourcesBySubject } from '@/utils/title-grouping';

// ─── Nyaa.si RSS 搜索 ─────────────────────────────────────────────────

const NYAA_TRACKERS = [
  'http://nyaa.tracker.wf:7777/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
].map(t => `&tr=${encodeURIComponent(t)}`).join('');

const NYAA_CAT_MAP: Record<string, string> = {
  '1_1': 'Anime Music Video',
  '1_2': 'Anime Eng',
  '1_3': 'Anime Non-Eng',
  '1_4': 'Anime Raw',
  '1_0': 'Anime',
  '0_0': 'All',
};

/** 提取 XML 单个标签文本，自动处理 CDATA */
function xmlTag(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`,
    'i'
  );
  const m = xml.match(re);
  if (!m) return '';
  return (m[1] ?? m[2] ?? '').trim();
}

/** RSS 文本里的 XML 实体还原（DMHY 的 magnet 参数含 &amp;） */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** RFC-2822 pubDate → YYYY-MM-DD */
function parseRssDate(pubDate: string): string {  if (!pubDate) return '';
  try {
    const d = new Date(pubDate);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  } catch { return ''; }
}

/** 解析 Nyaa RSS XML，返回 NyaaTorrent 列表 */
function parseNyaaRss(xml: string): NyaaTorrent[] {
  // 拿到 HTML 说明被 bot protection 拦截或重定向，抛出而非静默返回 []
  if (/<html[\s>]/i.test(xml)) {
    throw new Error('nyaa_rss_blocked: response is HTML (bot protection or redirect)');
  }
  if (!xml.includes('<item')) {
    return []; // 正常无结果
  }

  const results: NyaaTorrent[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null) {
    const item = m[1];

    const title = xmlTag(item, 'title');
    if (!title) continue;

    const infoHash = xmlTag(item, 'nyaa:infoHash').toLowerCase();
    // infoHash 是 40 位 hex，缺失则跳过（非正常 torrent 条目）
    if (!infoHash || !/^[a-f0-9]{40}$/.test(infoHash)) continue;

    // 从 <link> 提取 view ID
    const linkM = item.match(/<link>\s*(https?:\/\/nyaa\.si\/view\/(\d+))\s*<\/link>/i);
    const viewId = linkM?.[2] ?? '';

    const magnet     = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}${NYAA_TRACKERS}`;
    const catId      = xmlTag(item, 'nyaa:categoryId');
    const trusted    = xmlTag(item, 'nyaa:trusted').toLowerCase() === 'yes';
    const size       = xmlTag(item, 'nyaa:size');
    const date       = parseRssDate(xmlTag(item, 'pubDate'));
    const seeders    = parseInt(xmlTag(item, 'nyaa:seeders'))   || 0;
    const leechers   = parseInt(xmlTag(item, 'nyaa:leechers'))  || 0;
    const completed  = parseInt(xmlTag(item, 'nyaa:downloads')) || 0;

    results.push({
      id:          viewId,
      title,
      magnet,
      torrentUrl:  viewId ? `https://nyaa.si/download/${viewId}.torrent` : '',
      size,
      date,
      seeders,
      leechers,
      completed,
      trusted,
      category:    NYAA_CAT_MAP[catId] ?? 'Anime',
      source:      'nyaa',
      sourceLabel: 'Nyaa.si',
      hasSeedData: true,
      detailUrl:   viewId ? `https://nyaa.si/view/${viewId}` : '',
    });
  }
  return results;
}

/** Nyaa RSS 主搜索，带 429 重试（指数退避，最多 2 次）
 *  注意：当前因部署环境无法解决 nyaa.si 验证，未在 searchAnime 中调用，保留导出便于后续恢复或单独测试。
 */
export async function fetchNyaa(keyword: string): Promise<NyaaTorrent[]> {
  const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(keyword)}&c=1_0&f=0`;
  const r = await fetchWithRetry(url, {
    headers: {
      'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; FeedFetcher/1.0)',
    },
    signal: AbortSignal.timeout(15000),
  }, { retries: 2, baseDelay: 1500 });

  if (!r.ok) {
    throw new Error(`nyaa_rss_http_${r.status}`);
  }

  const xml = await r.text();
  return parseNyaaRss(xml);
}

// ─── AnimeTosho 搜索页（HTML）─────────────────────────────────────────

/**
 * URL: https://animetosho.org/search?q={keyword}
 *
 * 原 JSON 端点 feed.animetosho.org/json 已无 A 记录（公共 DNS 只返回 SOA），
 * Workers 侧 DNS 解析失败，表现为「数据源暂时不可用」；站点页面本身正常。
 * 因此改为解析搜索页 HTML，返回格式复用 NyaaTorrent（结构一致）。
 */
async function fetchAnimeTosho(keyword: string): Promise<NyaaTorrent[]> {
  const url = `https://animetosho.org/search?q=${encodeURIComponent(keyword)}`;
  const r = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!r.ok) {
    throw new Error(`animetosho_http_${r.status}`);
  }

  const html = await r.text();
  // 搜索页单页最多 75 条；与其它源保持同一量级，取前 30 条
  return parseAnimeToshoHtml(html).slice(0, 30);
}

/** AnimeTosho 通用 trackers */
const AT_TRACKERS = [
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'http://nyaa.tracker.wf:7777/announce',
].map(t => `&tr=${encodeURIComponent(t)}`).join('');

/**
 * 解析 AnimeTosho 搜索结果页。
 * 每条记录形如：
 *   <div class="home_list_entry ...">
 *     <div class="size" title="Total file size: 38,431,887,673 bytes">35.79 GB</div>
 *     <div class="link"><a href="https://animetosho.org/view/xxx.n2077734">标题</a></div>
 *     ... <a href="magnet:?xt=urn:btih:<base32>&...">Magnet</a>
 *     <span title="Seeders: 4 / Leechers: 1">
 *     <a href="https://nyaa.si/download/2077734.torrent">
 */
function parseAnimeToshoHtml(html: string): NyaaTorrent[] {
  const chunks = html.split(/<div class="home_list_entry[^"]*"/).slice(1);
  const items: NyaaTorrent[] = [];

  for (const chunk of chunks) {
    const link = chunk.match(/<div class="link"><a href="(https:\/\/animetosho\.org\/view\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/div>/);
    if (!link) continue;

    const detailUrl = link[1];
    const title = decodeXmlEntities(link[2].replace(/<[^>]+>/g, '')).trim();
    if (!title) continue;

    const sizeMatch = chunk.match(/<div class="size"[^>]*title="Total file size: ([\d,]+) bytes"/);
    const size = sizeMatch ? formatBytes(parseInt(sizeMatch[1].replace(/,/g, '')) || 0) : '';

    // 页面里的 btih 是 32 位 base32，转成 40 位 hex 后统一拼 magnet
    const magnetMatch = chunk.match(/href="magnet:\?xt=urn:btih:([A-Za-z0-9]{32,40})/);
    let magnet = '';
    if (magnetMatch) {
      const raw = magnetMatch[1];
      const hex = raw.length === 32 ? btihBase32ToHex(raw) : raw.toLowerCase();
      magnet = `magnet:?xt=urn:btih:${hex.toUpperCase()}${AT_TRACKERS}`;
    }

    const seedMatch = chunk.match(/title="Seeders: (\d+) \/ Leechers: (\d+)"/);
    const nyaaId = chunk.match(/nyaa\.si\/view\/(\d+)/)?.[1]
      || detailUrl.match(/\.n(\d+)$/)?.[1]
      || '';
    const torrentUrl = chunk.match(/href="(https:\/\/nyaa\.si\/download\/\d+\.torrent)"/)?.[1] || '';
    const dateMatch = chunk.match(/title="Date\/time submitted: (\d{2})\/(\d{2})\/(\d{4})/);
    const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : '';

    items.push({
      id: nyaaId || detailUrl,
      title,
      magnet,
      torrentUrl,
      size,
      date,
      seeders: seedMatch ? parseInt(seedMatch[1]) || 0 : 0,
      leechers: seedMatch ? parseInt(seedMatch[2]) || 0 : 0,
      completed: 0,
      trusted: false,
      category: 'Anime',
      source: 'animetosho' as const,
      sourceLabel: 'AnimeTosho',
      hasSeedData: !!seedMatch,
      detailUrl,
    });
  }

  return items;
}

// formatBytes 已从 @/utils/format 导入，此处不再重复定义

// ─── Mikan Project RSS 搜索 ────────────────────────────────────────────

/**
 * Mikan Project RSS 搜索
 * URL: https://mikanani.me/RSS/Search?searchstr={keyword}
 *
 * Mikan RSS 不直接提供 magnet 链接：
 *   <link>       → 番剧页面 URL（非 magnet）
 *   <enclosure>  → .torrent 文件下载地址
 *
 * 策略：下载 .torrent → bencode 解析提取 infoHash → 拼接 magnet
 */

const MIKAN_TRACKERS = [
  'udp://open.stealth.si:80/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
].map(t => `&tr=${encodeURIComponent(t)}`).join('');

// ── 最小 bencode 解码器（仅支持解析 .torrent 提取 info hash ──

function decodeBencodeString(buf: Uint8Array, pos: [number]): Uint8Array {
  let lenStr = '';
  while (buf[pos[0]] !== 0x3a) { // ':'
    lenStr += String.fromCharCode(buf[pos[0]]);
    pos[0]++;
  }
  pos[0]++; // skip ':'
  const len = parseInt(lenStr, 10);
  const str = buf.slice(pos[0], pos[0] + len);
  pos[0] += len;
  return str;
}

/**
 * 从 .torrent 文件二进制数据中提取 infoHash（SHA1 of info dict）
 */
async function extractInfoHashFromTorrent(data: ArrayBuffer): Promise<string | null> {
  const buf = new Uint8Array(data);
  const pos: [number] = [0];

  // 外层必须是 dict (d)
  if (buf[pos[0]] !== 0x64) return null; // 'd'
  pos[0]++;

  // 找到 "info" key 对应的值（跳过其他 key-value）
  while (buf[pos[0]] !== 0x65) { // 直到外层 'e'
    // 读 key
    if (buf[pos[0]] >= 0x30 && buf[pos[0]] <= 0x39) { // digit = string key
      const keyBytes = decodeBencodeString(buf, pos);
      const key = new TextDecoder().decode(keyBytes);
      if (key === 'info') {
        // 找到了！info dict 的起始位置
        const infoStart = pos[0];
        // 跳过整个 info dict value（不解析内部，只定位结束位置）
        skipBencodeValue(buf, pos);
        const infoEnd = pos[0];
        // SHA1 of info dict bytes = infoHash
        const infoBytes = buf.slice(infoStart, infoEnd);
        return arrayBufferToHexSHA1(infoBytes.buffer as ArrayBuffer || infoBytes);
      } else {
        // 跳过 value
        skipBencodeValue(buf, pos);
      }
    } else {
      break; // unexpected char
    }
  }

  return null;
}

function skipBencodeValue(buf: Uint8Array, pos: [number]): void {
  const c = buf[pos[0]];
  if (c === 0x69) { // 'i' -> int
    pos[0]++;
    while (buf[pos[0]] !== 0x65) pos[0]++;
    pos[0]++; // skip 'e'
  } else if (c === 0x6c) { // 'l' -> list
    pos[0]++;
    while (buf[pos[0]] !== 0x65) skipBencodeValue(buf, pos);
    pos[0]++; // skip 'e'
  } else if (c === 0x64) { // 'd' -> dict
    pos[0]++;
    while (buf[pos[0]] !== 0x65) {
      if (buf[pos[0]] >= 0x30 && buf[pos[0]] <= 0x39) {
        decodeBencodeString(buf, pos); // key
        skipBencodeValue(buf, pos);     // value
      } else {
        break;
      }
    }
    pos[0]++; // skip 'e'
  } else if (c >= 0x30 && c <= 0x39) { // digit -> string
    decodeBencodeString(buf, pos);
  } else {
    pos[0]++;
  }
}

async function arrayBufferToHexSHA1(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 从 torrent URL 下载并提取 infoHash，生成 magnet */
async function torrentUrlToMagnet(
  torrentUrl: string,
  title: string,
  pageUrl?: string,
  timeoutMs = 10000,
): Promise<string> {
  // 策略1：下载 .torrent → bencode 解析 infoHash
  try {
    const r = await fetch(torrentUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) {
      console.warn('[mikan] torrent download HTTP', r.status, 'for', torrentUrl);
      return '';
    }
    const data = await r.arrayBuffer();
    // 最小校验：.torrent 文件应该以 'd' (dict) 开头
    if (data.byteLength < 20 || new Uint8Array(data)[0] !== 0x64) {
      console.warn('[mikan] invalid torrent file, size=', data.byteLength, 'for', title);
      return '';
    }
    const infoHash = await extractInfoHashFromTorrent(data);
    if (infoHash) {
      return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}${MIKAN_TRACKERS}`;
    }
    console.warn('[mikan] bencode parse succeeded but info hash not found for', title);
  } catch (e) {
    console.warn('[mikan] torrent download/parse failed:', e instanceof Error ? e.message : e, 'for', title);
  }

  // 策略2：fallback — 从番剧页面 HTML 提取 magnet
  if (pageUrl) {
    try {
      const pr = await fetch(pageUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!pr.ok) return '';
      const html = await pr.text();
      // 匹配 magnet:?xt=urn:btih:...
      const magnetMatch = html.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/i);
      if (magnetMatch) {
        return magnetMatch[0] + MIKAN_TRACKERS;
      }
    } catch {
      // 页面提取也失败，静默返回空
    }
  }

  return '';
}

/**
 * Mikan 只为前 N 条下载 .torrent 解析 infoHash。
 * 每条都要一次出站请求（失败还要再抓番剧页），不限流会在高峰期拖垮整源并触发总超时；
 * 其余条目保留番剧页链接，用户仍可跳转。
 */
const MIKAN_TORRENT_LIMIT = 10;
/** Mikan 单次搜索最多返回条数 */
const MIKAN_MAX_ITEMS = 30;
/** 磁力解析整体预算（ms）：超预算的条目退化为番剧页链接，避免整源超时 */
const MIKAN_MAGNET_BUDGET_MS = 7000;

/** 从 enclosure 标签按属性名取值（属性顺序不固定，不能写死 url 在 length 之前） */
function enclosureAttr(tag: string, name: string): string {
  return tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] || '';
}

async function fetchMikan(keyword: string): Promise<MikanItem[]> {
  const url = `https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(keyword)}`;
  const r = await fetchWithRetry(url, {
    headers: {
      'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; FeedFetcher/1.0)',
    },
    signal: AbortSignal.timeout(15000),
  }, { retries: 1, baseDelay: 1000 });

  if (!r.ok) {
    throw new Error(`mikan_http_${r.status}`);
  }

  const xml = await r.text();

  // 检查是否被重定向到 HTML 页面
  if (/<html[\s>]/i.test(xml)) {
    throw new Error('mikan_blocked: response is HTML (bot protection or redirect)');
  }

  if (!xml.includes('<item')) {
    return []; // 正常无结果
  }

  const rawItems: Array<{
    title: string;
    size: string;
    pubDate: string;
    group: string;
    torrentUrl: string;
    pageUrl: string;
  }> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && rawItems.length < MIKAN_MAX_ITEMS) {
    const item = m[1];

    const title = xmlTag(item, 'title');
    if (!title) continue;

    // 实测格式：<enclosure type="application/x-bittorrent" length="3865470464" url="https://...torrent" />
    const enclosureTag = item.match(/<enclosure\b[^>]*>/i)?.[0] || '';
    const torrentUrl = enclosureAttr(enclosureTag, 'url');
    const sizeBytes = parseInt(enclosureAttr(enclosureTag, 'length'), 10) || 0;

    // <link> 番剧页面 URL
    const pageUrl = xmlTag(item, 'link');

    // 从 <description> 提取字幕组名
    const desc = xmlTag(item, 'description');
    const groupMatch = desc.match(/字幕组[：:]\s*(.+?)(?:<br\s*\/?>|\s*$)/i);
    const group = groupMatch?.[1]?.trim() || '';

    rawItems.push({
      title,
      size: sizeBytes ? formatBytes(sizeBytes) : '',
      pubDate: parseRssDate(xmlTag(item, 'pubDate')),
      group,
      torrentUrl,
      pageUrl,
    });
  }

  // 只对前 MIKAN_TORRENT_LIMIT 条解析 torrent，其余直接给页面链接
  const results: MikanItem[] = [];
  const magnetTargets = rawItems.slice(0, MIKAN_TORRENT_LIMIT);
  const BATCH_SIZE = 5;
  // 磁力解析整体预算：超预算的条目退化为页面链接，避免整源拖到搜索总超时
  const deadline = Date.now() + MIKAN_MAGNET_BUDGET_MS;
  let parsedCount = 0;

  for (let i = 0; i < magnetTargets.length; i += BATCH_SIZE) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) break;
    const batch = magnetTargets.slice(i, i + BATCH_SIZE);
    const magnets = await Promise.allSettled(
      batch.map(item => torrentUrlToMagnet(item.torrentUrl, item.title, item.pageUrl, Math.min(remaining, 10000)))
    );

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const settled = magnets[j];
      const magnet = settled.status === 'fulfilled' ? settled.value : '';
      results.push({
        title: item.title,
        magnet,
        size: item.size,
        pubDate: item.pubDate,
        group: item.group,
        detailUrl: item.pageUrl,
      });
    }
    parsedCount += batch.length;
  }

  for (const item of rawItems.slice(parsedCount)) {
    results.push({
      title: item.title,
      magnet: '',
      size: item.size,
      pubDate: item.pubDate,
      group: item.group,
      detailUrl: item.pageUrl,
    });
  }

  return results;
}


// ─── DMHY（动漫花园）RSS 搜索 ─────────────────────────────────────────

/**
 * DMHY（动漫花园）RSS 搜索
 * URL: https://share.dmhy.org/topics/rss/rss.xml?keyword={kw}
 *
 * 注意：单次响应约 2MB（含完整 description HTML），因此：
 *   - 只解析前 DMHY_MAX_ITEMS 条，避免无意义的内存/CPU 开销；
 *   - 由搜索路由的 10 分钟 Cache API 兜住重复关键词请求。
 * enclosure 是 base32 形式的 btih，统一转 40 位 hex，兼容客户端。
 */
const DMHY_RSS_URL = 'https://share.dmhy.org/topics/rss/rss.xml';
const DMHY_MAX_ITEMS = 30;

/** base32（RFC4648 无填充）→ hex，用于把 DMHY 的 btih 转成通用 40 位 hash */
function btihBase32ToHex(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of base32.toUpperCase()) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) return '';
    bits += idx.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    hex += parseInt(bits.slice(i, i + 8), 2).toString(16).padStart(2, '0');
  }
  return hex.length === 40 ? hex : '';
}

/** 解析 DMHY RSS；缺 magnet 的条目直接丢弃，不生成假链接 */
function parseDmhyRss(xml: string): DmhyItem[] {
  if (!xml.includes('<item')) return [];

  const results: DmhyItem[] = [];
  const seen = new Set<string>();
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && results.length < DMHY_MAX_ITEMS) {
    const item = m[1];
    const title = xmlTag(item, 'title');
    if (!title) continue;

    // enclosure 优先；部分条目把 magnet 放在 description 的 <a href> 里
    const enclosure = item.match(/<enclosure[^>]*\burl="([^"]+)"/i)?.[1] || '';
    let magnet = enclosure.startsWith('magnet:?') ? decodeXmlEntities(enclosure) : '';
    if (!magnet) {
      const magnetMatch = item.match(/magnet:\?xt=urn:btih:[^"'\s<]+/i);
      magnet = magnetMatch ? decodeXmlEntities(magnetMatch[0]) : '';
    }
    if (!magnet) continue;

    // DMHY 的 magnet 里 dn 为空，补上标题，BT 客户端才能显示可读文件名
    if (/[?&]dn=(&|$)/.test(magnet)) {
      magnet = magnet.replace(/([?&])dn=(&|$)/, `$1dn=${encodeURIComponent(title)}$2`);
    }

    // base32 btih → hex，避免部分 BT 客户端不识别
    const hashMatch = magnet.match(/urn:btih:([a-z2-7]{32})/i);
    if (hashMatch) {
      const hex = btihBase32ToHex(hashMatch[1]);
      if (hex) magnet = magnet.replace(hashMatch[1], hex);
    }

    if (seen.has(magnet)) continue;
    seen.add(magnet);

    // RSS 里没有文件大小（enclosure length 恒为 1），size 留空由前端隐藏
    // <author> 是发布者账号（如 c8l），字幕组在标题前缀 [组名] 里
    const group = title.match(/^\[([^\]]+)\]/)?.[1]?.trim() || '';
    // <link>/<guid> 给的是 http，统一升 https，避免前端外链走明文
    const link = xmlTag(item, 'link').replace(/^http:\/\//i, 'https://');

    results.push({
      title,
      magnet,
      size: '',
      pubDate: parseRssDate(xmlTag(item, 'pubDate')),
      group,
      detailUrl: link,
    });
  }

  return results;
}

async function fetchDmhy(keyword: string): Promise<DmhyItem[]> {
  const url = `${DMHY_RSS_URL}?keyword=${encodeURIComponent(keyword)}`;
  const r = await fetchWithRetry(url, {
    headers: {
      'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; Atlas/1.0; +https://github.com/Zoroaaa)',
    },
    signal: AbortSignal.timeout(15000),
  }, { retries: 1, baseDelay: 500 });

  if (!r.ok) throw new Error(`dmhy_http_${r.status}`);
  const xml = await r.text();
  // 被 CF/验证码拦截时返回 HTML，必须报错而不是当作“无结果”
  if (/<html[\s>]/i.test(xml)) throw new Error('dmhy_blocked: response is HTML');

  return parseDmhyRss(xml);
}

// ─── Bangumi 元数据 ───────────────────────────────────────────────────

/** Bangumi 每页条数（与分页偏移一起构成真实分页） */
const BGM_PAGE_SIZE = 10;

async function fetchBangumi(keyword: string, page: number): Promise<{ items: BangumiSubject[]; total: number }> {
  const start = Math.max(0, (page - 1) * BGM_PAGE_SIZE);
  const url = `https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}?type=2&responseGroup=large&max_results=${BGM_PAGE_SIZE}&start=${start}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'codeseek/1.0 (https://github.com/Zoroaaa)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`bangumi HTTP ${r.status}`);
  const data = await r.json() as { list?: any[]; results?: number };
  const total = typeof data.results === 'number' ? data.results : (data.list?.length ?? 0);
  if (!data.list?.length) return { items: [], total };

  const items = data.list.map((s: any) => {
    const studio = s.infobox?.find((i: any) => i.key === '动画制作' || i.key === 'Studio')?.value
      || s.staff?.find((st: any) => st.position === '动画制作')?.person?.name
      || '';
    const tagsRaw = s.tags?.sort((a: any, b: any) => (b.count || 0) - (a.count || 0)) || [];
    const tags = tagsRaw.slice(0, 5).map((t: any) => t.name);
    let status = '';
    if (s.eps_count > 0 && s.air_date) {
      const airDate = new Date(s.air_date);
      status = new Date() < airDate ? '未开播' : '已完结';
    }
    if ((s.collection?.doing || 0) > 0 && !status.includes('已完结')) status = '连载中';

    return {
      id:          s.id,
      name:        s.name || '',
      nameCN:      s.name_cn || s.name || '',
      cover:       s.images?.large || s.images?.common || s.images?.medium || '',
      summary:     (s.summary || '').slice(0, 300),
      airDate:     s.air_date || '',
      airWeekday:  s.air_weekday ?? -1,
      rating:      s.rating?.score ?? 0,
      ratingCount: s.rating?.total ?? 0,
      rank:        s.rank ?? 0,
      eps:         s.eps_count ?? s.eps ?? 0,
      url:         `https://bgm.tv/subject/${s.id}`,
      type:        s.type || '',
      studio:      studio || '',
      tags:        tags.length ? tags : undefined,
      collection:  s.collection ? {
        wish:    s.collection.wish    || 0,
        collect: s.collection.collect || 0,
        doing:   s.collection.doing   || 0,
        dropped: s.collection.dropped || 0,
      } : undefined,
      status: status || undefined,
    };
  });

  return { items, total };
}

// ─── 主入口 ────────────────────────────────────────────────────────────

/** 动漫搜索总超时（ms），超时后返回已有结果 + 标记未完成的源 */
const ANIME_SEARCH_TIMEOUT_MS = 20_000;

export async function searchAnime(
  keyword: string,
  page = 1,
  skip: Set<string> = new Set(),
): Promise<AnimeSearchResult> {
  const safePage = Math.max(1, page);
  const sourceKeys = ['bangumi', 'nyaa', 'mikan', 'animetosho', 'dmhy'] as const;
  type SourceKey = typeof sourceKeys[number];

  // 磁力源（Mikan/AnimeTosho/DMHY）只有「最新 N 条」，没有真正的翻页，
  // 深页只重复第 1 页的同一批资源 → 只在第 1 页抓，避免做「点了没变化」的按钮。
  const wantTorrents = safePage === 1;

  // 各源自身已有请求超时；这里只做整体兜底。
  // 关键差异：整体超时不再清空结果，已完成的源照常返回，只把未完成的源标记为超时。
  const sources: Record<SourceKey, Promise<unknown>> = {
    bangumi: skip.has('bangumi') ? Promise.resolve([]) : fetchBangumi(keyword, safePage),
    // 【已禁用】因部署环境(Cloudflare Workers 出站 IP)无法解决 nyaa.si 的 bot 验证，
    // RSS/HTML 均被拦截返回 403 或 JS challenge。先取消爬这个源，后续如有代理方案再恢复。
    // fetchNyaa(keyword),
    nyaa: Promise.resolve([] as NyaaTorrent[]),
    mikan: wantTorrents && !skip.has('mikan') ? fetchMikan(keyword) : Promise.resolve([]),
    animetosho: wantTorrents && !skip.has('animetosho') ? fetchAnimeTosho(keyword) : Promise.resolve([]),
    dmhy: wantTorrents && !skip.has('dmhy') ? fetchDmhy(keyword) : Promise.resolve([]),
  };

  const settled: Partial<Record<SourceKey, PromiseSettledResult<unknown>>> = {};
  const allSettled = Promise.all(
    sourceKeys.map(async (key) => {
      try {
        settled[key] = { status: 'fulfilled', value: await sources[key] };
      } catch (reason) {
        settled[key] = { status: 'rejected', reason };
      }
    })
  );

  await Promise.race([
    allSettled,
    new Promise<void>(resolve => setTimeout(resolve, ANIME_SEARCH_TIMEOUT_MS)),
  ]);

  const timedOut = sourceKeys.filter(key => !settled[key]);
  if (timedOut.length) {
    console.warn('[anime-search] source timeout:', timedOut.join(','));
  }

  const values = <T>(key: SourceKey): T[] => {
    const s = settled[key];
    return s && s.status === 'fulfilled' ? (s.value as T[]) : [];
  };

  const bangumiPayload = (() => {
    const s = settled.bangumi;
    return s && s.status === 'fulfilled'
      ? s.value as { items: BangumiSubject[]; total: number }
      : { items: [], total: 0 };
  })();
  const bgm   = bangumiPayload.items;
  const nyaa  = values<NyaaTorrent>('nyaa');
  const mikan = values<MikanItem>('mikan');
  const atos  = values<NyaaTorrent>('animetosho');
  const dmhy  = values<DmhyItem>('dmhy');

  const errors: AnimeSearchResult['errors'] = {
    bangumi: null, nyaa: null, mikan: null, animetosho: null, dmhy: null,
  };
  const errorKinds: Record<string, SearchErrorKind> = {};

  for (const key of sourceKeys) {
    // nyaa 已禁用（部署环境无法解决 nyaa.si 验证）：不产生任何错误提示
    if (key === 'nyaa') continue;

    const s = settled[key];
    if (!s) {
      // 整体兜底超时：该源尚未返回
      errors[key] = '搜索超时，请稍后重试';
      errorKinds[key] = 'SOURCE_UNAVAILABLE';
      continue;
    }
    if (s.status === 'rejected') {
      const raw = String(s.reason);
      errors[key] = sanitizeError(raw);
      errorKinds[key] = classifySearchError(raw) ?? 'SOURCE_UNAVAILABLE';
      console.error(`[anime-search] ${key} failed:`, raw);
    }
  }

  // 各源独立，不再合并
  const sortedNyaa = [...nyaa].sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
  const sortedAtos = [...atos].sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));

  // ── 构建作品级归组数据 ──
  // 将四源资源统一为 AnimeUnifiedResource，按 Bangumi 作品归组
  const unifiedResources: AnimeUnifiedResource[] = [
    ...sortedNyaa.map(r => ({
      source: 'nyaa' as const, sourceLabel: 'Nyaa', title: r.title, magnet: r.magnet,
      size: r.size, date: r.date, seeders: r.seeders, leechers: r.leechers, trusted: r.trusted,
    })),
    ...mikan.map(r => ({
      source: 'mikan' as const, sourceLabel: 'Mikan', title: r.title, magnet: r.magnet,
      size: r.size, date: r.pubDate, seeders: 0, leechers: 0, group: r.group, detailUrl: r.detailUrl,
    })),
    ...sortedAtos.map(r => ({
      source: 'animetosho' as const, sourceLabel: 'AnimeTosho', title: r.title, magnet: r.magnet,
      size: r.size, date: r.date, seeders: r.seeders, leechers: r.leechers,
    })),
    ...dmhy.map(r => ({
      source: 'dmhy' as const, sourceLabel: 'DMHY', title: r.title, magnet: r.magnet,
      size: r.size, date: r.pubDate, seeders: 0, leechers: 0, group: r.group, detailUrl: r.detailUrl,
    })),
  ];

  const bgmForGrouping = bgm;
  const groupedResult = groupResourcesBySubject(bgmForGrouping, unifiedResources, {
    subjectTitles: (s) => [s.nameCN, s.name],
    resourceTitle: (r) => r.title,
    resourceId: (r) => r.magnet,
  });

  return {
    keyword,
    page: safePage,
    bgm:   bgmForGrouping,
    nyaa:  sortedNyaa,
    mikan: mikan,
    animetosho: sortedAtos,
    dmhy,
    total: sortedNyaa.length + mikan.length + sortedAtos.length + dmhy.length,
    // 只有 Bangumi 有真实分页；磁力源只有第 1 页，深页仍返回作品卡但无新资源
    hasMore: bangumiPayload.total > safePage * BGM_PAGE_SIZE,
    errors,
    errorKinds,
    grouped: {
      groups: groupedResult.groups.map(g => ({
        subject: g.subject,
        resources: g.resources,
      })),
      ungrouped: groupedResult.ungrouped,
    },
  };
}
