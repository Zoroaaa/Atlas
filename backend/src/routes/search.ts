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
import { checkMultiLevelRateLimit, checkRateLimitD1 } from '@/utils/rate-limit';
import { providerRegistry } from '@/services/search-provider';
import { setTmdbApiKey } from '@/providers/movie-provider';
import { fetchActresses, fetchActressWorks, type ActressProfile } from '@/services/actress-search';
import { normalizeActressKeyword } from '@/services/actress-name-map';
import type { JavItem } from '@/services/jav-utils';
import { persistDataRecord } from '@/services/data-storage';

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
      // JAV 番号搜索：提取详情数据 → title + cover + code(番号) + actors + duration + release_date + publisher + tags
      const detail = (result as { detail?: { code: string; title: string; cover?: string; actresses?: string[]; duration?: string; releaseDate?: string; publisher?: string; tags?: string[] } }).detail;
      if (detail) {
        updateFields.push('title=?, cover=?');
        updateValues.push(detail.title, detail.cover || '');
        if (detail.code) {
          updateFields.push('code=?');
          updateValues.push(detail.code);
        }
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
      } else {
        // JAV 女优搜索（无 detail，有 actresses）：提取首位女优 → title + cover + code(actress:id) + actors + tags
        const actresses = (result as { actresses?: Array<{ id: string; name: string; cover?: string; ruby?: string; romaji?: string; tags?: string[] }> }).actresses;
        const firstActress = actresses?.[0];
        if (firstActress) {
          updateFields.push('title=?, cover=?, code=?');
          updateValues.push(
            firstActress.name,
            firstActress.cover || '',
            `actress:${firstActress.id}`
          );
          updateFields.push('actors=?');
          updateValues.push(firstActress.name);
          const subtitle = [firstActress.ruby, firstActress.romaji].filter(Boolean).join(' / ');
          if (subtitle) {
            updateFields.push('subtitle=?');
            updateValues.push(subtitle);
          }
          if (firstActress.tags?.length) {
            updateFields.push('tags=?');
            updateValues.push(firstActress.tags.join(','));
          }
        }
      }
      break;
    }
    case 'manga': {
      // 漫画：提取首条 MangaDex 结果 → title + cover + code(manga:id) + tags
      const manga = (result as { manga?: Array<{ id: string; title: string; cover: string; status?: string; tags?: string[] }> }).manga;
      const firstManga = manga?.[0];
      if (firstManga) {
        updateFields.push('title=?, cover=?, code=?');
        updateValues.push(
          firstManga.title,
          firstManga.cover,
          `manga:${firstManga.id}`
        );
        if (firstManga.tags?.length) {
          updateFields.push('tags=?');
          updateValues.push(firstManga.tags.join(','));
        }
      }
      break;
    }
    case 'novel': {
      // 小说：优先取 Anna's Archive 结果，fallback 到奇书网置顶结果
      // （Anna 403 等故障时奇书网是唯一有效数据，不应跳过）
      const novels = (result as { novels?: Array<{ id: string; title: string; cover: string; author?: string; publisher?: string; format?: string; year?: string; category?: string; source?: string }> }).novels;
      const firstNovel = novels?.find(n => n.source !== '奇书网') || novels?.[0];
      if (firstNovel) {
        updateFields.push('title=?, cover=?, code=?');
        updateValues.push(
          firstNovel.title,
          firstNovel.cover,
          `md5:${firstNovel.id}`
        );
        if (firstNovel.author) {
          updateFields.push('actors=?');
          updateValues.push(firstNovel.author);
        }
        if (firstNovel.publisher) {
          updateFields.push('publisher=?');
          updateValues.push(firstNovel.publisher);
        }
        const tags = [firstNovel.format, firstNovel.year, firstNovel.category].filter(Boolean).join(',');
        if (tags) {
          updateFields.push('tags=?');
          updateValues.push(tags);
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

  const body = await c.req.json();
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
      await c.env.DB.prepare(
        `INSERT INTO user_search_history (id, user_id, query, source, results_count, created_at, keyword)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      ).bind(historyId, userPayload.userId, trimmedKeyword, majorCategoryId || 'all', Date.now(), trimmedKeyword).run();
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
    if (majorCategoryId) {
      const provider = providerRegistry.getByCategory(majorCategoryId);
      if (provider) {
        // ── Cache Layer: 缓存热门搜索结果 ──
        const SEARCH_CACHE_TTL = 10 * 60; // 10 分钟
        const cacheKey = new Request(`https://internal/search/${majorCategoryId}/${encodeURIComponent(trimmedKeyword)}?page=${limitPage}`);
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
          // 注入 TMDB API Key（供 MovieProvider 的 suggestions/trending 使用）
          setTmdbApiKey(c.env.TMDB_API_KEY ?? undefined);

          // ── JAV 女优搜索子模式：调 minnano-av 抓取，但仍走 JAV Hybrid 多源逻辑 ──
          // 不短路返回：女优卡片与多源跳转卡片并行展示
          if (provider.id === 'jav' && javSubMode === 'actress') {
            let actresses: ActressProfile[] = [];
            let actressError: string | null = null;
            try {
              actresses = await fetchActresses(trimmedKeyword);
            } catch (e) {
              actressError = String(e);
              console.error('[search] minnano actress search failed:', e);
            }

            // minnano 女优搜索成功返回数据后，补充抓取 JavBus 女优作品列表
            // 关键词复用 normalizeActressKeyword 归一化结果（日文名），确保 JavBus 可命中
            let actressWorks: JavItem[] = [];
            if (actresses.length > 0) {
              try {
                actressWorks = await fetchActressWorks(trimmedKeyword);
              } catch (e) {
                console.error('[search] javbus actress works fetch failed:', e);
              }
            }

            // 仍执行 JAV Hybrid：查用户启用的 jav 源，生成多源跳转 URL
            const sources = await c.env.DB.prepare(`
              SELECT s.* FROM search_sources s
              INNER JOIN search_source_categories c ON s.category_id = c.id
              WHERE s.is_active = 1 AND s.searchable = 1 AND c.major_category_id = ?
              AND (s.is_system = 1 OR s.created_by = ?)
              ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC
            `).bind(majorCategoryId, userPayload?.userId || '').all<SearchSource>();

            const filteredSources = userEnabledSources
              ? (sources.results || []).filter(s => userEnabledSources.has(s.id))
              : (sources.results || []);

            const multiSourceResults = filteredSources.map(source => ({
              id: source.id,
              name: source.name,
              subtitle: source.subtitle,
              icon: source.icon,
              url: source.url_template.replace('{keyword}', encodeURIComponent(trimmedKeyword)),
              siteType: source.site_type,
              category: source.category_id,
              description: source.description,
            }));

            const actressData: Record<string, unknown> = {
              resultType: 'jav',
              keyword: trimmedKeyword,
              // 归一化后的日文名：供前端「minnano 站内搜索」链接使用（原文搜不到含假名女优）
              normalizedKeyword: normalizeActressKeyword(trimmedKeyword),
              page: limitPage,
              total: multiSourceResults.length,
              errors: { search: actressError },
              actresses,
              // JavBus 女优作品列表（仅当 minnano 女优搜索成功时才抓取）
              actressWorks,
              results: multiSourceResults,
            };

            // 更新搜索历史：复用 saveEnrichedHistory，女优子模式走 case 'jav' 的 actresses fallback
            if (historyId && userPayload) {
              try {
                await saveEnrichedHistory(c.env.DB, historyId, userPayload, actressData);
              } catch (e) { console.warn('Failed to update search history:', e); }
            }

            // 数据存储：异步落库有效结果（去重，不阻塞响应）
            c.executionCtx.waitUntil(
              persistDataRecord(c.env.DB, actressData).catch((e) => console.error('[data-storage] persist error:', e))
            );

            const responsePayload = { success: true, data: actressData };
            const responseBody = JSON.stringify(responsePayload);
            const newResponse = new Response(responseBody, {
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': `public, max-age=${SEARCH_CACHE_TTL}`,
                'X-Cache': 'MISS',
              },
            });
            c.executionCtx.waitUntil(cache.put(cacheKey, newResponse.clone()));
            return newResponse;
          }

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
            `).bind(majorCategoryId, userPayload?.userId || '').all<SearchSource>();

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
            try {
              await saveEnrichedHistory(c.env.DB, historyId, userPayload, enrichedData);
            } catch (histErr) {
              // 历史记录失败不该影响搜索结果返回，只记日志
              console.error(`[saveEnrichedHistory] ${provider.id} history save failed:`, histErr);
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
              'Cache-Control': `public, max-age=${SEARCH_CACHE_TTL}`,
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
              await c.env.DB.prepare('DELETE FROM user_search_history WHERE id = ? AND user_id = ?')
                .bind(historyId, userPayload.userId).run();
            } catch (delErr) {
              console.error('[search] Failed to delete history on error:', delErr);
            }
          }
          return c.json(error('SERVER_ERROR', '搜索失败'), 500);
        }
      }
    }

    // ── 通用模式：返回匹配的搜索源 URL 列表 ──
    let query: string;
    let params: (string | number)[];

    if (majorCategoryId) {
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
    // 搜索失败，删除已写入的历史记录
    if (historyId && userPayload) {
      try {
        await c.env.DB.prepare('DELETE FROM user_search_history WHERE id = ? AND user_id = ?')
          .bind(historyId, userPayload.userId).run();
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
    const suggestions = await c.env.DB.prepare(
      `SELECT query as keyword, COUNT(*) as count
       FROM user_search_history
       WHERE created_at > ? AND query LIKE ? AND (source = ? OR source = 'all')
       GROUP BY query
       ORDER BY count DESC
       LIMIT ?`
    ).bind(thirtyDaysAgo, `${trimmedKeyword}%`, source || 'all', limit).all<{ keyword: string; count: number }>();

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
