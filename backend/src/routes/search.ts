/**
 * 搜索路由：认证、多级限流、Provider 分发、结果缓存与搜索历史写入。
 *
 * 约束：JAV / 小说响应体含按用户过滤的搜索源列表，缓存键与 Cache-Control 必须按用户隔离。
 * 分层：源查询与历史读写走 repositories，Provider 差异由各 Provider 自行处理。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { isClassicJavCodePrefix, normalizeJavCode } from '@codeseek/shared/utils';
import { Env, JwtPayload } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware } from '@/middleware';
import { checkIsAdmin } from '@/middleware/auth';
import { VALIDATION_RULES } from '@/constants';
import { validateBody, schemas } from '@/validation';
import { checkMultiLevelRateLimit, checkRateLimitD1, getMultiLevelRateLimitUsage } from '@/utils/rate-limit';
import {
  SEARCH_TIER_LIMITS,
  SEARCH_TIER_RULES,
  getSearchTierRule,
  getEffectiveSearchTier,
  getSearchTierStats,
  getNextTierProgress,
} from '@/services/search-tier';
import { providerRegistry, type SearchProvider } from '@/services/search-provider';
import { setTmdbApiKey } from '@/providers/movie-provider';
import { persistDataRecord } from '@/services/data-storage';
import {
  listSourcesByCategory,
  listDefaultSources,
  getSourceState,
  filterEnabledSources,
  toSourceCards,
} from '@/repositories/search-source-repository';
import {
  insertSearchHistory,
  deleteSearchHistory,
  updateSearchHistoryResultsCount,
  enrichSearchHistory,
  querySuggestionStats,
} from '@/repositories/search-history-repository';

const R = VALIDATION_RULES;

export const searchRoutes = new Hono<{ Bindings: Env }>();

searchRoutes.use('*', authMiddleware);

/**
 * 把 Provider 从结果中提取的增强字段写入搜索历史。
 * 无增强内容时跳过更新，避免为没有元数据的结果白写一次库。
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
 * 执行搜索：POST /api/search。
 * 先按档位限流；Provider 命中失败或抛错时会删除刚写入的历史，避免留下脏记录。
 */
