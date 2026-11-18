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
  type JavItem,
} from '@/services/jav-utils';
import { inspectJavCode } from '@codeseek/shared/utils';
import {
  JAV_RANKING,
  JAV_TOP250,
  JAV_TOP250_SECTION_KEYS,
  JAV_TOP250_YEARS,
  GENRE_REC,
  GENRE_WORKS,
  type JavTop250SectionKey,
} from '@/constants';
import { getJavRankingSnapshot } from '@/services/ranking-snapshot';
import { getTop250Snapshot } from '@/services/ranking-archive';
import { getHotActressRanking } from '@/services/actress-ranking';
import { enrichDataRecordFromDetail } from '@/services/data-storage';
import { getLibraryJavDetail } from '@/services/library-detail';
import { upsertWorksToLibrary } from '@/services/library-writer';
import { success, error } from '@/utils';
import { checkRateLimitD1 } from '@/utils/rate-limit';
import { checkIsAdmin } from '@/middleware/auth';
import { getGenreByKey } from '@/repositories/genre-repository';
import { getGenreRecommendations } from '@/services/genre-recommendation';
import { getGenreWorks } from '@/services/genre-works';
import {
  rankingCacheKeyUrl,
  top250CacheKeyUrl,
} from '@/services/ranking-cache';
import { coverObjectRef, isAllowedCoverHost, normalizeCoverUrl } from '@/services/media-key';
import {
  MAX_COVER_BYTES,
  buildCoverFetchHeaders,
  clearCoverTombstone,
  coverPublicUrl,
  detectImageMime,
  hasFreshCoverTombstone,
  putCoverObject,
  putCoverTombstone,
  readBodyWithLimit,
} from '@/services/media-store';

export const javRoutes = new Hono<{ Bindings: Env }>();

// 图片代理（无需认证）
// GET /api/jav/proxy-image?url=<encoded_url>

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

/** 1x1 透明 GIF（错误时返回，避免 <img> 标签触发 ORB） */
const FALLBACK_GIF = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59]);

