/**
 * 影视搜索路由
 * 数据源：
 *   - 元数据：TMDB API（主，需配置 TMDB_API_KEY secret）
 *   - 元数据：豆瓣（fallback，无需配置）
 *   - 磁力资源：LightBT（HTML 爬取，降级失败不影响主结果）
 *   - 磁力资源：音范丝（HTML 爬取，降级失败不影响主结果）
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { authMiddleware } from '@/middleware';

export const movieRoutes = new Hono<{ Bindings: Env }>();
movieRoutes.use('*', authMiddleware);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function httpGet(url: string, headers?: Record<string, string>, timeout = 12000): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...headers,
    },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.text();
}

// =====================================================================
// TMDB API（元数据）
// =====================================================================

export interface TMDBResult {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string;
  year: string;
  rating: number;
  voteCount: number;
  mediaType: 'movie' | 'tv';
  genres?: string[];
  /** 数据来源标识 */
  source: 'tmdb' | 'douban';
}

async function searchTMDB(keyword: string, apiKey: string, page = 1): Promise<TMDBResult[]> {
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(keyword)}&language=zh-CN&page=${page}&include_adult=false`;
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`TMDB error: ${r.status}`);
  const data = await r.json() as { results?: any[] };
  if (!data.results) return [];

  return data.results
    .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
    .slice(0, 20)
    .map((item: any) => {
      const releaseDate: string = item.release_date || item.first_air_date || '';
      return {
        id: item.id,
        title: item.title || item.name || '',
        originalTitle: item.original_title || item.original_name || '',
        overview: (item.overview || '').slice(0, 300),
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
        releaseDate,
        year: releaseDate ? releaseDate.slice(0, 4) : '',
        rating: Math.round((item.vote_average || 0) * 10) / 10,
        voteCount: item.vote_count || 0,
        mediaType: item.media_type as 'movie' | 'tv',
        source: 'tmdb' as const,
      };
    });
}

// =====================================================================
// 豆瓣搜索（多策略 fallback）
// =====================================================================

interface DoubanRawItem {
  id: string;
  title: string;
  rate: string;
  cover?: string;
  cover_x?: number;
  cover_y?: number;
  url: string;
  is_tv: boolean;
}

/** 策略1：豆瓣旧版 AJAX 接口 */
async function searchDoubanAjax(keyword: string): Promise<TMDBResult[]> {
  const url = `https://movie.douban.com/j/search_subjects?type=movie&tag=&sort=recommend&page_limit=20&page_start=0&search_text=${encodeURIComponent(keyword)}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/javascript, */*',
      'Referer': 'https://movie.douban.com/explore',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': 'bid=""; __yadk_uid=dummy',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Douban AJAX error: ${r.status}`);
  const data = await r.json() as { subjects?: DoubanRawItem[] };
  if (!data.subjects?.length) return [];

  return mapDoubanItems(data.subjects);
}

/** 策略2：豆瓣新版搜索接口 */
async function searchDoubanNew(keyword: string): Promise<TMDBResult[]> {
  // 豆瓣电影搜索页（HTML），从中提取 JSON 数据
  const url = `https://www.douban.com/search?q=${encodeURIComponent(keyword)}&cat=1002`;
  const html = await httpGet(url, {
    'Referer': 'https://www.douban.com/',
  }, 8000);

  // 豆瓣搜索页通常在 <script> 中嵌入数据，或直接有结构化内容
  // 尝试提取 subject-item 的信息
  const results: TMDBResult[] = [];
  // 匹配搜索结果中的条目：标题 + 链接 + 评分
  const itemRe = /<div\s+class="[^"]*subject-cast[^"]*"[^>]*>[\s\S]*?<a[^>]+href="(https?:\/\/(?:movie|www)\.douban\.com\/subject\/(\d+)\/)"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(html)) !== null && results.length < 15) {
    const id = m[2];
    const title = decodeHtmlEntities(m[3].trim());

    // 在同块中找评分
    const blockEnd = html.indexOf('</div>', m.index);
    const block = html.slice(m.index, Math.min(m.index + 500, blockEnd > m.index ? blockEnd : m.index + 500));
    const rateM = block.match(/<span[^>]*class="[^"]*rating_nums[^"]*"[^>]*>([\d.]+)<\/span>/);

    results.push({
      id: parseInt(id),
      title,
      originalTitle: title,
      overview: '',
      poster: null,
      backdrop: null,
      releaseDate: '',
      year: '',
      rating: parseFloat(rateM?.[1] || '0') || 0,
      voteCount: 0,
      mediaType: 'movie' as const,
      source: 'douban' as const,
    });
  }

  return results;
}

