/**
 * 动漫搜索服务
 * 元数据: Bangumi API
 * 磁力资源: Nyaa.si RSS（?page=rss）
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
}

export interface AnimeSearchResult {
  keyword: string;
  page: number;
  bgm: BangumiSubject[];
  nyaa: NyaaTorrent[];
  mikan: MikanItem[];
  animetosho: NyaaTorrent[];
  total: number;
  errors: { bangumi: string | null; nyaa: string | null; mikan: string | null; animetosho: string | null };
}

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

/** RFC-2822 pubDate → YYYY-MM-DD */
function parseRssDate(pubDate: string): string {
  if (!pubDate) return '';
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

/** Nyaa RSS 主搜索，错误向上抛出（由 searchAnime 捕获并写入 errors.nyaa） */
async function fetchNyaa(keyword: string): Promise<NyaaTorrent[]> {
  const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(keyword)}&c=1_0&f=0`;
  const r = await fetch(url, {
    headers: {
      // 显式声明 XML Accept，防止服务端返回 HTML 重定向
      'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; FeedFetcher/1.0)',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!r.ok) {
    throw new Error(`nyaa_rss_http_${r.status}`);
  }

  const xml = await r.text();
  return parseNyaaRss(xml);
}

// ─── AnimeTosho JSON API ──────────────────────────────────────────────

/** 从 magnet URI 提取 infoHash（40位 hex） */
function extractHash(magnet: string): string {
  const m = magnet.match(/urn:btih:([a-fA-F0-9]{40})/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * AnimeTosho JSON API 搜索
 * URL: https://feed.animetosho.org/json?q={keyword}
 * 无需 key，无 bot 检测，返回最多 ~30 条
 * 返回格式复用 NyaaTorrent（结构一致）
 */
async function fetchAnimeTosho(keyword: string): Promise<NyaaTorrent[]> {
  const url = `https://feed.animetosho.org/json?q=${encodeURIComponent(keyword)}`;
  const r = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; CodeSeek/1.0)',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!r.ok) {
    throw new Error(`animetosho_http_${r.status}`);
  }

  const data = await r.json() as Array<{
    id: number;
    title: string;
    magnet_uri: string;
    torrent_url?: string;
    seeders?: number;
    leechers?: number;
    torrent_downloaded_count?: number;
    file_size?: number;
    timestamp?: number;
    nyaa_id?: number;
    website_url?: string;
  }>;

  if (!Array.isArray(data) || data.length === 0) return [];

  return data.map(item => ({
    id: String(item.nyaa_id ?? item.id ?? ''),
    title: item.title || '',
    magnet: item.magnet_uri || '',
    torrentUrl: item.torrent_url || '',
    size: item.file_size != null ? formatBytesAT(item.file_size) : '',
    date: item.timestamp ? new Date(item.timestamp * 1000).toISOString().slice(0, 10) : '',
    seeders: item.seeders || 0,
    leechers: item.leechers || 0,
    completed: item.torrent_downloaded_count || 0,
    trusted: false,
    category: 'Anime',
    source: 'animetosho' as const,
    sourceLabel: 'AnimeTosho',
    hasSeedData: !!item.seeders,
    detailUrl: item.nyaa_id
      ? `https://nyaa.si/view/${item.nyaa_id}`
      : (item.website_url || ''),
  }));
}

/** bytes → 可读字符串（AnimeTosho 用，避免与 movie-search 的 formatBytes 冲突命名） */
function formatBytesAT(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GiB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${bytes} B`;
}

// ─── Bangumi 元数据 ───────────────────────────────────────────────────

async function fetchBangumi(keyword: string): Promise<BangumiSubject[]> {
  const url = `https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}?type=2&responseGroup=large&max_results=6`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'codeseek/1.0 (https://github.com/Zoroaaa)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`bangumi HTTP ${r.status}`);
  const data = await r.json() as { list?: any[] };
  if (!data.list?.length) return [];

  return data.list.map((s: any) => {
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
}

// ─── 主入口 ────────────────────────────────────────────────────────────

export async function searchAnime(keyword: string, page = 1): Promise<AnimeSearchResult> {
  const [bgmResult, nyaaResult, atosResult] = await Promise.allSettled([
    fetchBangumi(keyword),
    fetchNyaa(keyword),
    fetchAnimeTosho(keyword),
  ]);

  const bgm  = bgmResult.status  === 'fulfilled' ? bgmResult.value  : [];
  const nyaa = nyaaResult.status === 'fulfilled' ? nyaaResult.value : [];
  const atos = atosResult.status === 'fulfilled' ? atosResult.value : [];

  // 错误信息现在能正确传递给前端（原来 fetchNyaa 内部 catch 导致永远是 null）
  const nyaaError = nyaaResult.status === 'rejected'
    ? String(nyaaResult.reason)
    : null;

  if (nyaaError) {
    console.error('[anime-search] nyaa failed:', nyaaError);
  }

  // 合并 Nyaa + AnimeTosho，按 infoHash 去重
  const allNyaa = [...nyaa, ...atos];
  const seenHashes = new Set<string>();
  const dedupedNyaa = allNyaa.filter(r => {
    const hash = extractHash(r.magnet);
    if (!hash || seenHashes.has(hash)) return false;
    seenHashes.add(hash);
    return true;
  });
  // 按 seeders 降序
  dedupedNyaa.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));

  return {
    keyword,
    page,
    bgm:   bgm.slice(0, 6),
    nyaa:  dedupedNyaa,
    mikan: [],
    animetosho: atos,
    total: dedupedNyaa.length,
    errors: {
      bangumi: bgmResult.status === 'rejected' ? String(bgmResult.reason) : null,
      nyaa:    nyaaError,
      mikan:   null,
      animetosho: atosResult.status === 'rejected' ? String(atosResult.reason) : null,
    },
  };
}
