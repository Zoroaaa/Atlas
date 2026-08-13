/**
 * JAV 榜单路由 — 仅 JavBus
 * 4 个维度：有码精选 / 无码精选 / 随机类别(10) / 随机女优(10)
 *
 * 共享工具（normalizeCode/parseMagnets/parseJavDetail 等）提取至 services/jav-utils.ts
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { authMiddleware } from '@/middleware';
import {
  normalizeCode,
  getHtml,
  extractGidUc,
  parseMagnets,
  parseJavDetail,
  JAV_HEADERS,
} from '@/services/jav-utils';

export const javRoutes = new Hono<{ Bindings: Env }>();

// 图片代理（无需认证）
// GET /api/jav/proxy-image?url=<encoded_url>
const ALLOWED_IMAGE_HOSTS = [
  'www.javbus.com',
  'javbus.com',
  'pics.javbus.com',
  'img.javbus.com',
  'lain.bgm.tv',
  'image.tmdb.org',
  'uploads.mangadex.org',
  // 小说封面：Anna's Archive 多域名故障转移
  'zh.annas-archive.gl',
  'zh.annas-archive.pk',
  'zh.annas-archive.gd',
  'annas-archive.gl',
  'annas-archive.pk',
  'annas-archive.gd',
  // 小说封面：Anna's Archive 封面 CDN（z-lib 域名变体）
  'covers.z-lib.sk',
  'covers.z-lib.to',
  'covers.z-lib.se',
  'covers.z-lib.org',
  'covers1.z-lib.sk',
  // 小说封面：奇书网（详情页封面，需 Referer 防盗链）
  'www.xqishuta.org',
  // JAV 女优资料：minnano-av.com 封面图（需 Referer 防盗链）
  'www.minnano-av.com',
];

function isPrivateIP(hostname: string): boolean {
  const privatePatterns = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /^localhost$/i,
  ];
  return privatePatterns.some(pattern => pattern.test(hostname));
}

javRoutes.get('/proxy-image', async (c) => {
  const rawUrl = c.req.query('url');
  if (!rawUrl) {
    return c.json({ success: false, error: { code: 'MISSING_URL', message: '缺少url参数' } }, 400);
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(rawUrl);
  } catch {
    return c.json({ success: false, error: { code: 'INVALID_URL', message: '无效的URL编码' } }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return c.json({ success: false, error: { code: 'INVALID_URL', message: '无效的URL格式' } }, 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ success: false, error: { code: 'INVALID_PROTOCOL', message: '只支持http/https协议' } }, 400);
  }

  if (isPrivateIP(parsed.hostname)) {
    console.warn('SSRF attempt blocked:', parsed.hostname);
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: '不允许访问内网地址' } }, 403);
  }

  if (!ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN_HOST', message: `不允许的域名: ${parsed.hostname}` } }, 403);
  }

  // 根据目标域名动态设置 Referer
  const refererMap: Record<string, string> = {
    'lain.bgm.tv': 'https://bgm.tv/',
    'www.javbus.com': 'https://www.javbus.com/',
    'javbus.com': 'https://www.javbus.com/',
    'pics.javbus.com': 'https://www.javbus.com/',
    'img.javbus.com': 'https://www.javbus.com/',
    'www.xqishuta.org': 'http://www.xqishuta.org/',
    'www.minnano-av.com': 'https://www.minnano-av.com/',
  };
  const imageFetchHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': refererMap[parsed.hostname] || `https://${parsed.hostname}/`,
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  // 1x1 透明 GIF（错误时返回，避免 <img> 标签触发 ORB）
  const fallbackGif = new Uint8Array([71,73,70,56,57,97,1,0,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(targetUrl, {
        headers: imageFetchHeaders,
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });

      if (resp.status === 403 && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      if (!resp.ok) {
        console.error('Image fetch failed:', targetUrl, resp.status);
        return new Response(fallbackGif, {
          status: 200,
          headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      }

      const contentType = resp.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
      const data = await resp.arrayBuffer();

      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    } catch (err) {
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      console.error('Proxy image error:', targetUrl, err);
      return new Response(fallbackGif, {
        status: 200,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }
  }

  return new Response(fallbackGif, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
});

javRoutes.use('*', authMiddleware);

// ─────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────

interface JavItem {
  code: string;
  title: string;
  cover?: string;
  date?: string;
  actress?: string;
  source: string;
}

interface GroupRanking {
  name: string;   // 类别名 或 女优名
  key: string;    // slug（genre/xx 或 star/xx 的末段）
  items: JavItem[];
}

interface RankingsResponse {
  censored: JavItem[];          // 有码精选（前3页随机20）
  uncensored: JavItem[];        // 无码精选（前3页随机20）
  hd: JavItem[];                // 高清（/genre/hd 前3页随机20）
  subtitle: JavItem[];          // 字幕（/genre/sub 前3页随机20）
  genres: GroupRanking[];       // 随机10类别
  actresses: GroupRanking[];    // 随机10女优
  suggestions: string[];
  fetchedAt: number;
  sources: string[];
}

// ─────────────────────────────────────────────
// 请求工具（已提取至 services/jav-utils.ts）
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

// normalizeCode 已提取至 services/jav-utils.ts，此处从该模块导入

function isValidCode(code: string): boolean {
  return /^[A-Z]{2,8}-\d{2,6}$/.test(code);
}

function dedup(items: JavItem[]): JavItem[] {
  const seen = new Set<string>();
  return items.filter(i => { if (seen.has(i.code)) return false; seen.add(i.code); return true; });
}

/** Fisher-Yates 随机洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从数组随机取 n 个 */
function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

