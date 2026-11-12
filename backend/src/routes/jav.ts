/**
 * JAV 路由
 * - /rankings：JavDB 周榜/月榜（读 D1 最新快照）
 * - /actresses：热门女优榜（站内热度 + 榜单作品聚合）
 * - /detail、/torrent、/proxy-image：番号详情、种子代理、图片代理
 *
 * 共享工具提取至 services/jav-utils.ts；榜单/女优聚合在 services 内。
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { authMiddleware } from '@/middleware';
import {
  fetchJavbusDetailWithMagnets,
  fetchJavbusDetailHtml,
  describeJavbusFetchError,
  get,
  parseGrid,
  parseJavDetail,
  normalizeJavCode,
  normalizeJavbusEntityPath,
  JAV_HEADERS,
} from '@/services/jav-utils';
import { inspectJavCode } from '@codeseek/shared/utils';
import { JAV_RANKING, GENRE_REC, GENRE_WORKS } from '@/constants';
import { getJavRankingSnapshot } from '@/services/ranking-snapshot';
import { getHotActressRanking } from '@/services/actress-ranking';
import { enrichDataRecordFromDetail } from '@/services/data-storage';
import { getLibraryJavDetail } from '@/services/library-detail';
import { success, error } from '@/utils';
import { checkRateLimitD1 } from '@/utils/rate-limit';
import { checkIsAdmin } from '@/middleware/auth';
import { getGenreByKey } from '@/repositories/genre-repository';
import { getGenreRecommendations } from '@/services/genre-recommendation';
import { getGenreWorks } from '@/services/genre-works';

export const javRoutes = new Hono<{ Bindings: Env }>();

// 图片代理（无需认证）
// GET /api/jav/proxy-image?url=<encoded_url>
const ALLOWED_IMAGE_HOSTS = [
  'www.javbus.com',
  'javbus.com',
  'pics.javbus.com',
  'img.javbus.com',
  // JavDB 榜单封面 CDN（P3 导入的 cover_url）
  'tp.spfcas.com',
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
  // 小说封面：奇书网（历史社区帖封面仍可能引用；源站已下线，仅保留代理兼容）
  'www.xqishuta.org',
  // 历史遗留：v1.4.0 女优资料曾用 minnano-av.com，社区历史帖封面仍引用其图片 URL
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
    'tp.spfcas.com': 'https://javdb.com/',
    'www.xqishuta.org': 'https://www.xqishuta.org/',
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
// 推荐标签：按收藏/搜索画像挑选 + 随机补位
// GET /api/jav/genre-recommendations?refresh=0|1
// ─────────────────────────────────────────────

javRoutes.get('/genre-recommendations', async (c) => {
  c.header('Cache-Control', 'no-store');
  const user = c.get('user');

  if (!(await checkIsAdmin(c))) {
    const rl = await checkRateLimitD1(
      c.env.DB, `genre-rec:${user.userId}`, 60_000, GENRE_REC.RATE_LIMIT_PER_MINUTE
    );
    if (!rl.allowed) {
      return c.json(error('RATE_LIMITED', '标签请求过于频繁，请稍后再试'), 429);
    }
  }

  try {
    const data = await getGenreRecommendations(
      c.env.DB,
      user.userId,
      c.req.query('refresh') === '1'
    );
    return c.json(success(data));
  } catch (err) {
    console.error('[genre-rec] get error:', err);
    return c.json(error('SERVER_ERROR', '获取推荐标签失败'), 500);
  }
});

// ─────────────────────────────────────────────
// 标签作品：随机页 + 随机抽样
// GET /api/jav/genre-works?genre=<name_key>&refresh=0|1&prevPage=<n>
// ─────────────────────────────────────────────

javRoutes.get('/genre-works', async (c) => {
  c.header('Cache-Control', 'no-store');
  const user = c.get('user');

  if (!(await checkIsAdmin(c))) {
    const rl = await checkRateLimitD1(
      c.env.DB, `genre-works:${user.userId}`, 60_000, GENRE_WORKS.RATE_LIMIT_PER_MINUTE
    );
    if (!rl.allowed) {
      return c.json(error('RATE_LIMITED', '作品请求过于频繁，请稍后再试'), 429);
    }
  }

  const genreKey = (c.req.query('genre') ?? '').trim().toLowerCase();
  if (!genreKey) {
    return c.json(error('INVALID_GENRE', '缺少标签参数'), 400);
  }

  const prevRaw = Number.parseInt(c.req.query('prevPage') ?? '', 10);
  const prevPage = Number.isFinite(prevRaw) && prevRaw >= 1 && prevRaw <= GENRE_WORKS.MAX_PAGE
    ? prevRaw
    : undefined;

  try {
    const genre = await getGenreByKey(c.env.DB, genreKey);
    if (!genre) {
      return c.json(error('INVALID_GENRE', '标签不存在'), 400);
    }

    const outcome = await getGenreWorks(c.env.DB, user.userId, genre, {
      refresh: c.req.query('refresh') === '1',
      prevPage,
      waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    });

    if (!outcome.ok) {
      return c.json(error('SOURCE_BLOCKED', '来源暂时不可用，请稍后重试'), 502);
    }

    return c.json(success(outcome.data));
  } catch (err) {
    console.error('[genre-works] get error:', err);
    return c.json(error('SERVER_ERROR', '获取标签作品失败'), 500);
  }
});

// ─────────────────────────────────────────────
// 榜单：JavDB 周榜 / 月榜（只读最近快照，不删除历史）
// ─────────────────────────────────────────────

javRoutes.get('/rankings', async (c) => {
  const forceRefresh = c.req.query('refresh') === '1';

  const cacheKey = new Request('https://internal/jav-rankings-v5');
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
    const snapshot = await getJavRankingSnapshot(c.env.DB);
    const responseBody = JSON.stringify({ success: true, data: snapshot });
    const newResponse = new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${JAV_RANKING.CACHE_TTL_SECONDS}`,
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

// JavDetail 类型已由 parseJavDetail 的返回值替代（定义在 services/jav-utils.ts）

// extractGidUc / parseMagnets / parseDetail 已提取至 services/jav-utils.ts，此处从该模块导入

// 本地库详情（只读）：收藏分享到社区时用它补齐磁力链接等信息，不访问外部站点
javRoutes.get('/library/:code', async (c) => {
  try {
    const result = await getLibraryJavDetail(c.env.DB, c.req.param('code'));
    return c.json({ success: true, data: result });
  } catch (err) {
    console.error('Get library jav detail error:', err);
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: '读取本地库失败' } }, 500);
  }
});

javRoutes.get('/detail', async (c) => {
  const rawCode = (c.req.query('code') ?? '').trim();
  const info = inspectJavCode(rawCode);
  if (!info.recognized) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: '无效的番号格式' } }, 400);
  }
  const code = info.code;

  const DETAIL_CACHE_TTL = 3600;
  // refresh=1：跳过缓存，强制回源 JavBus，并把新数据同步写回本地库
  const forceRefresh = c.req.query('refresh') === '1';
  // v2：修复导演/制作商/发行商解析后，避免继续命中旧的空字段缓存
  const cacheKey = new Request(`https://internal/jav-detail-v2/${code}`);
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
    // Step 1-3：抓详情页 + 解析字段 + 抓磁力（统一入口，避免漏抓磁力）
    const fetched = await fetchJavbusDetailWithMagnets(code, 15000);
    if (!fetched.ok) {
      // 404 才是「没有这个番号」；超时/限流/内容异常是源不可用，不能报成未找到
      const isNotFound = fetched.error === 'NOT_FOUND';
      return c.json(
        {
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'SOURCE_UNAVAILABLE',
            message: describeJavbusFetchError(fetched.error, code),
          },
        },
        isNotFound ? 404 : 503
      );
    }

    const { detail, magnets, magnetFetchFailed } = fetched.data;

    const detailResponse = JSON.stringify({ success: true, data: { ...detail, magnets } });
    const newResponse = new Response(detailResponse, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${DETAIL_CACHE_TTL}`,
        'X-Cache': forceRefresh ? 'BYPASS' : 'MISS',
      },
    });

    // 数据存储：补充/更新 JAV 记录的磁力来源
    // 强制刷新时同步等待写库完成，保证随后搜索能立即命中最新本地库数据
    const enrichTask = enrichDataRecordFromDetail(c.env.DB, { detail, magnets, magnetFetchFailed })
      .catch((e) => console.error('[data-storage] enrich error:', e));
    if (forceRefresh) {
      await enrichTask;
    } else {
      c.executionCtx.waitUntil(enrichTask);
    }

    c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
    return newResponse;
  } catch (err) {
    console.error('JAV detail error:', err);
    return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取详情失败' } }, 500);
  }
});

// =====================================================================
// 实体作品列表：导演 / 制作商 / 发行商 / 系列
// 详情卡片上的实体字段点击后，按 JavBus 列表页抓取同类作品。
// =====================================================================

const JAV_ENTITY_CACHE_TTL = 12 * 60 * 60;
const JAV_ENTITY_LINKS_CACHE_TTL = 60 * 60;

/**
 * 老记录的 content_data 没有实体链接时，按番号回源解析一次。
 * 只解析详情页字段，不抓磁力，避免为了一个字段放大抓取成本。
 */
