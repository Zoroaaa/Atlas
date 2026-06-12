/**
 * 搜索模块路由
 * 功能：提供搜索、搜索历史、收藏、搜索建议等功能
 * 支持：
 *   - 通用模式：返回匹配的搜索源 URL 列表（原有行为）
 *   - 聚合模式：当 majorCategoryId 为 anime_sources / movie_sources 时，
 *              返回结构化元数据 + 磁力资源（调用专用 service）
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { Env, SearchSource } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware } from '@/middleware';
import { VALIDATION_RULES } from '@/constants';
import { searchAnime } from '@/services/anime-search';
import { searchMovie } from '@/services/movie-search';

const R = VALIDATION_RULES;

export const searchRoutes = new Hono<{ Bindings: Env }>();

searchRoutes.use('*', authMiddleware);

/**
 * 执行搜索
 * POST /api/search
 * 需要认证，记录搜索历史
 */
searchRoutes.post('/', async (c) => {
  const userPayload = c.get('user');
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

    // ── 聚合模式：anime / movie 分类走专用搜索引擎 ──
    const ENRICHED_MAJOR_CATEGORIES = new Set(['anime_sources', 'movie_sources']);
    let actualMajorCategoryId: string | undefined = majorCategoryId;

    if (!actualMajorCategoryId && categoryId) {
      const catRow = await c.env.DB.prepare(
        'SELECT major_category_id FROM search_source_categories WHERE id = ?'
      ).bind(categoryId).first<{ major_category_id: string }>();
      actualMajorCategoryId = catRow?.major_category_id;
    }

    if (actualMajorCategoryId && ENRICHED_MAJOR_CATEGORIES.has(actualMajorCategoryId)) {
      try {
        let enrichedData: Record<string, unknown>;

        if (actualMajorCategoryId === 'anime_sources') {
          const result = await searchAnime(trimmedKeyword, limitPage);
          enrichedData = { ...result, resultType: 'anime' } as Record<string, unknown>;
        } else {
          const result = await searchMovie(trimmedKeyword, limitPage, c.env.TMDB_API_KEY);
          enrichedData = { ...result, resultType: 'movie' } as Record<string, unknown>;
        }

        if (historyId && userPayload) {
          await c.env.DB.prepare(
            `UPDATE user_search_history SET results_count = ? WHERE id = ? AND user_id = ?`
          ).bind(
            actualMajorCategoryId === 'anime_sources'
              ? (enrichedData as { total: number }).total
              : (enrichedData as { total: number }).total,
            historyId, userPayload.userId
          ).run();
        }

        return c.json(success(enrichedData, '搜索完成'));
      } catch (err) {
        console.error('Enriched search error:', err);
        return c.json(error('SERVER_ERROR', '搜索失败'), 500);
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
 * GET /api/search/suggestions
 * 公开接口，基于全局搜索历史
 */
searchRoutes.get('/suggestions', async (c) => {
  const keyword = c.req.query('keyword');
  const limit = Math.min(
    Math.max(1, parseInt(c.req.query('limit') || '10')),
    R.SUGGESTIONS.MAX_LIMIT
  );

  if (!keyword || keyword.length < R.SUGGESTIONS.MIN_KEYWORD_LENGTH) {
    return c.json(success([]));
  }

  try {
    const suggestions = await c.env.DB.prepare(
      `SELECT query as keyword, COUNT(*) as count 
       FROM user_search_history 
       WHERE query LIKE ? 
       GROUP BY query 
       ORDER BY count DESC 
       LIMIT ?`
    ).bind(`${keyword}%`, limit).all<{ keyword: string; count: number }>();

    return c.json(success(suggestions.results || []));
  } catch (err) {
    console.error('Get suggestions error:', err);
    return c.json(success([]));
  }
});

/**
 * 获取热门搜索关键词
 * GET /api/search/trending
 * 公开接口
 */
searchRoutes.get('/trending', async (c) => {
  const hourInMs = 60 * 60 * 1000;

  const limit = Math.min(
    Math.max(1, parseInt(c.req.query('limit') || String(R.TRENDING.DEFAULT_LIMIT))),
    R.TRENDING.MAX_LIMIT
  );
  const hours = Math.min(
    Math.max(1, parseInt(c.req.query('hours') || String(R.TRENDING.DEFAULT_HOURS))),
    R.TRENDING.MAX_HOURS
  );

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