// ─────────────────────────────────────────────
// JavBus 网格解析（通用）
// ─────────────────────────────────────────────

function parseGrid(html: string, source: string): JavItem[] {
  if (!html) return [];
  const items: JavItem[] = [];
  // 截取 waterfall 区域
  const wi = html.indexOf('id="waterfall"');
  const section = wi !== -1 ? html.slice(wi, wi + 60000) : html;

  const re = /<a[^>]+class="movie-box"[^>]*href="[^"]+"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null && items.length < 30) {
    const block = m[1];
    const imgM = block.match(/<img[^>]+src="([^"]+)"/i);
    const cover = imgM ? imgM[1] : undefined;

    const codeM =
      block.match(/<span[^>]*class="[^"]*id[^"]*"[^>]*>([^<]+)<\/span>/i) ||
      block.match(/<date[^>]*>([A-Za-z0-9]+-\d+)<\/date>/i) ||
      block.match(/>([A-Z]{2,8}-\d{2,6})</);
    if (!codeM) continue;
    const code = normalizeCode(codeM[1].trim());
    if (!isValidCode(code)) continue;

    const titleM = block.match(/title="([^"]+)"/i);
    const title = titleM ? titleM[1].trim() : code;

    const dateM = block.match(/<date[^>]*>(\d{4}-\d{2}-\d{2})<\/date>/i);
    const date = dateM ? dateM[1] : undefined;

    items.push({ code, title, cover, date, source });
  }
  return items;
}

// ─────────────────────────────────────────────
// 有码精选：前3页合并 → dedup → shuffle → 取20
// ─────────────────────────────────────────────

async function fetchCensored(): Promise<JavItem[]> {
  const pages = ['https://www.javbus.com/', 'https://www.javbus.com/page/2', 'https://www.javbus.com/page/3'];
  const results = await Promise.allSettled(pages.map(u => getHtml(u)));
  const all = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? parseGrid(r.value, `javbus-p${i + 1}`) : []
  );
  return sample(dedup(all), 20);
}

// ─────────────────────────────────────────────
// 无码精选：前3页合并 → dedup → shuffle → 取20
// ─────────────────────────────────────────────

async function fetchUncensored(): Promise<JavItem[]> {
  const pages = [
    'https://www.javbus.com/uncensored/',
    'https://www.javbus.com/uncensored/page/2',
    'https://www.javbus.com/uncensored/page/3',
  ];
  const results = await Promise.allSettled(pages.map(u => getHtml(u)));
  const all = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? parseGrid(r.value, `javbus-u${i + 1}`) : []
  );
  return sample(dedup(all), 20);
}

