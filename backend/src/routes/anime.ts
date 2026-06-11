/**
 * 动漫搜索路由
 * 数据源：
 *   - 元数据：Bangumi API（bgm.tv）
 *   - 磁力资源：nyaa.si（RSS 优先，HTML 降级）
 *   - 磁力资源：Mikan Project RSS
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { authMiddleware } from '@/middleware';

export const animeRoutes = new Hono<{ Bindings: Env }>();
animeRoutes.use('*', authMiddleware);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function httpGet(url: string, timeout = 15000): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.text();
}

// =====================================================================
// nyaa.si 解析（RSS 优先，更稳定）
// =====================================================================

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
}

/** 从 Nyaa RSS/XML 提取结果 */
function parseNyaaRss(xml: string): NyaaTorrent[] {
  const results: NyaaTorrent[] = [];
  // Nyaa RSS 格式：<item><title>...</title><link>...</link><nyaa:infoHash>...</nyaa:infoHash>...
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];

    const titleM = block.match(/<title><!\[CDATA\[([^\]]*)\]\]><\/title>/i) ||
                   block.match(/<title>([^<]+)<\/title>/i);
    if (!titleM) continue;
    const title = decodeHtmlEntities(titleM[1].trim());

    // link → view page url，提取 id
    const linkM = block.match(/<link>([^<]+)<\/link>/i);
    const viewId = linkM ? (linkM[1].match(/view\/(\d+)/)?.[1] || '') : '';

    // magnet 在 <enclosure> 或 <link type="magnet"> 中
    const magnetM = block.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/i) ||
                    block.match(/<enclosure[^>]+url="(magnet:\?xt=urn:btih:[^"]+)"[^>]*\/?>/i);
    const magnet = magnetM ? magnetM[1] : '';
    if (!magnet) continue;

    // size
    const sizeM = block.match(/<nyaa:size>([^<]+)<\/nyaa:size>/i) ||
                  block.match(/<length>([^<]+)<\/length>/i);
    const size = sizeM ? sizeM[1].trim() : '';

    // seeders, leechers, completed, trusted, category
    const seedersM = block.match(/<nyaa:seeders>([^<]+)<\/nyaa:seeders>/i);
    const leechersM = block.match(/<nyaa:leechers>([^<]+)<\/nyaa:leechers>/i);
    const completedM = block.match(/<nyaa:completed>([^<]+)<\/nyaa:completed>/i);
    const catIdM = block.match(/<nyaa:categoryId>([^<]+)<\/nyaa:categoryId>/i);
    const trustM = block.match(/<nyaa:trusted>([^<]+)<\/nyaa:trusted>/i);

    const seeders = parseInt(seedersM?.[1] || '0') || 0;
    const leechers = parseInt(leechersM?.[1] || '0') || 0;
    const completed = parseInt(completedM?.[1] || '0') || 0;
    const categoryId = catIdM?.[1] || '';
    const trusted = trustM?.[1]?.toLowerCase() === 'true' ||
                     trustM?.[1] === '1' ||
                     block.includes('<nyaa:trusted>true</nyaa:trusted>');

    // category name mapping
    const categoryMap: Record<string, string> = {
      '1_0': 'Anime - Sub', '1_1': 'Anime - Raw', '1_2': 'Anime - Non-English',
      '1_3': 'Anime - English Translated', '2_0': 'Audio - Lossless', '2_1': 'Audio - Lossy',
      '3_0': 'Literature - English Translated', '3_1': 'Literature - Non-English',
      '3_2': 'Literature - Raw', '4_0': 'Live Action - English Translated',
      '4_1': 'Live Action - Non-English', '4_2': 'Live Action - Raw', '4_3': 'Live Action - Idol/Promotional Video',
      '4_4': 'Live Action - Other', '5_0': 'Pictures - Graphics', '5_1': 'Pictures - Photos',
      '6_0': 'Software - Applications', '6_1': 'Software - Games',
    };

    // date
    const pubDateM = block.match(/<pubDate>([^<]+)<\/pubDate>/i);
    const date = pubDateM ? new Date(pubDateM[1]).toISOString().split('T')[0] : '';

    results.push({
      id: viewId,
      title,
      magnet,
      torrentUrl: viewId ? `https://nyaa.si/download/${viewId}.torrent` : '',
      size,
      date,
      seeders,
      leechers,
      completed,
      trusted,
      category: categoryMap[categoryId] || `Cat-${categoryId}`,
    });
  }
  return results;
}

