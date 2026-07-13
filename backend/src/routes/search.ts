/**
 * 搜索模块路由
 * 功能：提供搜索、搜索历史、收藏、搜索建议等功能
 * 支持：
 *   - Provider 模式：通过 SearchProvider 接口分发到各搜索引擎（anime/movie/jav）
 *   - 通用模式：返回匹配的搜索源 URL 列表（原有行为）
 *
 * 架构升级说明：
 *   原 if-else 分发逻辑已替换为 SearchProviderRegistry 查找。
 *   新增搜索类别只需：(1)实现 SearchProvider接口 (2)在 index.ts 注册
 * 作者：CodeSeek Team
 * 日期：2024 / 2026 重构
 */
import { Hono } from 'hono';
import { Env, SearchSource, JwtPayload } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware } from '@/middleware';
import { VALIDATION_RULES } from '@/constants';
import { checkRateLimit } from '@/utils/rate-limit';
import { providerRegistry } from '@/services/search-provider';
import { setTmdbApiKey } from '@/providers/movie-provider';

const R = VALIDATION_RULES;

export const searchRoutes = new Hono<{ Bindings: Env }>();

searchRoutes.use('*', authMiddleware);

// ─── 搜索历史增强写入（方案 B）─────────────────────────────────────────

/**
 * 根据聚合搜索结果，将丰富元数据补写到搜索历史记录
 * 利用 Bangumi ID/封面、TMDB ID/poster 等数据增强历史展示
 */
