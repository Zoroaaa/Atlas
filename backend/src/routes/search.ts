/**
 * 搜索模块路由
 * 功能：提供搜索、搜索历史、收藏、搜索建议等功能
 * 支持：
 *   - Provider 模式：通过 SearchProvider 接口分发到各搜索引擎（anime/movie/jav/manga/novel）
 *   - 通用模式：返回匹配的搜索源 URL 列表（原有行为）
 *
 * 分层说明：
 *   路由只做「认证 → 限流 → 找 Provider → 缓存 → 返回」；
 *   源查询/历史读写下沉至 repositories/*，Provider 专属差异（子模式、多源注入、历史增强）
 *   由各 Provider 内部承载。
 *
 * 作者：CodeSeek Team
 * 日期：2024 / 2026 重构
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env, JwtPayload } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware } from '@/middleware';
import { VALIDATION_RULES } from '@/constants';
import { validateBody, schemas } from '@/validation';
import { checkMultiLevelRateLimit, checkRateLimitD1 } from '@/utils/rate-limit';
import { providerRegistry, type SearchProvider } from '@/services/search-provider';
import { setTmdbApiKey } from '@/providers/movie-provider';
import { persistDataRecord } from '@/services/data-storage';
import {
  listSourcesByCategory,
  listDefaultSources,
  listEnabledSourceIds,
  filterEnabledSources,
  toSourceCards,
} from '@/repositories/search-source-repository';
import {
  insertSearchHistory,
  deleteSearchHistory,
  updateSearchHistoryResultsCount,
  enrichSearchHistory,
  querySuggestionStats,
  queryTrendingStats,
} from '@/repositories/search-history-repository';

const R = VALIDATION_RULES;

export const searchRoutes = new Hono<{ Bindings: Env }>();

searchRoutes.use('*', authMiddleware);

/**
 * 将 Provider 从结果中提取的增强字段写入搜索历史
 * 无增强内容时跳过更新（保持原有「无字段则不写」的行为）
 */
async function applyHistoryEnrichment(
  db: D1Database,
  provider: SearchProvider,
  historyId: string,
  user: JwtPayload,
  result: Record<string, unknown>
): Promise<void> {
  const enrichment = provider.buildHistoryEnrichment?.(result);
  if (!enrichment || enrichment.fields.length === 0) return;
  const total = (result as { total?: number }).total ?? 0;
  await enrichSearchHistory(db, historyId, user.userId, enrichment.fields, enrichment.values, total);
}

/**
 * 执行搜索
 * POST /api/search
 * 需要认证，记录搜索历史
 */