/** 从 Nyaa HTML 页面提取结果（降级方案） */
function parseNyaaHtml(html: string): NyaaTorrent[] {
  const results: NyaaTorrent[] = [];

  // 尝试匹配 tbody
  const tbodyM = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyM) return results;

  const tbodyContent = tbodyM[1];

  // 匹配每一行 tr
  const rowRe = /<tr\s+(?:class="([^"]*)")?\s*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;

  while ((row = rowRe.exec(tbodyContent)) !== null) {
    const rowClass = row[1] || '';
    const rowHtml = row[2];

    // 提取所有 td
    const tds: string[] = [];
    const tdRe = /<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(rowHtml)) !== null) tds.push(td[1]);
    if (tds.length < 7) continue;

    // td[1]: 标题列 — 找 /view/ 链接
    const titleM = tds[1].match(/<a\s+href="\/view\/(\d+)"(?:\s[^>]*)?>([^<]*(?:<(?!\/a)[^<]*)*?)<\/a>/i);
    if (!titleM) continue;
    const id = titleM[1];
    const title = titleM[2].replace(/<[^>]+>/g, '').trim();

    // td[0]: 分类图标
    const catM = tds[0].match(/title="([^"]+)"/i) || tds[0].match(/alt="([^"]+)"/i);
    const category = catM ? catM[1] : 'Anime';

    // td[2]: 链接列 — magnet
    const magnetM = tds[2].match(/href="(magnet:\?xt=[^"]+)"/i);
    if (!magnetM) continue;
    const magnet = magnetM[1];

    // td[3]: 大小
    const size = tds[3].replace(/<[^>]+>/g, '').trim();

    // td[4]: 日期
    const tsM = tds[4].match(/data-timestamp="(\d+)"/i);
    const date = tsM
      ? new Date(parseInt(tsM[1]) * 1000).toISOString().split('T')[0]
      : tds[4].replace(/<[^>]+>/g, '').trim();

    // td[5]-td[7]: 统计数字
    const seeders = parseInt(tds[5].replace(/<[^>]+>/g, '').trim()) || 0;
    const leechers = parseInt(tds[6].replace(/<[^>]+>/g, '').trim()) || 0;
    const completed = parseInt((tds[7] || '').replace(/<[^>]+>/g, '').trim()) || 0;

    results.push({
      id,
      title: decodeHtmlEntities(title),
      magnet,
      torrentUrl: `https://nyaa.si/download/${id}.torrent`,
      size,
      date,
      seeders,
      leechers,
      completed,
      category,
      trusted: rowClass.includes('success'),
    });
  }

  return results;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

// =====================================================================
// Mikan Project RSS 解析
// =====================================================================

export interface MikanItem {
  title: string;
  magnet: string;
  size: string;
  pubDate: string;
  group: string;
}