// ─────────────────────────────────────────────
// 高清：/genre/hd 前3页合并 → dedup → shuffle → 取20
// ─────────────────────────────────────────────

async function fetchHD(): Promise<JavItem[]> {
  const pages = [
    'https://www.javbus.com/genre/hd',
    'https://www.javbus.com/genre/hd/2',
    'https://www.javbus.com/genre/hd/3',
  ];
  const results = await Promise.allSettled(pages.map(u => getHtml(u)));
  const all = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? parseGrid(r.value, `javbus-hd${i + 1}`) : []
  );
  return sample(dedup(all), 20);
}

// ─────────────────────────────────────────────
// 字幕：/genre/sub 前3页合并 → dedup → shuffle → 取20
// ─────────────────────────────────────────────

async function fetchSubtitle(): Promise<JavItem[]> {
  const pages = [
    'https://www.javbus.com/genre/sub',
    'https://www.javbus.com/genre/sub/2',
    'https://www.javbus.com/genre/sub/3',
  ];
  const results = await Promise.allSettled(pages.map(u => getHtml(u)));
  const all = results.flatMap((r, i) =>
    r.status === 'fulfilled' ? parseGrid(r.value, `javbus-sub${i + 1}`) : []
  );
  return sample(dedup(all), 20);
}

// ─────────────────────────────────────────────
// 随机类别：抓 /genre 页 → 解析所有类别 → 随机取10 → 各抓首页
// ─────────────────────────────────────────────

interface Entry { key: string; name: string; }

async function fetchGenreList(): Promise<Entry[]> {
  const html = await getHtml('https://www.javbus.com/genre');
  if (!html) return [];
  const entries: Entry[] = [];
  const re = /href="https?:\/\/www\.javbus\.com\/genre\/([a-z0-9]+)"[^>]*>([^<]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].trim();
    const name = m[2].trim();
    if (/^\d+$/.test(key) || name.length < 1) continue;
    entries.push({ key, name });
  }
  return entries;
}

// 兜底类别列表（/genre 页无法访问时使用）
const FALLBACK_GENRES: Entry[] = [
  { key: 'rq', name: '巨乳' }, { key: 'we', name: '护士' }, { key: 'dp', name: '女学生' },
  { key: '2e', name: '角色扮演' }, { key: 'do', name: 'OL' }, { key: 'sm', name: '近亲' },
  { key: 'e',  name: '中出' },   { key: 'q',  name: '美少女' }, { key: '28', name: '高清' },
  { key: '2f', name: '4K' },     { key: 'zs', name: '女同' },   { key: 'zr', name: '素人' },
];

async function fetchRandomGenres(): Promise<GroupRanking[]> {
  const list = await fetchGenreList();
  const pool = list.length >= 10 ? list : FALLBACK_GENRES;
  const picked = sample(pool, 10);

  const results = await Promise.allSettled(
    picked.map(g => getHtml(`https://www.javbus.com/genre/${g.key}`))
  );

  return picked
    .map((g, i) => ({
      name: g.name,
      key: g.key,
      items: results[i].status === 'fulfilled'
        ? sample(parseGrid(results[i].value, `javbus-g-${g.key}`), 12)
        : [],
    }))
    .filter(g => g.items.length > 0);
}

// ─────────────────────────────────────────────
// 随机女优：抓 /actresses → 解析女优列表 → 随机取10 → 各抓 /star/xx 首页
// ─────────────────────────────────────────────