function mapDoubanItems(items: DoubanRawItem[]): TMDBResult[] {
  return items.slice(0, 15).map((item) => ({
    id: -Math.abs(parseInt(item.id) || 0),
    title: item.title || '',
    originalTitle: item.title || '',
    overview: '',
    poster: item.cover?.startsWith('http') ? item.cover : (item.cover ? `https:${item.cover}` : null),
    backdrop: null,
    releaseDate: '',
    year: '',
    rating: parseFloat(item.rate) || 0,
    voteCount: 0,
    mediaType: (item.is_tv ? 'tv' : 'movie') as 'movie' | 'tv',
    source: 'douban' as const,
  }));
}

/** 统一入口：依次尝试各策略 */
async function searchDouban(keyword: string): Promise<TMDBResult[]> {
  try {
    const results = await searchDoubanAjax(keyword);
    if (results.length > 0) return results;
  } catch { /* 继续尝试下一个策略 */ }

  try {
    const results = await searchDoubanNew(keyword);
    if (results.length > 0) return results;
  } catch { /* ignore */ }

  return [];
}

// =====================================================================
// 磁力资源站爬虫
// =====================================================================

export interface ResourceItem {
  title: string;
  magnet: string;
  size: string;
  date: string;
  source: string;
  sourceLabel: string;
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

/**
 * 从 HTML 中提取所有 magnet 链接及关联标题
 */
function extractMagnets(html: string, source: string, sourceLabel: string): ResourceItem[] {
  const items: ResourceItem[] = [];
  const seenMagnets = new Set<string>();

  // 扫描全 HTML，找所有 magnet 链接
  const magnetRe = /href="(magnet:\?xt=urn:btih:[^"]{10,})"/gi;
  let m: RegExpExecArray | null;

  while ((m = magnetRe.exec(html)) !== null && items.length < 30) {
    const magnet = m[1];
    if (seenMagnets.has(magnet)) continue;
    seenMagnets.add(magnet);

    const pos = m.index;
    // 向前找标题 — 扩大范围到 1500 字符
    const before = html.slice(Math.max(0, pos - 1500), pos);

    let title = '';

    // 按优先级尝试多种标题提取模式
    const patterns = [
      // 标题链接（最常见）
      /<a[^>]+href="[^"]*"[^>]*class="[^"]*(?:title|post-title|entry-title|subject|name)[^"]*"[^>]*>\s*([^<]{3,100})\s*<\/a>/i,
      // h1-h4 标签
      /<(?:h[1-4])[^>]*>([^<]{3,100})<\/\1>/i,
      // 带 title 属性的元素
      /title="([^"]{3,100})"/i,
      // 强调文本
      /<(?:strong|b)[^>]*>([^<]{3,100})<\/(?:strong|b)>/i,
      // 任意带 class 含 title/name 的链接
      /<a[^>]+class="[^"]*"[^>]*>([^<]{5,80})<\/a>/i,
    ];

    for (const pat of patterns) {
      const hits: string[] = [];
      pat.lastIndex = 0;
      let t: RegExpExecArray | null;
      while ((t = pat.exec(before)) !== null) hits.push(t[1].trim());
      if (hits.length) {
        title = hits[hits.length - 1]; // 取最近的匹配
        break;
      }
    }

    if (!title) continue;
    title = decodeHtmlEntities(title).trim();

    // 过滤明显不是标题的文本
    if (/^(复制|下载|magnet|分享|收藏|举报|点击|查看|详情)$/.test(title)) continue;

    items.push({ title, magnet, size: '', date: '', source, sourceLabel });
  }

  return items;
}