function parseMikanRss(xml: string): MikanItem[] {
  const items: MikanItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];

    // 标题 — CDATA 或纯文本
    const titleM = block.match(/<title><!\[CDATA\[([^\]]*(?:\][^\]]*]*)*)\]\]><\/title>/is) ||
                   block.match(/<title>([^<]+)<\/title>/i);
    const title = titleM ? decodeHtmlEntities(titleM[1].trim()) : '';

    // magnet — 可能在 href 属性或 enclosure 标签中
    const magnetM = block.match(/href="(magnet:\?xt=urn:btih:[^"]{20,})"/i) ||
                    block.match(/<enclosure\s+url="(magnet:\?xt=urn:btih:[^"]{20,})"/i);
    const magnet = magnetM ? magnetM[1] : '';
    if (!magnet.startsWith('magnet:')) continue;

    // 大小 — 多种可能的格式
    const sizeM = block.match(/<size>([^<]+)<\/size>/i) ||
                  block.match(/contentLength["\s>:]+(\d+)/i) ||
                  block.match(/torrent:length["\s>=]+(\d+)/i);
    const sizeBytes = sizeM ? parseInt(sizeM[1]) : 0;
    const size = sizeBytes > 1073741824
      ? `${(sizeBytes / 1073741824).toFixed(1)} GiB`
      : sizeBytes > 1048576
        ? `${(sizeBytes / 1048576).toFixed(0)} MiB`
        : sizeBytes > 1024
          ? `${(sizeBytes / 1024).toFixed(0)} KiB`
          : `${sizeBytes} B`;

    // 发布时间
    const dateM = block.match(/<pubDate>([^<]+)<\/pubDate>/i);
    const pubDate = dateM ? dateM[1].trim() : '';

    // 字幕组
    const groupM = block.match(/<author>[^<]*<name>([^<]+)<\/name>/i) ||
                   block.match(/torrent:author[^>]*>\s*([^<\s]+)/i) ||
                   title.match(/^\[([^\]]+)\]/);
    const group = groupM ? groupM[1].trim() : '';

    items.push({ title, magnet, size, pubDate, group });
  }

  return items;
}

// =====================================================================
// Bangumi API（元数据）
// =====================================================================

export interface BangumiSubject {
  id: number;
  name: string;
  nameCN: string;
  cover: string;
  summary: string;
  airDate: string;
  rating: number;
  eps: number;
  url: string;
}

async function searchBangumi(keyword: string): Promise<BangumiSubject[]> {
  const url = `https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}?type=2&responseGroup=small&max_results=6`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'codeseek/1.0 (https://codeseek.pp.ua)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return [];
  const data = await r.json() as { list?: any[] };
  if (!data.list?.length) return [];

  return data.list.map((s: any) => ({
    id: s.id,
    name: s.name || '',
    nameCN: s.name_cn || s.name || '',
    cover: s.images?.large || s.images?.common || '',
    summary: (s.summary || '').slice(0, 200),
    airDate: s.air_date || '',
    rating: s.rating?.score ?? 0,
    eps: s.eps_count ?? s.eps ?? 0,
    url: `https://bgm.tv/subject/${s.id}`,
  }));
}

// =====================================================================
// 路由
// =====================================================================

/**
 * GET /api/anime/search?q=关键词&page=1&source=all|nyaa|mikan
 */
animeRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'));
  const source = c.req.query('source') ?? 'all'; // all | nyaa | mikan

  if (!q) {
    return c.json({ success: false, error: { code: 'MISSING_QUERY', message: '请输入搜索关键词' } }, 400);
  }

  // Cache
  const CACHE_TTL = 180; // 3 分钟缓存
  const cacheKey = new Request(`https://internal/anime-search/${encodeURIComponent(q)}-p${page}-${source}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
    });
  }

  // 并行抓取所有源
  const [bgmList, nyaaResult, mikanResult] = await Promise.allSettled([
    searchBangumi(q).catch(() => [] as BangumiSubject[]),

    // Nyaa: 先试 RSS，失败降级到 HTML
    (async (): Promise<NyaaTorrent[]> => {
      if (source === 'mikan') return [];
      try {
        const rssXml = await httpGet(
          `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(q)}&s=seeders&o=desc&p=${page}&rss=1`,
          12000
        );
        const rssResults = parseNyaaRss(rssXml);
        if (rssResults.length > 0) return rssResults;
        // RSS 无结果时尝试 HTML（某些情况下 RSS 不返回但 HTML 有）
        const html = await httpGet(
          `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(q)}&s=seeders&o=desc&p=${page}`,
          12000
        );
        return parseNyaaHtml(html);
      } catch {
        return [];
      }
    })(),

    (async (): Promise<MikanItem[]> => {
      if (source === 'nyaa') return [];
      try {
        const xml = await httpGet(
          `https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(q)}`,
          10000
        );
        return parseMikanRss(xml);
      } catch {
        return [];
      }
    })(),
  ]);

  const bgmListData = bgmList.status === 'fulfilled' ? bgmList.value : [];
  const nyaaData = nyaaResult.status === 'fulfilled' ? nyaaResult.value : [];
  const mikanData = mikanResult.status === 'fulfilled' ? mikanResult.value : [];

  const body = JSON.stringify({
    success: true,
    data: {
      keyword: q,
      page,
      bgm: bgmListData.slice(0, 6),
      nyaa: nyaaData,
      mikan: mikanData,
      total: nyaaData.length + mikanData.length,
      errors: {
        bangumi: bgmList.status === 'rejected' ? String(bgmList.reason) : null,
        nyaa: nyaaResult.status === 'rejected' ? String(nyaaResult.reason) : null,
        mikan: mikanResult.status === 'rejected' ? String(mikanResult.reason) : null,
      },
    },
  });

  const resp = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
      'X-Cache': 'MISS',
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
});