async function fetchActressList(): Promise<Entry[]> {
  const html = await getHtml('https://www.javbus.com/actresses');
  if (!html) return [];
  const entries: Entry[] = [];
  // <a href="https://www.javbus.com/star/okq">苍井空</a> 或带 avatar 的结构
  const re = /href="https?:\/\/www\.javbus\.com\/star\/([a-z0-9]+)"[^>]*>\s*(?:<img[^>]*>)?\s*<span[^>]*>([^<]+)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].trim();
    const name = m[2].trim();
    if (!key || name.length < 1) continue;
    entries.push({ key, name });
  }

  // fallback: 更宽松的匹配（纯文本链接）
  if (entries.length < 5) {
    const re2 = /href="https?:\/\/www\.javbus\.com\/star\/([a-z0-9]+)"[^>]*>([^<]{1,20})<\/a>/gi;
    while ((m = re2.exec(html)) !== null) {
      const key = m[1].trim();
      const name = m[2].trim();
      if (!key || name.length < 1 || entries.find(e => e.key === key)) continue;
      entries.push({ key, name });
    }
  }

  return entries;
}

// 兜底女优列表
const FALLBACK_ACTRESSES: Entry[] = [
  { key: '2xi', name: '三上悠亜' }, { key: 'okq', name: '苍井空' },
  { key: '2pv', name: '深田咏美' }, { key: 'jmd', name: '明日花绮罗' },
  { key: 'pix', name: '波多野结衣' }, { key: 'lhm', name: '天使もえ' },
  { key: 'qhd', name: '桃乃木香奈' }, { key: 'zld', name: '椎名空' },
  { key: 'nns', name: '上原亚衣' }, { key: 'rki', name: '水野朝阳' },
  { key: 'sqt', name: '小仓由菜' }, { key: 'hgp', name: '铃村あいり' },
];

async function fetchRandomActresses(): Promise<GroupRanking[]> {
  const list = await fetchActressList();
  const pool = list.length >= 10 ? list : FALLBACK_ACTRESSES;
  const picked = sample(pool, 10);

  const results = await Promise.allSettled(
    picked.map(a => getHtml(`https://www.javbus.com/star/${a.key}`))
  );

  return picked
    .map((a, i) => ({
      name: a.name,
      key: a.key,
      items: results[i].status === 'fulfilled'
        ? sample(parseGrid(results[i].value, `javbus-star-${a.key}`), 12)
        : [],
    }))
    .filter(a => a.items.length > 0);
}

// ─────────────────────────────────────────────
// 主路由
// ─────────────────────────────────────────────