searchRoutes.post('/', validateBody(schemas.search.search), async (c) => {
  const userPayload = c.get('user');

  // 搜索接口多级速率限制：每分钟5次/每小时20次/每天100次
  const rateLimitKey = userPayload ? `search:${userPayload.userId}` : `search:ip:${c.req.header('cf-connecting-ip') || 'unknown'}`;
  const rl = await checkMultiLevelRateLimit(c.env.DB, rateLimitKey, [
    { windowMs: 60_000, maxRequests: 5, label: '每分钟' },
    { windowMs: 3_600_000, maxRequests: 20, label: '每小时' },
    { windowMs: 86_400_000, maxRequests: 100, label: '每天' },
  ]);
  if (!rl.allowed) {
    return c.json(error('RATE_LIMITED', rl.message || '搜索请求过于频繁，请稍后再试'), 429);
  }

  const body = c.get('validatedBody') as z.infer<typeof schemas.search.search>;
  const { keyword, page = 1, pageSize = 20, majorCategoryId, javSubMode } = body;

  if (!keyword || !keyword.trim()) {
    return c.json(error('VALIDATION_ERROR', '搜索关键词不能为空'), 400);
  }

  const maxPageSize = R.PAGINATION.MAX_PAGE_SIZE;

  const trimmedKeyword = keyword.trim();
  const limitPageSize = Math.min(Math.max(1, pageSize), maxPageSize);
  const limitPage = Math.max(1, page);

  let historyId: string | null = null;
  try {
    if (userPayload) {
      historyId = generateId();
      await insertSearchHistory(c.env.DB, {
        id: historyId,
        userId: userPayload.userId,
        query: trimmedKeyword,
        source: majorCategoryId || 'all',
        keyword: trimmedKeyword,
        createdAt: Date.now(),
      });
    }

    const enabledSources = userPayload
      ? await listEnabledSourceIds(c.env.DB, userPayload.userId)
      : null;

    // ── Provider 分发模式：通过 Registry 查找匹配的搜索引擎 ──
    if (majorCategoryId) {
      const provider = providerRegistry.getByCategory(majorCategoryId);
      if (provider) {
        // ── Cache Layer: 缓存热门搜索结果 ──
        const SEARCH_CACHE_TTL = 10 * 60; // 10 分钟

        // JAV / Novel 的响应体含「按用户过滤的搜索源列表」（用户启用项 + 用户私有源），
        // 属于用户态数据，必须按用户隔离缓存键，否则不同用户会互相串源列表。
        const isUserScoped = provider.injectsUserSources === true;
        // 子模式（如 JAV 的 code/title/actress）结果完全不同，必须纳入缓存键，否则互相串数据
        const subModeKey = javSubMode ? `&sub=${encodeURIComponent(javSubMode)}` : '';
        const userKey = isUserScoped ? `&u=${encodeURIComponent(userPayload?.userId || 'anonymous')}` : '';
        const cacheKey = new Request(
          `https://internal/search/${encodeURIComponent(majorCategoryId)}/${encodeURIComponent(trimmedKeyword)}?page=${limitPage}${subModeKey}${userKey}`
        );
        // 用户态响应不得声明为 public：真实请求 URL /api/search 不含用户标识，
        // 一旦被中间层按公共 URL 缓存就会跨用户泄露。
        const cacheControl = isUserScoped
          ? `private, max-age=${SEARCH_CACHE_TTL}`
          : `public, max-age=${SEARCH_CACHE_TTL}`;
        const cache = caches.default;

        const cached = await cache.match(cacheKey);
        if (cached) {
          // 缓存命中同样要补写搜索历史：否则命中缓存的用户历史 results_count 恒为 0、增强元数据缺失
          const cachedText = await cached.text();
          if (historyId && userPayload) {
            try {
              const cachedData = (JSON.parse(cachedText) as { data?: Record<string, unknown> }).data;
              if (cachedData) {
                await applyHistoryEnrichment(c.env.DB, provider, historyId, userPayload, cachedData);
              }
            } catch (histErr) {
              console.error('[search] cache-hit history enrich failed:', histErr);
            }
          }
          return new Response(cachedText, {
            headers: {
              ...Object.fromEntries(cached.headers),
              'X-Cache': 'HIT',
            },
          });
        }

        try {
          // 注入 TMDB API Key（供 MovieProvider 的 suggestions/trending 使用）
          setTmdbApiKey(c.env.TMDB_API_KEY ?? undefined);

          const enrichedData = (await provider.search(trimmedKeyword, limitPage, {
            db: c.env.DB,
            user: userPayload,
            categoryId: majorCategoryId,
            subMode: javSubMode,
            enabledSources,
            apiKeys: { TMDB_API_KEY: c.env.TMDB_API_KEY ?? '' },
          })) as unknown as Record<string, unknown>;

          // 增强搜索历史记录（方案 B）：交由 Provider 从结果形态提取增强字段
          if (historyId && userPayload) {
            try {
              await applyHistoryEnrichment(c.env.DB, provider, historyId, userPayload, enrichedData);
            } catch (histErr) {
              // 历史记录失败不该影响搜索结果返回，只记日志
              console.error(`[applyHistoryEnrichment] ${provider.id} history save failed:`, histErr);
            }
          }

          // 数据存储：异步落库有效结果（去重，不阻塞响应）
          c.executionCtx.waitUntil(
            persistDataRecord(c.env.DB, enrichedData).catch((e) => console.error('[data-storage] persist error:', e))
          );

          // ── Cache Layer: 缓存搜索结果 ──
          const responseBody = JSON.stringify(success(enrichedData, '搜索完成'));
          const newResponse = new Response(responseBody, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': cacheControl,
              'X-Cache': 'MISS',
            },
          });

          c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
          return newResponse;
        } catch (err) {
          console.error(`[Provider:${provider.id}] search error:`, err);
          // 搜索失败，删除已写入的历史记录
          if (historyId && userPayload) {
            try {
              await deleteSearchHistory(c.env.DB, historyId, userPayload.userId);
            } catch (delErr) {
              console.error('[search] Failed to delete history on error:', delErr);
            }
          }
          return c.json(error('SERVER_ERROR', '搜索失败'), 500);
        }
      }
    }

    // ── 通用模式：返回匹配的搜索源 URL 列表 ──
    const sources = majorCategoryId
      ? await listSourcesByCategory(c.env.DB, {
          categoryId: majorCategoryId,
          userId: userPayload?.userId || '',
          defaultOnly: true,
        })
      : await listDefaultSources(c.env.DB, userPayload?.userId || '');

    const searchResults = toSourceCards(
      filterEnabledSources(sources, enabledSources),
      trimmedKeyword
    );

    if (historyId && userPayload) {
      await updateSearchHistoryResultsCount(c.env.DB, historyId, userPayload.userId, searchResults.length);
    }

    return c.json(success({
      keyword: trimmedKeyword,
      results: searchResults,
      total: searchResults.length,
      page: limitPage,
      pageSize: limitPageSize,
      hasMore: false,
    }, '搜索完成'));
  } catch (err) {
    console.error('Search error:', err);
    // 搜索失败，删除已写入的历史记录
    if (historyId && userPayload) {
      try {
        await deleteSearchHistory(c.env.DB, historyId, userPayload.userId);
      } catch (delErr) {
        console.error('[search] Failed to delete history on error:', delErr);
      }
    }
    return c.json(error('SERVER_ERROR', '搜索失败'), 500);
  }
});