/** LightBT 爬虫 */
async function scrapeLightBT(keyword: string): Promise<ResourceItem[]> {
  try {
    const html = await httpGet(
      `https://www.lightbt.top/search?q=${encodeURIComponent(keyword)}`,
      undefined,
      12000
    );
    return extractMagnets(html, 'lightbt', 'LightBT');
  } catch {
    return [];
  }
}

/** 音范丝爬虫 */
async function scrapeYinfans(keyword: string): Promise<ResourceItem[]> {
  try {
    const html = await httpGet(
      `https://www.yinfans.me/?s=${encodeURIComponent(keyword)}`,
      { Referer: 'https://www.yinfans.me/' },
      12000
    );

    // 先从列表页提取文章链接
    const postLinks: string[] = [];
    const linkRe = /<a\s+href="(https:\/\/www\.yinfans\.me\/\d+\.html)"[^>]*>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(html)) !== null) postLinks.push(lm[1]);

    // 如果搜索页本身就有 magnet，直接返回
    const directResults = extractMagnets(html, 'yinfans', '音范丝');
    if (directResults.length > 0) return directResults;

    // 否则抓详情页
    if (postLinks.length === 0) return [];

    const details = await Promise.allSettled(
      postLinks.slice(0, 3).map(url => httpGet(url, { Referer: 'https://www.yinfans.me/' }, 10000))
    );

    const results: ResourceItem[] = [];
    for (const d of details) {
      if (d.status === 'fulfilled') {
        results.push(...extractMagnets(d.value, 'yinfans', '音范丝'));
      }
    }
    return results;
  } catch {
    return [];
  }
}

// =====================================================================
// 路由
// =====================================================================

/**
 * GET /api/movie/search?q=关键词&page=1
 */
movieRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'));

  if (!q) {
    return c.json({ success: false, error: { code: 'MISSING_QUERY', message: '请输入搜索关键词' } }, 400);
  }

  // Cache
  const CACHE_TTL = 180;
  const cacheKey = new Request(`https://internal/movie-search/${encodeURIComponent(q)}-p${page}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
    });
  }

  const tmdbKey = c.env.TMDB_API_KEY;

  // 并行请求所有源
  const [metaRes, lightbtRes, yinfansRes] = await Promise.allSettled([
    // 元数据源
    (async (): Promise<TMDBResult[]> => {
      const all: TMDBResult[][] = [];

      // TMDB（如有 key）
      if (tmdbKey) {
        try { all.push(await searchTMDB(q, tmdbKey, page)); } catch { /* TMDB 失败，继续 */ }
      }

      // 豆瓣（始终尝试）
      try { all.push(await searchDouban(q)); } catch { /* 豆瓣失败，继续 */ }

      return all.flat();
    })(),

    // 磁力源
    scrapeLightBT(q),
    scrapeYinfans(q),
  ]);

  let results: TMDBResult[] = metaRes.status === 'fulfilled' ? metaRes.value : [];
  let tmdbError: string | null = null;
  const doubanError: string | null = null;

  if (metaRes.status === 'rejected') {
    tmdbError = String(metaRes.reason);
  }

  // 去重：按 title 去重，优先保留 TMDB 结果
  const seen = new Set<string>();
  results = results.filter(item => {
    const key = item.title.toLowerCase().slice(0, 30); // 用前30字符做近似去重
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const resources: ResourceItem[] = [
    ...(lightbtRes.status === 'fulfilled' ? lightbtRes.value : []),
    ...(yinfansRes.status === 'fulfilled' ? yinfansRes.value : []),
  ];

  const body = JSON.stringify({
    success: true,
    data: {
      keyword: q,
      page,
      results,
      resources,
      total: results.length,
      resourceTotal: resources.length,
      tmdbError,
      doubanError,
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