async function saveEnrichedHistory(
  db: D1Database,
  historyId: string | null,
  user: JwtPayload,
  result: Record<string, unknown>
): Promise<void> {
  if (!historyId || !user) return;

  const resultType = result.resultType as string;
  const updateFields: string[] = [];
  const updateValues: (string | number)[] = [];

  switch (resultType) {
    case 'anime': {
      // 动漫：提取首条 Bangumi 元数据 → title + cover + code(bgm:id) + tags + studio(publisher)
      const bgm = (result as { bgm?: Array<{ id: number; name: string; nameCN: string; cover: string; tags?: string[]; studio?: string; rating?: number }> }).bgm;
      const firstBgm = bgm?.[0];
      if (firstBgm) {
        updateFields.push('title=?, cover=?, code=?');
        updateValues.push(
          firstBgm.nameCN || firstBgm.name,
          firstBgm.cover,
          `bgm:${firstBgm.id}`
        );
        if (firstBgm.tags?.length) {
          updateFields.push('tags=?');
          updateValues.push(firstBgm.tags.join(','));
        }
        if (firstBgm.studio) {
          updateFields.push('publisher=?');
          updateValues.push(firstBgm.studio);
        }
        if (firstBgm.rating != null) {
          updateFields.push('subtitle=?');
          updateValues.push(`${firstBgm.rating} 分`);
        }
      }
      break;
    }
    case 'movie': {
      // 影视：提取首条 TMDB 结果 → title + cover(poster) + code(tmdb:id) + release_date
      const results = (result as { results?: Array<{ id: number; title: string; poster: string | null; release_date?: string; first_air_date?: string; vote_average?: number }> }).results;
      const firstResult = results?.[0];
      if (firstResult) {
        updateFields.push('title=?, cover=?, code=?');
        updateValues.push(
          firstResult.title,
          firstResult.poster || '',
          `tmdb:${firstResult.id}`
        );
        const release = firstResult.release_date || firstResult.first_air_date;
        if (release) {
          updateFields.push('release_date=?');
          updateValues.push(release);
        }
        if (firstResult.vote_average != null) {
          updateFields.push('subtitle=?');
          updateValues.push(`${firstResult.vote_average} 分`);
        }
      }
      break;
    }
    case 'jav': {
      // JAV：提取详情数据 → title + cover + code(番号) + actors + duration + release_date + publisher + tags
      const detail = (result as { detail?: { code: string; title: string; cover?: string; actresses?: string[]; duration?: string; releaseDate?: string; publisher?: string; tags?: string[] } }).detail;
      if (detail) {
        updateFields.push('title=?, cover=?');
        updateValues.push(detail.title, detail.cover || '');
        if (detail.actresses?.length) {
          updateFields.push('actors=?');
          updateValues.push(detail.actresses.join(','));
        }
        if (detail.duration) {
          updateFields.push('duration=?');
          updateValues.push(detail.duration);
        }
        if (detail.releaseDate) {
          updateFields.push('release_date=?');
          updateValues.push(detail.releaseDate);
        }
        if (detail.publisher) {
          updateFields.push('publisher=?');
          updateValues.push(detail.publisher);
        }
        if (detail.tags?.length) {
          updateFields.push('tags=?');
          updateValues.push(detail.tags.join(','));
        }
      }
      break;
    }
  }

  if (updateFields.length > 0) {
    const total = (result as { total: number }).total ?? 0;
    updateFields.push('results_count=?');
    updateValues.push(total);
    updateValues.push(historyId, user.userId);

    await db.prepare(
      `UPDATE user_search_history SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...updateValues).run();
  }
}

/**
 * 执行搜索
 * POST /api/search
 * 需要认证，记录搜索历史
 */
searchRoutes.post('/', async (c) => {
  const userPayload = c.get('user');

  // 搜索接口速率限制：每用户每分钟最多 15 次
  const rateLimitKey = userPayload ? `search:${userPayload.userId}` : `search:ip:${c.req.header('cf-connecting-ip') || 'unknown'}`;
  const rl = checkRateLimit(rateLimitKey);
  if (!rl.allowed) {
    return c.json(error('RATE_LIMITED', '请求过于频繁，请稍后再试'), 429);
  }

  const body = await c.req.json();
  const { keyword, page = 1, pageSize = 20, majorCategoryId, categoryId } = body;

  if (!keyword || !keyword.trim()) {
    return c.json(error('VALIDATION_ERROR', '搜索关键词不能为空'), 400);
  }

  const maxPageSize = R.PAGINATION.MAX_PAGE_SIZE;

  const trimmedKeyword = keyword.trim();
  const limitPageSize = Math.min(Math.max(1, pageSize), maxPageSize);
  const limitPage = Math.max(1, page);

  try {
    let historyId: string | null = null;
    if (userPayload) {
      historyId = generateId();
      await c.env.DB.prepare(
        `INSERT INTO user_search_history (id, user_id, query, source, results_count, created_at, keyword)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      ).bind(historyId, userPayload.userId, trimmedKeyword, categoryId || majorCategoryId || 'all', Date.now(), trimmedKeyword).run();
    }

    let userEnabledSources: Set<string> | null = null;
    if (userPayload) {
      const userConfigs = await c.env.DB.prepare(
        `SELECT source_id FROM user_search_source_configs 
         WHERE user_id = ? AND is_enabled = 1`
      ).bind(userPayload.userId).all<{ source_id: string }>();

      if (userConfigs.results && userConfigs.results.length > 0) {
        userEnabledSources = new Set(userConfigs.results.map(c => c.source_id));
      }
    }

    // ── Provider 分发模式：通过 Registry 查找匹配的搜索引擎 ──
    let actualMajorCategoryId: string | undefined = majorCategoryId;

    if (!actualMajorCategoryId && categoryId) {
      const catRow = await c.env.DB.prepare(
        'SELECT major_category_id FROM search_source_categories WHERE id = ?'
      ).bind(categoryId).first<{ major_category_id: string }>();
      actualMajorCategoryId = catRow?.major_category_id;
    }

    if (actualMajorCategoryId) {
      const provider = providerRegistry.getByCategory(actualMajorCategoryId);
      if (provider) {
        try {
          // 注入 TMDB API Key（供 MovieProvider 的 suggestions/trending 使用）
          setTmdbApiKey(c.env.TMDB_API_KEY ?? undefined);
          const enrichedData = await provider.search(trimmedKeyword, limitPage, {
            apiKeys: { TMDB_API_KEY: c.env.TMDB_API_KEY ?? '' },
          }) as unknown as Record<string, unknown>;

          // ── JAV Hybrid：合并多源列表到 Provider 响应 ──
          // JAV 需要同时返回 detail（JavDetailPanel）和 results（SearchResultsPanel）
          if (provider.id === 'jav') {
            const sources = await c.env.DB.prepare(`
              SELECT s.* FROM search_sources s
              INNER JOIN search_source_categories c ON s.category_id = c.id
              WHERE s.is_active = 1 AND s.searchable = 1 AND c.major_category_id = ?
              AND (s.is_system = 1 OR s.created_by = ?)
              ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC
            `).bind(actualMajorCategoryId, userPayload?.userId || '').all<SearchSource>();

            const filteredSources = userEnabledSources
              ? (sources.results || []).filter(s => userEnabledSources.has(s.id))
              : (sources.results || []);

            enrichedData.results = filteredSources.map(source => ({
              id: source.id,
              name: source.name,
              subtitle: source.subtitle,
              icon: source.icon,
              url: source.url_template.replace('{keyword}', encodeURIComponent(trimmedKeyword)),
              siteType: source.site_type,
              category: source.category_id,
              description: source.description,
            }));
            enrichedData.total = filteredSources.length;
          }

          // 增强搜索历史记录（方案 B）
          if (historyId && userPayload) {
            await saveEnrichedHistory(c.env.DB, historyId, userPayload, enrichedData);
          }

          return c.json(success(enrichedData, '搜索完成'));
        } catch (err) {
          console.error(`[Provider:${provider.id}] search error:`, err);
          return c.json(error('SERVER_ERROR', '搜索失败'), 500);
        }
      }
    }

    // ── 通用模式：返回匹配的搜索源 URL 列表 ──
    let query: string;
    let params: (string | number)[];

    if (categoryId) {
      query = `
        SELECT s.* FROM search_sources s
        INNER JOIN search_source_categories c ON s.category_id = c.id
        WHERE s.is_active = 1 AND s.searchable = 1 AND c.default_searchable = 1 AND s.category_id = ?
        AND (s.is_system = 1 OR s.created_by = ?)
        ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC
      `;
      params = [categoryId, userPayload?.userId || ''];
    } else if (majorCategoryId) {
      query = `
        SELECT s.* FROM search_sources s
        INNER JOIN search_source_categories c ON s.category_id = c.id
        WHERE s.is_active = 1 AND s.searchable = 1 AND c.default_searchable = 1 AND c.major_category_id = ?
        AND (s.is_system = 1 OR s.created_by = ?)
        ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC
      `;
      params = [majorCategoryId, userPayload?.userId || ''];
    } else {
      query = `
        SELECT s.* FROM search_sources s
        INNER JOIN search_source_categories c ON s.category_id = c.id
        WHERE s.is_active = 1 AND s.searchable = 1 AND c.default_searchable = 1
        AND (s.is_system = 1 OR s.created_by = ?)
        ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC
      `;
      params = [userPayload?.userId || ''];
    }

    const sources = await c.env.DB.prepare(query).bind(...params).all<SearchSource>();

    const filteredSources = userEnabledSources
      ? (sources.results || []).filter(s => userEnabledSources.has(s.id))
      : (sources.results || []);

    const searchResults = filteredSources.map(source => ({
      id: source.id,
      name: source.name,
      subtitle: source.subtitle,
      icon: source.icon,
      url: source.url_template.replace('{keyword}', encodeURIComponent(trimmedKeyword)),
      siteType: source.site_type,
      category: source.category_id,
      description: source.description,
    }));

    if (historyId && userPayload) {
      await c.env.DB.prepare(
        `UPDATE user_search_history SET results_count = ? WHERE id = ? AND user_id = ?`
      ).bind(searchResults.length, historyId, userPayload.userId).run();
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
    return c.json(error('SERVER_ERROR', '搜索失败'), 500);
  }
});