javRoutes.get('/entity/resolve', async (c) => {
  const user = c.get('user');
  const rawCode = (c.req.query('code') ?? '').trim();
  const info = inspectJavCode(rawCode);
  if (!info.recognized) {
    return c.json(error('INVALID_CODE', '无效的番号格式'), 400);
  }
  const code = info.code;

  const cacheKey = new Request(`https://internal/jav-entity-links-v1/${code}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
    });
  }

  const rl = await checkRateLimitD1(
    c.env.DB, `jav-entity-links:${user.userId}`, 60_000, 20
  );
  if (!rl.allowed) {
    return c.json(error('RATE_LIMITED', '请求过于频繁，请稍后再试'), 429);
  }

  try {
    const fetched = await fetchJavbusDetailHtml(code, 15000);
    if (!fetched.ok) {
      const isNotFound = fetched.error === 'NOT_FOUND';
      return c.json(
        {
          success: false,
          error: {
            code: isNotFound ? 'NOT_FOUND' : 'SOURCE_UNAVAILABLE',
            message: describeJavbusFetchError(fetched.error, code),
          },
        },
        isNotFound ? 404 : 503
      );
    }

    const detail = parseJavDetail(
      fetched.html,
      normalizeJavCode(code),
      `https://www.javbus.com/${fetched.usedCode}`
    );
    const body = JSON.stringify({
      success: true,
      data: {
        code,
        detailUrl: detail.detailUrl,
        directorLinks: detail.directorLinks ?? [],
        makerLinks: detail.makerLinks ?? [],
        publisherLinks: detail.publisherLinks ?? [],
        seriesLinks: detail.seriesLinks ?? [],
      },
    });
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${JAV_ENTITY_LINKS_CACHE_TTL}`,
        'X-Cache': 'MISS',
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error('[jav-entity] resolve failed:', err);
    return c.json(error('FETCH_ERROR', '解析实体链接失败'), 500);
  }
});

/**
 * GET /api/jav/entity?path=/director/o7&refresh=0|1
 * path 必须是 JavBus 实体列表页路径，拒绝任意 URL（防 SSRF）。
 */
javRoutes.get('/entity', async (c) => {
  const user = c.get('user');
  const rawPath = (c.req.query('path') ?? '').trim();
  const path = normalizeJavbusEntityPath(rawPath);
  if (!path) {
    return c.json(error('INVALID_PATH', '无效的实体链接'), 400);
  }

  const forceRefresh = c.req.query('refresh') === '1';
  const cacheKey = new Request(
    `https://internal/javbus-entity-v1/${encodeURIComponent(path)}`
  );
  const cache = caches.default;

  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
      });
    }
  }

  const rl = await checkRateLimitD1(
    c.env.DB, `jav-entity:${user.userId}`, 60_000, 40
  );
  if (!rl.allowed) {
    return c.json(error('RATE_LIMITED', '请求过于频繁，请稍后再试'), 429);
  }

  try {
    const externalUrl = `https://www.javbus.com${path}`;
    const result = await get(externalUrl, 15000);
    if (!result.ok) {
      const isNotFound = result.error === 'HTTP_ERROR' && result.status === 404;
      return c.json(
        error(isNotFound ? 'NOT_FOUND' : 'SOURCE_UNAVAILABLE', '来源暂时不可用，请稍后重试'),
        isNotFound ? 404 : 503
      );
    }
    // 年龄验证/维护页没有 waterfall，按源不可用处理，避免缓存异常页
    if (result.html.length < 500 || !result.html.includes('id="waterfall"')) {
      return c.json(error('SOURCE_UNAVAILABLE', '来源返回内容异常，请稍后重试'), 503);
    }

    const body = JSON.stringify({
      success: true,
      data: {
        path,
        externalUrl,
        items: parseGrid(result.html, 'javbus-entity'),
      },
    });
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${JAV_ENTITY_CACHE_TTL}`,
        'X-Cache': forceRefresh ? 'BYPASS' : 'MISS',
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error('[jav-entity] fetch failed:', err);
    return c.json(error('FETCH_ERROR', '获取实体作品失败'), 500);
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
// 热门女优榜
// =====================================================================

// GET /api/jav/actresses — 站内热度 + 周榜/月榜上榜作品聚合
javRoutes.get('/actresses', async (c) => {
  const forceRefresh = c.req.query('refresh') === '1';
  const cacheKey = new Request('https://internal/jav-hot-actresses-v5');
  const cache = caches.default;

  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        headers: { ...Object.fromEntries(cached.headers), 'X-Cache': 'HIT' },
      });
    }
  }

  try {
    const ranking = await getHotActressRanking(c.env.DB);
    const response = JSON.stringify({ success: true, data: ranking });
    const newResponse = new Response(response, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${JAV_RANKING.ACTRESS_CACHE_TTL_SECONDS}`,
        'X-Cache': forceRefresh ? 'BYPASS' : 'MISS',
      },
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
    return newResponse;
  } catch (err) {
    console.error('JAV actresses error:', err);
    return c.json({ success: false, error: { code: 'FETCH_ERROR', message: '获取热门女优失败' } }, 500);
  }
});