/**
 * 获取搜索建议
 * GET /api/search/suggestions?keyword=xxx&source=xxx
 * source 参数：按搜索源过滤历史（优先具体 source，同时兼容 'all'）
 * Provider 模式：带 source 且对应 Provider 支持 suggestions → 走 Provider
 */
searchRoutes.get('/suggestions', async (c) => {
  const userPayload = c.get('user');

  // 速率限制：每用户每分钟最多 30 次（自动补全高频场景）
  const rateLimitKey = userPayload ? `suggestions:${userPayload.userId}` : `suggestions:ip:${c.req.header('cf-connecting-ip') || 'unknown'}`;
  const rl = await checkRateLimitD1(c.env.DB, rateLimitKey, 60_000, 30);
  if (!rl.allowed) {
    return c.json(error('RATE_LIMITED', '请求过于频繁，请稍后再试'), 429);
  }

  const keyword = c.req.query('keyword');
  const source = c.req.query('source');
  const limit = Math.min(
    Math.max(1, parseInt(c.req.query('limit') || '10')),
    R.SUGGESTIONS.MAX_LIMIT
  );

  if (!keyword || keyword.length < R.SUGGESTIONS.MIN_KEYWORD_LENGTH) {
    return c.json(success([]));
  }

  // ── Provider suggestions 模式 ──
  if (source && source !== 'all') {
    const provider = providerRegistry.getByCategory(source);
    if (provider?.suggestions) {
      // ── Cache Layer: 缓存 Provider suggestions ──
      const SUGGESTIONS_CACHE_TTL = 5 * 60; // 5 分钟
      const cacheKey = new Request(`https://internal/suggestions/${source}/${encodeURIComponent(keyword)}`);
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
        setTmdbApiKey(c.env.TMDB_API_KEY ?? undefined);
        const items = await provider.suggestions(keyword);
        // 统一返回格式：{ keyword, count }
        const mapped = items.map(item => ({
          keyword: item.text,
          count: 0, // Provider suggestions 不提供计数
          ...(item.meta || {}),
        }));
        // 只有非空结果才直接返回，空结果继续 fallback 到数据库历史
        if (mapped.length > 0) {
          const responseBody = JSON.stringify(success(mapped));
          const newResponse = new Response(responseBody, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${SUGGESTIONS_CACHE_TTL}`,
              'X-Cache': 'MISS',
            },
          });

          c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
          return newResponse;
        }
      } catch (err) {
        console.error(`[Provider:${provider.id}] suggestions error:`, err);
        // fallback 到通用模式
      }
    }
  }

  // ── 通用模式：基于全局搜索历史统计 ──
  // 数据量不大时直接查历史表；缓存和前端防抖是控制请求量的关键
  try {
    const trimmedKeyword = keyword.trim();
    if (trimmedKeyword.length < R.SUGGESTIONS.MIN_KEYWORD_LENGTH) {
      return c.json(success([]));
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // source 过滤：优先查具体 source，同时兼容 'all'
    const suggestions = await querySuggestionStats(c.env.DB, {
      since: thirtyDaysAgo,
      prefix: `${trimmedKeyword}%`,
      source: source || 'all',
      limit,
    });

    // CDN 缓存 60 秒，减少重复前缀的请求压力
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(success(suggestions));
  } catch (err) {
    console.error('Get suggestions error:', err);
    return c.json(success([]));
  }
});

/**
 * 获取热门搜索关键词
 * GET /api/search/trending?source=xxx
 * Provider 模式：带 source 且对应 Provider 支持 trending → 走 Provider
 * 否则 fallback 到全局搜索历史统计
 */
searchRoutes.get('/trending', async (c) => {
  const userPayload = c.get('user');

  // 速率限制：每用户每分钟最多 20 次
  const rateLimitKey = userPayload ? `trending:${userPayload.userId}` : `trending:ip:${c.req.header('cf-connecting-ip') || 'unknown'}`;
  const rl = await checkRateLimitD1(c.env.DB, rateLimitKey, 60_000, 20);
  if (!rl.allowed) {
    return c.json(error('RATE_LIMITED', '请求过于频繁，请稍后再试'), 429);
  }

  const source = c.req.query('source');
  const hourInMs = 60 * 60 * 1000;

  const limit = Math.min(
    Math.max(1, parseInt(c.req.query('limit') || String(R.TRENDING.DEFAULT_LIMIT))),
    R.TRENDING.MAX_LIMIT
  );
  const hours = Math.min(
    Math.max(1, parseInt(c.req.query('hours') || String(R.TRENDING.DEFAULT_HOURS))),
    R.TRENDING.MAX_HOURS
  );

  // ── Provider trending 模式 ──
  if (source && source !== 'all') {
    const provider = providerRegistry.getByCategory(source);
    if (provider?.trending) {
      // ── Cache Layer: 缓存 Provider trending ──
      const TRENDING_CACHE_TTL = 30 * 60; // 30 分钟
      const cacheKey = new Request(`https://internal/trending/${source}`);
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
        setTmdbApiKey(c.env.TMDB_API_KEY ?? undefined);
        const items = await provider.trending();
        // 统一返回格式：{ keyword, count }
        const mapped = items.map(item => ({
          keyword: item.keyword,
          count: item.count,
          ...(item.cover ? { cover: item.cover } : {}),
          ...(item.subtitle ? { subtitle: item.subtitle } : {}),
        }));
        // 只有非空结果才直接返回，空结果继续 fallback 到数据库历史
        if (mapped.length > 0) {
          const responseBody = JSON.stringify(success(mapped));
          const newResponse = new Response(responseBody, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${TRENDING_CACHE_TTL}`,
              'X-Cache': 'MISS',
            },
          });

          c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
          return newResponse;
        }
      } catch (err) {
        console.error(`[Provider:${provider.id}] trending error:`, err);
        // fallback 到通用模式
      }
    }
  }

  // ── 通用模式：基于全局搜索历史统计 ──
  try {
    const since = Date.now() - hours * hourInMs;

    const trending = await queryTrendingStats(c.env.DB, { since, limit });

    return c.json(success(trending));
  } catch (err) {
    console.error('Get trending error:', err);
    return c.json(success([]));
  }
});