searchRoutes.post('/', validateBody(schemas.search.search), async (c) => {
  const userPayload = c.get('user');

  // 搜索接口多级速率限制：按用户档位取配额（分钟档仅作突发基线，档位差异体现在小时/天）
  const rateLimitKey = userPayload ? `search:${userPayload.userId}` : `search:ip:${c.req.header('cf-connecting-ip') || 'unknown'}`;
  // admin / super_admin 不受限流约束（角色由 authMiddleware 写入上下文，零额外查询）
  const isAdmin = await checkIsAdmin(c);
  let rl: { allowed: boolean; retryAfter?: number; message?: string } = { allowed: true };
  if (!isAdmin) {
    const tier = userPayload ? await getEffectiveSearchTier(c.env.DB, userPayload.userId) : 1;
    rl = await checkMultiLevelRateLimit(c.env.DB, rateLimitKey, SEARCH_TIER_LIMITS[tier] ?? SEARCH_TIER_LIMITS[1]);
  }
  if (!rl.allowed) {
    if (rl.retryAfter) c.header('Retry-After', String(rl.retryAfter));
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

    // 源开关与个人树版本一次性取出：任一用户源变更都会改变缓存键
    const sourceState = await getSourceState(c.env.DB, userPayload?.userId || '');
    const disabledSources = userPayload ? sourceState.disabled : null;

    // ── Provider 分发模式 ───────────────────────────────────
    if (majorCategoryId) {
      const provider = providerRegistry.getByCategory(majorCategoryId);
      if (provider) {
        // ── 搜索结果缓存 ─────────────────────────────────────
        // 10 分钟：搜索热点集中，TTL 过长会让源开关/子模式切换迟迟不生效
        const SEARCH_CACHE_TTL = 10 * 60;
        // 响应体结构版本：新增字段/改判定逻辑时递增，避免 TTL 内继续返回旧结构。
        // 只在「旧结构会让前端或少字段、或判定结果已变」时递增，不要为了改文案而刷。
        const SEARCH_CACHE_VERSION = 3;

        // JAV / Novel 的响应体含「按用户过滤的搜索源列表」（用户启用项 + 用户私有源），
        // 属于用户态数据，必须按用户隔离缓存键，否则不同用户会互相串源列表。
        const isUserScoped = provider.injectsUserSources === true;
        // 子模式（如 JAV 的 code/title/actress）结果完全不同，必须纳入缓存键，否则互相串数据
        const subModeKey = javSubMode ? `&sub=${encodeURIComponent(javSubMode)}` : '';
        const userKey = isUserScoped ? `&u=${encodeURIComponent(userPayload?.userId || 'anonymous')}` : '';
        // 用户禁用源必须进入缓存键：否则关闭某个源后，TTL 内的旧缓存仍会返回该源的结果，
        // 表现为「源管理设置不生效」。排序保证同一集合生成同一个键。
        const sourceKey = isUserScoped && disabledSources && disabledSources.size > 0
          ? `&ds=${encodeURIComponent([...disabledSources].sort().join(','))}`
          : '';
        // 版本号覆盖「新增/修改个人源」与「管理员修改系统源」两种场景；
        // 只靠禁用集合无法感知源定义变化，会把旧源列表缓存到 TTL 结束。
        const revisionKey = `&sr=${sourceState.userRevision}&gsr=${sourceState.systemRevision}`;
        const cacheKey = new Request(
          `https://internal/search/${encodeURIComponent(majorCategoryId)}/${encodeURIComponent(trimmedKeyword)}?page=${limitPage}${subModeKey}${userKey}${sourceKey}${revisionKey}&v=${SEARCH_CACHE_VERSION}`
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
            disabledSources,
            apiKeys: { TMDB_API_KEY: c.env.TMDB_API_KEY ?? '' },
            waitUntil: (task) => c.executionCtx.waitUntil(task),
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
          // 本地库命中的 JAV 详情本身来自 data_records，无需回写
          const detailFromLibrary = (enrichedData.detail as { fromLibrary?: boolean } | undefined)?.fromLibrary === true;
          if (!detailFromLibrary) {
            c.executionCtx.waitUntil(
              persistDataRecord(c.env.DB, enrichedData).catch((e) => console.error('[data-storage] persist error:', e))
            );
          }

          // ── 写回缓存 ─────────────────────────────────────
          const responseBody = JSON.stringify(success(enrichedData, '搜索完成'));
          const newResponse = new Response(responseBody, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': cacheControl,
              'X-Cache': 'MISS',
            },
          });

          // 本地库结果不写缓存：避免「拉取 JavBus 外部源」更新本地库后，
          // 10 分钟内重复搜索仍命中旧的本地库快照
          if (!detailFromLibrary) {
            c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
          }
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

    // ── 通用模式：仅返回搜索源跳转卡片 ─────────────────────
    const sources = majorCategoryId
      ? await listSourcesByCategory(c.env.DB, {
          categoryId: majorCategoryId,
          userId: userPayload?.userId || '',
          defaultOnly: true,
        })
      : await listDefaultSources(c.env.DB, userPayload?.userId || '');

    const searchResults = await toSourceCards(
      c.env.DB,
      filterEnabledSources(sources, disabledSources),
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
 * 搜索配额：GET /api/search/quota。
 * 返回当前档位、各窗口用量与下一档进度，供前端常驻展示；管理员直接返回 unlimited。
 */
searchRoutes.get('/quota', async (c) => {
  const userPayload = c.get('user');
  if (!userPayload) {
    return c.json(error('UNAUTHORIZED', '未认证'), 401);
  }

  if (await checkIsAdmin(c)) {
    return c.json(success({ unlimited: true, tier: null, label: '管理员', limits: [], tiers: [], next: null }));
  }

  const tier = await getEffectiveSearchTier(c.env.DB, userPayload.userId);
  const tierLimits = SEARCH_TIER_LIMITS[tier] ?? SEARCH_TIER_LIMITS[1];
  const usage = await getMultiLevelRateLimitUsage(c.env.DB, `search:${userPayload.userId}`, tierLimits);
  const stats = await getSearchTierStats(c.env.DB, userPayload.userId);

  return c.json(success({
    unlimited: false,
    tier,
    label: getSearchTierRule(tier).label,
    limits: usage.map((item, i) => ({
      unit: tierLimits[i].unit,
      count: item.count,
      max: item.maxRequests,
      resetAt: item.resetAt,
    })),
    tiers: SEARCH_TIER_RULES.map((rule) => ({
      tier: rule.tier,
      label: rule.label,
      minAccountAgeDays: rule.minAccountAgeDays,
      minActiveDays: rule.minActiveDays,
      minTotalSearches: rule.minTotalSearches,
      limits: (SEARCH_TIER_LIMITS[rule.tier] ?? SEARCH_TIER_LIMITS[1]).map((limit) => ({
        unit: limit.unit,
        max: limit.maxRequests,
      })),
    })),
    next: stats ? getNextTierProgress(stats, tier) : null,
  }));
});

/**
 * 获取搜索建议：GET /api/search/suggestions。
 * 带 source 且 Provider 支持 suggestions 时优先走 Provider，空结果再回落历史统计。
 */
searchRoutes.get('/suggestions', async (c) => {
  const userPayload = c.get('user');

  // 速率限制：每用户每分钟最多 30 次（自动补全高频场景）
  const rateLimitKey = userPayload ? `suggestions:${userPayload.userId}` : `suggestions:ip:${c.req.header('cf-connecting-ip') || 'unknown'}`;
  const rl = (await checkIsAdmin(c))
    ? { allowed: true }
    : await checkRateLimitD1(c.env.DB, rateLimitKey, 60_000, 30);
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

  // ── Provider suggestions 模式 ───────────────────────────
  if (source && source !== 'all') {
    const provider = providerRegistry.getByCategory(source);
    if (provider?.suggestions) {
      // ── suggestions 缓存 ───────────────────────────────
      // 5 分钟：自动补全触发频繁，缓存键只含 source + keyword（公共数据，可按 URL 共享）
      const SUGGESTIONS_CACHE_TTL = 5 * 60;
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

  // ── 通用模式：基于全局搜索历史统计 ─────────────────────
  // 数据量不大时直接查历史表；缓存和前端防抖是控制请求量的关键
  try {
    const trimmedKeyword = keyword.trim();
    if (trimmedKeyword.length < R.SUGGESTIONS.MIN_KEYWORD_LENGTH) {
      return c.json(success([]));
    }

    // 30 天窗口：只统计近期搜索，避免久远冷词长期霸占建议位
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // JAV 番号 WAAA-624 / WAAA624 等价：匹配历史时额外忽略横杠
    const sourceProvider = source && source !== 'all' ? providerRegistry.getByCategory(source) : undefined;
    const compactPrefix = sourceProvider?.id === 'jav' && isClassicJavCodePrefix(trimmedKeyword)
      ? `${normalizeJavCode(trimmedKeyword).replace(/-/g, '')}%`
      : undefined;

    // source 过滤：优先查具体 source，同时兼容 'all'
    const suggestions = await querySuggestionStats(c.env.DB, {
      since: thirtyDaysAgo,
      prefix: `${trimmedKeyword}%`,
      compactPrefix,
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