javRoutes.get('/rankings', async (c) => {
  const RANKINGS_CACHE_TTL = 20 * 60;
  const forceRefresh = c.req.query('refresh') === '1';
  
  const cacheKey = new Request('https://internal/jav-rankings-v1');
  const cache = caches.default;

  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        headers: {
          ...Object.fromEntries(cached.headers),
          'X-Cache': 'HIT',
        },
      });
    }
  }

  try {
    // 六路并发：有码、无码、高清、字幕、类别列表+抓取、女优列表+抓取
    const [r_censored, r_uncensored, r_hd, r_subtitle, r_genres, r_actresses] = await Promise.allSettled([
      fetchCensored(),
      fetchUncensored(),
      fetchHD(),
      fetchSubtitle(),
      fetchRandomGenres(),
      fetchRandomActresses(),
    ]);

    const g = <T>(r: PromiseSettledResult<T>, fb: T): T =>
      r.status === 'fulfilled' ? r.value : fb;

    const censored   = g(r_censored, []);
    const uncensored = g(r_uncensored, []);
    const hd         = g(r_hd, []);
    const subtitle   = g(r_subtitle, []);
    const genres     = g(r_genres, []);
    const actresses  = g(r_actresses, []);

    const suggestions = dedup([...censored, ...uncensored, ...hd])
      .map(i => i.code).filter(isValidCode).slice(0, 30);

    const sources: string[] = [];
    if (censored.length > 0)   sources.push('JavBus');
    if (uncensored.length > 0) sources.push('JavBus(无码)');
    if (hd.length > 0)         sources.push('JavBus(高清)');

    const response: RankingsResponse = {
      censored, uncensored, hd, subtitle, genres, actresses, suggestions,
      fetchedAt: Date.now(), sources,
    };

    const responseBody = JSON.stringify({ success: true, data: response });
    const newResponse = new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${RANKINGS_CACHE_TTL}`,
        'X-Cache': forceRefresh ? 'BYPASS' : 'MISS',
        'X-Fetched-At': new Date().toISOString(),
      },
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));

    return newResponse;
  } catch (err) {
    console.error('JAV rankings error:', err);
    return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取榜单失败' } }, 500);
  }
});



// =====================================================================
// 详情页 + 磁力链接提取
// =====================================================================

interface MagnetItem {
  name: string;
  size: string;
  date: string;
  magnet: string;      // magnet:?xt= 完整链接
  isHD: boolean;
}

// JavDetail 类型已由 parseJavDetail 的返回值替代（定义在 services/jav-utils.ts）

// extractGidUc / parseMagnets / parseDetail 已提取至 services/jav-utils.ts，此处从该模块导入

javRoutes.get('/detail', async (c) => {
  const code = (c.req.query('code') ?? '').trim().toUpperCase();
  if (!code || !/^[A-Z]+-\d+$/.test(code) && !/^[A-Z0-9]+-?\d+$/.test(code)) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: '无效的番号格式' } }, 400);
  }

  const DETAIL_CACHE_TTL = 3600;
  const cacheKey = new Request(`https://internal/jav-detail/${code}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        ...Object.fromEntries(cached.headers),
        'X-Cache': 'HIT',
      },
    });
  }

  const detailUrl = `https://www.javbus.com/${code}`;

  try {
    // Step 1：抓详情页
    const html = await getHtml(detailUrl, 15000);
    if (!html || html.length < 500) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '未找到该番号' } }, 404);
    }

    // Step 2：提取基本信息
    const detail = parseJavDetail(html, code, detailUrl);

    // Step 3：提取 gid/uc 并请求磁力 Ajax
    let magnets: MagnetItem[] = [];
    const gidUc = extractGidUc(html);
    if (gidUc) {
      const magnetUrl = `https://www.javbus.com/ajax/uncledatoolsbyajax.php?lang=zh&gid=${gidUc.gid}&uc=${gidUc.uc}&floor=${Date.now()}`;
      const magnetHtml = await getHtml(magnetUrl, 12000);
      magnets = parseMagnets(magnetHtml);
    }

    const detailResponse = JSON.stringify({ success: true, data: { ...detail, magnets } });
    const newResponse = new Response(detailResponse, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${DETAIL_CACHE_TTL}`,
        'X-Cache': 'MISS',
      },
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
    return newResponse;
  } catch (err) {
    console.error('JAV detail error:', err);
    return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取详情失败' } }, 500);
  }
});

// =====================================================================
// 真实种子文件代理下载
// GET /api/jav/torrent/:hash
// 从 itorrents.org 获取真实 .torrent 文件并代理返回
// =====================================================================

javRoutes.get('/torrent/:hash', async (c) => {
  const raw = c.req.param('hash').trim();
  // 支持 40位hex 或 32位base32
  const isHex = /^[a-fA-F0-9]{40}$/.test(raw);
  const isBase32 = /^[a-zA-Z2-7]{32}$/.test(raw);
  if (!isHex && !isBase32) {
    return c.json({ success: false, error: { code: 'INVALID_HASH', message: '无效的 info hash' } }, 400);
  }

  // 统一转为大写hex
  const hash = isHex ? raw.toUpperCase() : base32ToHexPublic(raw).toUpperCase();

  // itorrents.org 是目前最稳定的公共种子缓存服务
  const sources = [
    `https://itorrents.org/torrent/${hash}.torrent`,
    `https://torrage.info/torrent.php?h=${hash}`,
  ];

  for (const url of sources) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': JAV_HEADERS['User-Agent'] },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const ct = resp.headers.get('content-type') ?? '';
      // 确认拿到的是种子，不是HTML错误页
      if (!ct.includes('bittorrent') && !ct.includes('octet-stream')) continue;

      const data = await resp.arrayBuffer();
      return new Response(data, {
        headers: {
          'Content-Type': 'application/x-bittorrent',
          'Content-Disposition': `attachment; filename="${hash}.torrent"`,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch {
      continue;
    }
  }

  return c.json({ success: false, error: { code: 'NOT_FOUND', message: '未找到该种子文件，请改用磁力链接' } }, 404);
});