/**
 * 获取搜索建议
 * GET /api/search/suggestions?keyword=xxx&categoryId=xxx
 * 支持两种模式：
 *   - 带 categoryId 且对应 Provider 支持 suggestions → 走 Provider
 *   - 否则 fallback 到全局搜索历史统计
 */
searchRoutes.get('/suggestions', async (c) => {
  const keyword = c.req.query('keyword');
  const categoryId = c.req.query('categoryId');
  const limit = Math.min(
    Math.max(1, parseInt(c.req.query('limit') || '10')),
    R.SUGGESTIONS.MAX_LIMIT
  );

  if (!keyword || keyword.length < R.SUGGESTIONS.MIN_KEYWORD_LENGTH) {
    return c.json(success([]));
  }

  // ── Provider suggestions 模式 ──
  if (categoryId) {
    const provider = providerRegistry.getByCategory(categoryId);
    if (provider?.suggestions) {
      try {
        setTmdbApiKey(c.env.TMDB_API_KEY ?? undefined);
        const items = await provider.suggestions(keyword);
        // 统一返回格式：{ keyword, count }
        const mapped = items.map(item => ({
          keyword: item.text,
          count: 0, // Provider suggestions 不提供计数
          ...(item.meta || {}),
        }));
        return c.json(success(mapped));
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
    const suggestions = await c.env.DB.prepare(
      `SELECT query as keyword, COUNT(*) as count
       FROM user_search_history
       WHERE created_at > ? AND query LIKE ?
       GROUP BY query
       ORDER BY count DESC
       LIMIT ?`
    ).bind(thirtyDaysAgo, `${trimmedKeyword}%`, limit).all<{ keyword: string; count: number }>();

    // CDN 缓存 60 秒，减少重复前缀的请求压力
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(success(suggestions.results || []));
  } catch (err) {
    console.error('Get suggestions error:', err);
    return c.json(success([]));
  }
});

/**
 * 获取热门搜索关键词
 * GET /api/search/trending?categoryId=xxx
 * 支持两种模式：
 *   - 带 categoryId 且对应 Provider supports trending → 走 Provider
 *   - 否则 fallback 到全局搜索历史统计
 */
searchRoutes.get('/trending', async (c) => {
  const categoryId = c.req.query('categoryId');
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
  if (categoryId) {
    const provider = providerRegistry.getByCategory(categoryId);
    if (provider?.trending) {
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
        return c.json(success(mapped));
      } catch (err) {
        console.error(`[Provider:${provider.id}] trending error:`, err);
        // fallback 到通用模式
      }
    }
  }

  // ── 通用模式：基于全局搜索历史统计 ──
  try {
    const since = Date.now() - hours * hourInMs;

    const trending = await c.env.DB.prepare(
      `SELECT query as keyword, COUNT(*) as count
       FROM user_search_history
       WHERE created_at > ?
       GROUP BY query
       ORDER BY count DESC
       LIMIT ?`
    ).bind(since, limit).all<{ keyword: string; count: number }>();

    return c.json(success(trending.results || []));
  } catch (err) {
    console.error('Get trending error:', err);
    return c.json(success([]));
  }
});