function fallbackImage(maxAgeSeconds = 0): Response {
  return new Response(FALLBACK_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': maxAgeSeconds > 0 ? `public, max-age=${maxAgeSeconds}` : 'no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
}

// 单 IP 每分钟回源上限（isolate 内近似值，硬限流交给 Cloudflare WAF/限流规则）
const UPSTREAM_FETCH_LIMIT = 300;
const upstreamFetchWindows = new Map<string, { count: number; resetAt: number }>();

function allowUpstreamFetch(ip: string): boolean {
  const now = Date.now();
  const row = upstreamFetchWindows.get(ip);
  if (!row || row.resetAt <= now) {
    if (upstreamFetchWindows.size > 5000) upstreamFetchWindows.clear();
    upstreamFetchWindows.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (row.count >= UPSTREAM_FETCH_LIMIT) return false;
  row.count += 1;
  return true;
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
    return fallbackImage();
  }

  // 历史数据可能存的是旧代理地址：先解包再校验内层 host。
  // 回填链路（coverObjectRef）也是先归一化，两条链路必须一致，否则旧数据必 403。
  const normalizedUrl = normalizeCoverUrl(targetUrl);
  if (!normalizedUrl) {
    console.warn('Proxy image invalid url:', targetUrl);
    return fallbackImage();
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return fallbackImage();
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fallbackImage();
  }

  if (isPrivateIP(parsed.hostname)) {
    console.warn('SSRF attempt blocked:', parsed.hostname);
    return fallbackImage();
  }

  // JavDB 封面 CDN 使用 c0/c1/... 子域，按受控后缀放行
  if (!isAllowedCoverHost(parsed.hostname)) {
    console.warn('Proxy image forbidden host:', parsed.hostname);
    return fallbackImage();
  }

  const objectRef = await coverObjectRef(normalizedUrl);
  if (!objectRef) return fallbackImage();

  // 边缘缓存：只缓存 302，避免每次请求都做 R2 head；GIF 与直出字节交给浏览器缓存
  const edgeCache = typeof caches === 'undefined' ? null : caches.default;
  const cacheKey = edgeCache ? new Request(c.req.url, { method: 'GET' }) : null;
  if (edgeCache && cacheKey) {
    const cached = await edgeCache.match(cacheKey);
    if (cached) return cached;
  }

  // R2 命中：生产环境 302 到 CDN，本地开发/未配置公网域名时直接从 R2 读字节。
  // key 是 URL 的纯函数，这里不查 D1。
  if (c.env.MEDIA) {
    const publicUrl = coverPublicUrl(c.env, objectRef.objectKey);
    if (publicUrl) {
      const head = await c.env.MEDIA.head(objectRef.objectKey);
      if (head) {
        const redirect = new Response(null, {
          status: 302,
          headers: {
            Location: publicUrl,
            'Cache-Control': 'public, max-age=86400',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
        if (edgeCache && cacheKey) {
          try {
            c.executionCtx.waitUntil(edgeCache.put(cacheKey, redirect.clone()));
          } catch {
            // 测试/非 Worker 运行时没有 executionCtx
          }
        }
        return redirect;
      }
    } else {
      const cached = await c.env.MEDIA.get(objectRef.objectKey);
      if (cached) {
        return new Response(cached.body, {
          headers: {
            'Content-Type': cached.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      }
    }

    // 已知失败墓碑：短时间内不再回源，避免坏图在每次渲染都触发上游请求
    if (await hasFreshCoverTombstone(c.env, objectRef.hash)) {
      return fallbackImage(300);
    }
  }

  // 只限制真正回源的请求；R2/墓碑命中不计数
  if (!allowUpstreamFetch(c.req.header('cf-connecting-ip') || 'unknown')) {
    console.warn('Proxy image rate limited:', parsed.hostname);
    return fallbackImage(30);
  }

  const imageFetchHeaders = buildCoverFetchHeaders(new URL(objectRef.normalizedUrl));
  const fetchUrl = objectRef.normalizedUrl;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(fetchUrl, {
        headers: imageFetchHeaders,
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });

      if (resp.status === 403 && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      if (!resp.ok) {
        console.error('Image fetch failed:', fetchUrl, resp.status);
        await putCoverTombstone(c.env, objectRef.hash, `HTTP_${resp.status}`).catch(() => undefined);
        return fallbackImage(300);
      }

      const data = await readBodyWithLimit(resp, MAX_COVER_BYTES);
      if (!data) {
        console.error('Image too large:', fetchUrl);
        await putCoverTombstone(c.env, objectRef.hash, 'TOO_LARGE').catch(() => undefined);
        return fallbackImage(300);
      }

      const upstreamType = resp.headers.get('content-type')?.split(';')[0].trim() || '';
      let contentType = upstreamType;
      if (!contentType.startsWith('image/')) {
        contentType = detectImageMime(data) || '';
        if (!contentType) {
          console.error('Image returned non-image content:', fetchUrl, upstreamType);
          await putCoverTombstone(c.env, objectRef.hash, `NOT_IMAGE: ${upstreamType || 'unknown'}`).catch(() => undefined);
          return fallbackImage(300);
        }
      }

      // 异步写入 R2，不阻塞本次响应；写入失败不影响出图，下次访问会重试
      if (c.env.MEDIA) {
        const put = putCoverObject(c.env, objectRef.objectKey, data, contentType, new URL(fetchUrl).hostname)
          .then(() => clearCoverTombstone(c.env, objectRef.hash))
          .catch((err) => console.error('Cover R2 put failed:', fetchUrl, err));
        try {
          c.executionCtx.waitUntil(put);
        } catch {
          // 非 Worker 运行时（测试）没有 executionCtx，直接丢弃本次写入
          void put;
        }
      }

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
      console.error('Proxy image error:', fetchUrl, err);
      await putCoverTombstone(c.env, objectRef.hash, `NETWORK: ${(err as Error).message || 'fetch failed'}`)
        .catch(() => undefined);
      return fallbackImage(300);
    }
  }

  return fallbackImage(300);
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

  // Cache API 只接受本 zone 的 URL：用请求 origin + 固定内部路径，导入成功后会主动删除
  const cacheKey = new Request(rankingCacheKeyUrl(new URL(c.req.url).origin));
  const cache = caches.default;

  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      return new Response(cached.body, { headers });
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

// ─────────────────────────────────────────────
// TOP250：全部 + 四个大类（月度）/ 年度榜（双月）
// GET /api/jav/top250?section=all|censored|uncensored|western|fc2&year=2026|all
// ─────────────────────────────────────────────

javRoutes.get('/top250', async (c) => {
  const rawSection = (c.req.query('section') ?? 'all').trim().toLowerCase();
  const rawYear = (c.req.query('year') ?? '').trim();
  const forceRefresh = c.req.query('refresh') === '1';

  const section = JAV_TOP250_SECTION_KEYS.includes(rawSection as JavTop250SectionKey)
    ? rawSection as JavTop250SectionKey
    : 'all';

  let year: number | null = null;
  if (rawYear && rawYear !== 'all') {
    const parsed = Number.parseInt(rawYear, 10);
    if (!JAV_TOP250_YEARS.includes(parsed)) {
      return c.json(error('INVALID_YEAR', `年份仅支持 ${JAV_TOP250.YEAR_START}-${JAV_TOP250.YEAR_END}`), 400);
    }
    year = parsed;
  }

  const ttl = year == null
    ? JAV_TOP250.OVERALL_CACHE_TTL_SECONDS
    : JAV_TOP250.YEAR_CACHE_TTL_SECONDS;
  const cacheKey = new Request(
    top250CacheKeyUrl(new URL(c.req.url).origin, year == null ? section : 'all', year)
  );
  const cache = caches.default;

  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      return new Response(cached.body, { headers });
    }
  }

  try {
    // 年度榜只有「全部」分类，忽略总榜 tab 的分类选择
    const snapshot = await getTop250Snapshot(c.env.DB, year == null ? section : 'all', year);
    const body = JSON.stringify({
      success: true,
      data: {
        ...snapshot,
        years: JAV_TOP250_YEARS,
      },
    });
    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
        'X-Cache': forceRefresh ? 'BYPASS' : 'MISS',
        'X-Fetched-At': new Date().toISOString(),
      },
    });

    // 空结果不写长缓存：迁移未执行/瞬时报错时不能让面板 30 天看不到数据
    if (snapshot.items.length > 0) {
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  } catch (err) {
    console.error('JAV top250 error:', err);
    return c.json(error('FETCH_ERROR', '获取 TOP250 失败'), 500);
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
 * 实体作品列表回写本地库：导演/制作商/发行商/系列四条链路共用。
 * 失败只记日志，不影响接口返回；已有记录只补空缺字段，不覆盖标题/封面。
 */
function saveEntityWorks(db: D1Database, items: JavItem[], path: string): Promise<void> {
  const entityKind = path.match(/\/(director|studio|label|series|genre)\/[a-z0-9]+$/i)?.[1]?.toLowerCase()
    ?? 'entity';
  return upsertWorksToLibrary(db, items, {
    sourceName: 'JavBus',
    sourceType: 'entity',
    sourceData: {
      via: 'entity',
      entityKind,
      entityPath: path,
    },
  }).catch((err) => console.error('[jav-entity] save works to library failed:', err));
}

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

  // v2：新增 tagLinks，旧 v1 缓存不含标签链接
  const cacheKey = new Request(`https://internal/jav-entity-links-v2/${code}`);
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
        tagLinks: detail.tagLinks ?? [],
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
      // 缓存命中同样回写：首次抓取时落库失败、或缓存来自旧版本时也能补齐
      const cachedBody = await cached
        .clone()
        .json<{ data?: { items?: JavItem[] } }>()
        .catch(() => null);
      const cachedItems = cachedBody?.data?.items;
      if (Array.isArray(cachedItems) && cachedItems.length > 0) {
        c.executionCtx.waitUntil(saveEntityWorks(c.env.DB, cachedItems, path));
      }
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

    const items = parseGrid(result.html, 'javbus-entity');
    c.executionCtx.waitUntil(saveEntityWorks(c.env.DB, items, path));

    const body = JSON.stringify({
      success: true,
      data: {
        path,
        externalUrl,
        items,
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
  const cacheKey = new Request('https://internal/jav-hot-actresses-v6');
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