// base32→hex（供路由内部使用）
function base32ToHexPublic(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32.toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    hex += parseInt(bits.slice(i, i + 8), 2).toString(16).padStart(2, '0');
  }
  return hex;
}

// =====================================================================
// 推荐女优列表 & 女优详情
// =====================================================================

interface ActressEntry {
  key: string;   // star slug，如 qs6
  name: string;  // 女优姓名
}

interface StarResponse {
  name: string;
  key: string;
  items: JavItem[];
}

/** 从 /actresses 页解析女优列表 */
function parseActressList(html: string): ActressEntry[] {
  if (!html) return [];
  const entries: ActressEntry[] = [];
  // <a class="avatar-box text-center" href="https://www.javbus.com/star/qs6">
  //   ...<img src="/pics/actress/qs6_a.jpg" title="明里つむぎ">...<span>明里つむぎ</span>...
  const re = /href="https?:\/\/www\.javbus\.com\/star\/([a-z0-9]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && entries.length < 50) {
    const key = m[1].trim();
    const block = m[2];
    // 优先从 img title 提取
    const titleM = block.match(/title="([^"]+)"/i);
    // 其次从 span 提取
    const spanM = block.match(/<span[^>]*>([^<]+)<\/span>/i);
    const name = (titleM ? titleM[1] : spanM ? spanM[1] : '').trim();
    if (!key || !name || name.length > 30) continue;
    // 去重
    if (entries.find(e => e.key === key)) continue;
    entries.push({ key, name });
  }
  return entries;
}

// GET /api/jav/actresses — 返回前50个女优
javRoutes.get('/actresses', async (c) => {
  const ACTRESSES_CACHE_TTL = 30 * 60;
  const cacheKey = new Request('https://internal/jav-actresses-v1');
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
    });
  }

  try {
    const html = await getHtml('https://www.javbus.com/actresses', 15000);
    if (!html || html.length < 500) {
      return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取女优列表失败' } }, 500);
    }

    const actresses = parseActressList(html);
    const response = JSON.stringify({ success: true, data: actresses.slice(0, 50) });
    const newResponse = new Response(response, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ACTRESSES_CACHE_TTL}`,
        'X-Cache': 'MISS',
      },
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
    return newResponse;
  } catch (err) {
    console.error('JAV actresses error:', err);
    return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取女优列表失败' } }, 500);
  }
});

// GET /api/jav/star/:key — 返回女优的番号列表
javRoutes.get('/star/:key', async (c) => {
  const STAR_CACHE_TTL = 10 * 60;
  const key = c.req.param('key').trim().toLowerCase();
  if (!key || !/^[a-z0-9]+$/.test(key)) {
    return c.json({ success: false, error: { code: 'INVALID_KEY', message: '无效的女优标识' } }, 400);
  }

  const cacheKey = new Request(`https://internal/jav-star/${key}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
    });
  }

  try {
    const html = await getHtml(`https://www.javbus.com/star/${key}`, 15000);
    if (!html || html.length < 500) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '未找到该女优' } }, 404);
    }

    const items = parseGrid(html, `javbus-star-${key}`);
    // 从页面提取女优名称
    const nameM = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) ||
                  html.match(/<title>([^<]+)<\/title>/i);
    const name = nameM ? nameM[1].replace(/<[^>]+>/g, '').replace(/\s*-\s*JavBus\s*$/i, '').trim() : key;

    const response: StarResponse = { name, key, items };
    const responseBody = JSON.stringify({ success: true, data: response });
    const newResponse = new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${STAR_CACHE_TTL}`,
        'X-Cache': 'MISS',
      },
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
    return newResponse;
  } catch (err) {
    console.error('JAV star error:', err);
    return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取女优详情失败' } }, 500);
  }
});
