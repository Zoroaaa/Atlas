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
  getHtml,
  fetchJavbusDetailHtml,
  extractGidUc,
  parseMagnets,
  parseJavDetail,
  JAV_HEADERS,
} from '@/services/jav-utils';
import { inspectJavCode } from '@codeseek/shared/utils';
import { JAV_RANKING } from '@/constants';
import { getJavRankingSnapshot } from '@/services/ranking-snapshot';
import { getHotActressRanking } from '@/services/actress-ranking';
import { enrichDataRecordFromDetail } from '@/services/data-storage';

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
  // 小说封面：奇书网（详情页封面，需 Referer 防盗链）
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
// 榜单：JavDB 周榜 / 月榜（只读最近快照，不删除历史）
// ─────────────────────────────────────────────

javRoutes.get('/rankings', async (c) => {
  const forceRefresh = c.req.query('refresh') === '1';

  const cacheKey = new Request('https://internal/jav-rankings-v4');
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
  const rawCode = (c.req.query('code') ?? '').trim();
  const info = inspectJavCode(rawCode);
  if (!info.recognized) {
    return c.json({ success: false, error: { code: 'INVALID_CODE', message: '无效的番号格式' } }, 400);
  }
  const code = info.code;

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

  try {
    // Step 1：抓详情页（按共享查询变体重试）
    const fetched = await fetchJavbusDetailHtml(code, 15000);
    if (!fetched) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: '未找到该番号' } }, 404);
    }

    const html = fetched.html;
    const detailUrl = `https://www.javbus.com/${fetched.usedCode}`;

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

    // 数据存储：补充/更新 JAV 记录的磁力来源（异步，不阻塞响应）
    c.executionCtx.waitUntil(
      enrichDataRecordFromDetail(c.env.DB, { detail, magnets }).catch((e) =>
        console.error('[data-storage] enrich error:', e)
      )
    );

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
// 热门女优榜
// =====================================================================

// GET /api/jav/actresses — 站内热度 + 周榜/月榜上榜作品聚合
javRoutes.get('/actresses', async (c) => {
  const forceRefresh = c.req.query('refresh') === '1';
  const cacheKey = new Request('https://internal/jav-hot-actresses-v4');
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
