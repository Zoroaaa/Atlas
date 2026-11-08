/**
 * 用户路由模块
 * 功能：用户设置、收藏、搜索历史、活动记录
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env, User, UserFavorite, UserSearchHistory } from '@/types';
import { success, error, generateId, logUserAction } from '@/utils';
import { authMiddleware, checkIsAdmin } from '@/middleware/auth';
import { userActivitySchema } from '@/utils/validators';
import { CONFIG, VALIDATION_RULES } from '@/constants';
import { checkRateLimitD1 } from '@/utils/rate-limit';
import { validateBody, schemas } from '@/validation';
import { getUnreadCount } from '@/services/notification-service';

const R = VALIDATION_RULES;

export const userRoutes = new Hono<{ Bindings: Env }>();

userRoutes.use('*', authMiddleware);

userRoutes.get('/settings', async (c) => {
  const user = c.get('user');

  try {
    const userRow = await c.env.DB.prepare(
      'SELECT settings FROM users WHERE id = ?'
    ).bind(user.userId).first<User>();

    if (!userRow) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    return c.json(success({
      settings: (() => { try { return JSON.parse(userRow.settings || '{}'); } catch { return {}; } })(),
    }));
  } catch (err) {
    console.error('Get settings error:', err);
    return c.json(error('SERVER_ERROR', '获取设置失败'), 500);
  }
});

userRoutes.put('/settings', validateBody(schemas.user.updateSettings), async (c) => {
  const user = c.get('user');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.user.updateSettings>;
    const { settings } = body;

    await c.env.DB.prepare(
      'UPDATE users SET settings = ?, updated_at = ? WHERE id = ?'
    ).bind(JSON.stringify(settings), Date.now(), user.userId).run();

    await logUserAction(c.env, user.userId, 'update_settings', { settings }, c);

    return c.json(success({ settings }, '设置已保存'));
  } catch (err) {
    console.error('Update settings error:', err);
    return c.json(error('SERVER_ERROR', '保存设置失败'), 500);
  }
});

// LIKE 通配符转义（配合 ESCAPE '\\'）
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => '\\' + m);

const mapFavorite = (f: UserFavorite) => ({
  id: f.id,
  userId: f.user_id,
  title: f.title,
  subtitle: f.subtitle,
  url: f.url,
  icon: f.icon,
  keyword: f.keyword,
  code: f.code,
  cover: f.cover,
  actors: f.actors,
  duration: f.duration,
  tags: f.tags,
  releaseDate: f.release_date,
  publisher: f.publisher,
  magnetLink: f.magnet_link,
  status: f.status,
  createdAt: f.created_at,
});

// 缓存校验：收藏/搜索历史的数量 + 最近修改时间，前端据此判断本地缓存是否过期（跨设备修改）
userRoutes.get('/sync-state', async (c) => {
  const user = c.get('user');

  try {
    const [fav, hist, unread] = await Promise.all([
      c.env.DB.prepare(
        'SELECT COUNT(*) AS count, COALESCE(MAX(updated_at), 0) AS updated_at FROM user_favorites WHERE user_id = ?'
      ).bind(user.userId).first<{ count: number; updated_at: number }>(),
      c.env.DB.prepare(
        'SELECT COUNT(*) AS count, COALESCE(MAX(created_at), 0) AS updated_at FROM user_search_history WHERE user_id = ?'
      ).bind(user.userId).first<{ count: number; updated_at: number }>(),
      getUnreadCount(c.env.DB, user.userId),
    ]);

    return c.json(success({
      notifications: { unread },
      favorites: { count: fav?.count ?? 0, updatedAt: fav?.updated_at ?? 0 },
      history: { count: hist?.count ?? 0, updatedAt: hist?.updated_at ?? 0 },
    }));
  } catch (err) {
    console.error('Get sync state error:', err);
    return c.json(error('SERVER_ERROR', '获取同步状态失败'), 500);
  }
});

// 轻量索引：仅 id/url/code，供搜索结果判断"是否已收藏"，避免拉取全量详情
userRoutes.get('/favorites/index', async (c) => {
  const user = c.get('user');

  try {
    const rows = await c.env.DB.prepare(
      'SELECT id, url, code FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(user.userId).all<{ id: string; url: string; code: string | null }>();

    return c.json(success({ items: rows.results || [] }));
  } catch (err) {
    console.error('Get favorites index error:', err);
    return c.json(error('SERVER_ERROR', '获取收藏失败'), 500);
  }
});

// 传 page/pageSize 时分页返回（含 total）；不传则保持全量返回（仪表盘/导出使用）
userRoutes.get('/favorites', async (c) => {
  const user = c.get('user');

  try {
    const pageParam = c.req.query('page');
    const paged = pageParam !== undefined;

    if (paged) {
      const page = Math.max(1, parseInt(pageParam!, 10) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '10', 10) || 10));

      // 可选：标题搜索 + 排序（控制台收藏页使用）
      const q = (c.req.query('q') || '').trim();
      const sortKey = c.req.query('sort') === 'title' ? 'title COLLATE NOCASE' : 'created_at';
      const sortDir = c.req.query('order') === 'asc' ? 'ASC' : 'DESC';
      const where = q ? "user_id = ? AND title LIKE ? ESCAPE '\\'" : 'user_id = ?';
      const whereArgs: unknown[] = q ? [user.userId, `%${escapeLike(q)}%`] : [user.userId];

      const [rows, totalRow] = await Promise.all([
        c.env.DB.prepare(
          `SELECT * FROM user_favorites WHERE ${where} ORDER BY ${sortKey} ${sortDir}, id ${sortDir} LIMIT ? OFFSET ?`
        ).bind(...whereArgs, pageSize, (page - 1) * pageSize).all<UserFavorite>(),
        c.env.DB.prepare(
          `SELECT COUNT(*) as count FROM user_favorites WHERE ${where}`
        ).bind(...whereArgs).first<{ count: number }>(),
      ]);

      return c.json(success({
        favorites: (rows.results || []).map(mapFavorite),
        total: totalRow?.count ?? 0,
        page,
        pageSize,
      }));
    }

    const favorites = await c.env.DB.prepare(
      'SELECT * FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(user.userId).all<UserFavorite>();

    return c.json(success({
      favorites: (favorites.results || []).map(mapFavorite),
    }));
  } catch (err) {
    console.error('Get favorites error:', err);
    return c.json(error('SERVER_ERROR', '获取收藏失败'), 500);
  }
});

userRoutes.post('/favorites', validateBody(schemas.user.addFavorite), async (c) => {
  const user = c.get('user');

  // 收藏接口速率限制：每用户每分钟最多 5 次
  const rateLimitKey = `favorite:${user.userId}`;
  // admin / super_admin 不受限流约束
  const rl = (await checkIsAdmin(c))
    ? { allowed: true }
    : await checkRateLimitD1(c.env.DB, rateLimitKey, 60_000, 5);
  if (!rl.allowed) {
    return c.json(error('RATE_LIMITED', '收藏操作过于频繁，请稍后再试'), 429);
  }

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.user.addFavorite>;
    const { title, subtitle, url, icon, keyword, code, cover, actors, duration, tags, releaseDate, publisher, magnetLink, status } = body;

    // 女优收藏已并入"关注女优"，不再接受新的女优收藏（兼容仍缓存着旧前端的客户端）
    if (typeof code === 'string' && code.startsWith('actress:')) {
      return c.json(error('USE_FOLLOW', '女优收藏已改为关注，请使用"关注"'), 400);
    }

    const existing = await c.env.DB.prepare(
      'SELECT * FROM user_favorites WHERE user_id = ? AND url = ?'
    ).bind(user.userId, url).first<UserFavorite>();

    if (existing) {
      return c.json(success(mapFavorite(existing), '已收藏该链接'));
    }

    const maxFavorites = R.FAVORITES.MAX_COUNT;
    
    const count = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_favorites WHERE user_id = ?'
    ).bind(user.userId).first<{ count: number }>();

    if (count && count.count >= maxFavorites) {
      return c.json(error('VALIDATION_ERROR', `最多只能收藏${maxFavorites}个搜索源`), 400);
    }

    const favoriteId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(`
      INSERT INTO user_favorites (id, user_id, title, subtitle, url, icon, keyword, code, cover, actors, duration, tags, release_date, publisher, magnet_link, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      favoriteId,
      user.userId,
      title,
      subtitle || null,
      url,
      icon || null,
      keyword || null,
      code || null,
      cover || null,
      actors || null,
      duration || null,
      tags || null,
      releaseDate || null,
      publisher || null,
      magnetLink || null,
      status || 'want',
      now,
      now
    ).run();

    await logUserAction(c.env, user.userId, 'add_favorite', { title, url }, c);

    // 并发插入可能突破上限，插入后兜底裁剪到最近的 N 条
    await c.env.DB.prepare(
      `DELETE FROM user_favorites WHERE user_id = ? AND id NOT IN (
         SELECT id FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
       )`
    ).bind(user.userId, user.userId, maxFavorites).run();

    return c.json(success({
      id: favoriteId,
      userId: user.userId,
      title,
      subtitle: subtitle || null,
      url,
      icon: icon || null,
      keyword: keyword || null,
      code: code || null,
      cover: cover || null,
      actors: actors || null,
      duration: duration || null,
      tags: tags || null,
      releaseDate: releaseDate || null,
      publisher: publisher || null,
      magnetLink: magnetLink || null,
      status: status || 'want',
      createdAt: now,
    }, '收藏成功'));
  } catch (err) {
    console.error('Add favorite error:', err);
    return c.json(error('SERVER_ERROR', '收藏失败'), 500);
  }
});

userRoutes.delete('/favorites/:id', async (c) => {
  const user = c.get('user');
  const favoriteId = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      'DELETE FROM user_favorites WHERE id = ? AND user_id = ?'
    ).bind(favoriteId, user.userId).run();

    if (!result.success || (result.meta?.changes ?? 0) === 0) {
      return c.json(error('NOT_FOUND', '收藏不存在'), 404);
    }

    await logUserAction(c.env, user.userId, 'remove_favorite', { favoriteId }, c);

    return c.json(success(null, '已取消收藏'));
  } catch (err) {
    console.error('Remove favorite error:', err);
    return c.json(error('SERVER_ERROR', '取消收藏失败'), 500);
  }
});

userRoutes.patch('/favorites/:id/status', validateBody(schemas.user.updateFavoriteStatus), async (c) => {
  const user = c.get('user');
  const favoriteId = c.req.param('id');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.user.updateFavoriteStatus>;
    const { status } = body;

    const existing = await c.env.DB.prepare(
      'SELECT * FROM user_favorites WHERE id = ? AND user_id = ?'
    ).bind(favoriteId, user.userId).first<UserFavorite>();

    if (!existing) {
      return c.json(error('NOT_FOUND', '收藏不存在'), 404);
    }

    const now = Date.now();
    await c.env.DB.prepare(
      'UPDATE user_favorites SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).bind(status, now, favoriteId, user.userId).run();

    await logUserAction(c.env, user.userId, 'update_favorite_status', { favoriteId, status }, c);

    return c.json(success({
      id: favoriteId,
      status,
    }, '状态更新成功'));
  } catch (err) {
    console.error('Update favorite status error:', err);
    return c.json(error('SERVER_ERROR', '更新状态失败'), 500);
  }
});

// 搜索历史统计（控制台）：总数/今日/去重关键词/活跃天数/热门关键词，全部在库里聚合
userRoutes.get('/search-history/stats', async (c) => {
  const user = c.get('user');

  try {
    const todayStart = parseInt(c.req.query('todayStart') || '0', 10) || 0;
    // 客户端时区偏移（分钟，东区为正），用于按本地日期统计活跃天数
    const tzOffset = Math.max(-840, Math.min(840, parseInt(c.req.query('tzOffset') || '0', 10) || 0));

    const [summary, top] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS today_count,
                COUNT(DISTINCT query) AS unique_keywords,
                COUNT(DISTINCT date(created_at / 1000 + ? * 60, 'unixepoch')) AS active_days
         FROM user_search_history WHERE user_id = ?`
      ).bind(todayStart, tzOffset, user.userId).first<{
        total: number; today_count: number; unique_keywords: number; active_days: number;
      }>(),
      c.env.DB.prepare(
        `SELECT query AS keyword, COUNT(*) AS count FROM user_search_history
         WHERE user_id = ? AND TRIM(query) != ''
         GROUP BY query ORDER BY count DESC, MAX(created_at) DESC LIMIT 20`
      ).bind(user.userId).all<{ keyword: string; count: number }>(),
    ]);

    return c.json(success({
      total: summary?.total ?? 0,
      todayCount: summary?.today_count ?? 0,
      uniqueKeywords: summary?.unique_keywords ?? 0,
      activeDays: summary?.active_days ?? 0,
      topKeywords: top.results || [],
    }));
  } catch (err) {
    console.error('Get search history stats error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索历史统计失败'), 500);
  }
});

// 传 page/pageSize 时分页返回（含 total，可选 q 关键词 / since 起始时间）；不传则按 limit 返回（统计、导出使用）
userRoutes.get('/search-history', async (c) => {
  const user = c.get('user');

  try {
    const pageParam = c.req.query('page');

    if (pageParam !== undefined) {
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '10', 10) || 10));
      const q = (c.req.query('q') || '').trim();
      const since = parseInt(c.req.query('since') || '0', 10) || 0;

      const conds = ['user_id = ?'];
      const args: unknown[] = [user.userId];
      if (q) { conds.push("query LIKE ? ESCAPE '\\'"); args.push(`%${escapeLike(q)}%`); }
      if (since > 0) { conds.push('created_at >= ?'); args.push(since); }
      const where = conds.join(' AND ');

      const [rows, totalRow] = await Promise.all([
        c.env.DB.prepare(
          `SELECT * FROM user_search_history WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
        ).bind(...args, pageSize, (page - 1) * pageSize).all<UserSearchHistory>(),
        c.env.DB.prepare(
          `SELECT COUNT(*) AS count FROM user_search_history WHERE ${where}`
        ).bind(...args).first<{ count: number }>(),
      ]);

      return c.json(success({
        history: rows.results || [],
        total: totalRow?.count ?? 0,
        page,
        pageSize,
      }));
    }

    const limit = Math.min(R.SEARCH_HISTORY.MAX_COUNT, Math.max(1, parseInt(c.req.query('limit') || '100', 10) || 100));
    const history = await c.env.DB.prepare(
      'SELECT * FROM user_search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).bind(user.userId, limit).all<UserSearchHistory>();

    return c.json(success({
      history: history.results || [],
    }));
  } catch (err) {
    console.error('Get search history error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索历史失败'), 500);
  }
});

userRoutes.post('/search-history', validateBody(schemas.user.addSearchHistory), async (c) => {
  const user = c.get('user');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.user.addSearchHistory>;
    const { query, source, resultsCount, title, subtitle, code, actors, duration, tags, releaseDate, publisher, keyword } = body;

    const maxHistory = R.SEARCH_HISTORY.MAX_COUNT;

    const historyId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(`
      INSERT INTO user_search_history (id, user_id, query, source, results_count, created_at, title, subtitle, code, actors, duration, tags, release_date, publisher, keyword)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      historyId,
      user.userId,
      query,
      source || '',
      resultsCount || 0,
      now,
      title || null,
      subtitle || null,
      code || null,
      actors || null,
      duration || null,
      tags || null,
      releaseDate || null,
      publisher || null,
      keyword || null
    ).run();

    // 超限时一次性裁剪到最近的 N 条（原来只删 1 条，仍可能超限）
    await c.env.DB.prepare(
      `DELETE FROM user_search_history WHERE user_id = ? AND id NOT IN (
         SELECT id FROM user_search_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
       )`
    ).bind(user.userId, user.userId, maxHistory).run();

    return c.json(success({
      id: historyId,
      query,
      source: source || '',
      resultsCount: resultsCount || 0,
      createdAt: now,
      title: title || null,
      subtitle: subtitle || null,
      code: code || null,
      actors: actors || null,
      duration: duration || null,
      tags: tags || null,
      releaseDate: releaseDate || null,
      publisher: publisher || null,
      keyword: keyword || null,
    }, '搜索历史已保存'));
  } catch (err) {
    console.error('Save search history error:', err);
    return c.json(error('SERVER_ERROR', '保存搜索历史失败'), 500);
  }
});

userRoutes.put('/search-history/:id', validateBody(schemas.user.updateSearchHistory), async (c) => {
  const user = c.get('user');
  const historyId = c.req.param('id');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.user.updateSearchHistory>;
    const { title, subtitle, code, actors, duration, tags, releaseDate, publisher, keyword } = body;

    const existing = await c.env.DB.prepare(
      'SELECT id FROM user_search_history WHERE id = ? AND user_id = ?'
    ).bind(historyId, user.userId).first<{ id: string }>();

    if (!existing) {
      return c.json(error('NOT_FOUND', '搜索历史记录不存在'), 404);
    }

    const updateFields: string[] = [];
    const updateValues: (string | number | null)[] = [];

    if (title !== undefined) { updateFields.push('title = ?'); updateValues.push(title || null); }
    if (subtitle !== undefined) { updateFields.push('subtitle = ?'); updateValues.push(subtitle || null); }
    if (code !== undefined) { updateFields.push('code = ?'); updateValues.push(code || null); }
    if (actors !== undefined) { updateFields.push('actors = ?'); updateValues.push(actors || null); }
    if (duration !== undefined) { updateFields.push('duration = ?'); updateValues.push(duration || null); }
    if (tags !== undefined) { updateFields.push('tags = ?'); updateValues.push(tags || null); }
    if (releaseDate !== undefined) { updateFields.push('release_date = ?'); updateValues.push(releaseDate || null); }
    if (publisher !== undefined) { updateFields.push('publisher = ?'); updateValues.push(publisher || null); }
    if (keyword !== undefined) { updateFields.push('keyword = ?'); updateValues.push(keyword || null); }

    if (updateFields.length === 0) {
      return c.json(error('VALIDATION_ERROR', '没有需要更新的字段'), 400);
    }

    updateFields.push('updated_at = ?');
    updateValues.push(Date.now());
    updateValues.push(historyId);
    updateValues.push(user.userId);

    await c.env.DB.prepare(`
      UPDATE user_search_history SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?
    `).bind(...updateValues).run();

    return c.json(success(null, '搜索历史已更新'));
  } catch (err) {
    console.error('Update search history error:', err);
    return c.json(error('SERVER_ERROR', '更新搜索历史失败'), 500);
  }
});

userRoutes.delete('/search-history', async (c) => {
  const user = c.get('user');

  try {
    await c.env.DB.prepare('DELETE FROM user_search_history WHERE user_id = ?').bind(user.userId).run();

    await logUserAction(c.env, user.userId, 'clear_search_history', {}, c);

    return c.json(success(null, '搜索历史已清空'));
  } catch (err) {
    console.error('Clear search history error:', err);
    return c.json(error('SERVER_ERROR', '清空搜索历史失败'), 500);
  }
});

userRoutes.delete('/search-history/:id', async (c) => {
  const user = c.get('user');
  const historyId = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      'DELETE FROM user_search_history WHERE id = ? AND user_id = ?'
    ).bind(historyId, user.userId).run();

    if (!result.success || result.meta.changes === 0) {
      return c.json(error('NOT_FOUND', '搜索历史记录不存在'), 404);
    }

    return c.json(success(null, '搜索历史已删除'));
  } catch (err) {
    console.error('Delete search history error:', err);
    return c.json(error('SERVER_ERROR', '删除搜索历史失败'), 500);
  }
});

// 批量删除搜索历史
userRoutes.post('/search-history/batch-delete', validateBody(schemas.user.batchDeleteSearchHistory), async (c) => {
  const user = c.get('user');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.user.batchDeleteSearchHistory>;
    const { ids } = body;

    const placeholders = ids.map(() => '?').join(',');
    const result = await c.env.DB.prepare(
      `DELETE FROM user_search_history WHERE id IN (${placeholders}) AND user_id = ?`
    ).bind(...ids, user.userId).run();

    return c.json(success({
      deletedCount: result.meta.changes || 0
    }, `已删除 ${result.meta.changes || 0} 条记录`));
  } catch (err) {
    console.error('Batch delete search history error:', err);
    return c.json(error('SERVER_ERROR', '批量删除失败'), 500);
  }
});

userRoutes.get('/search-stats', async (c) => {
  const user = c.get('user');

  try {
    const totalSearches = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_search_history WHERE user_id = ?'
    ).bind(user.userId).first<{ count: number }>();

    const topSources = await c.env.DB.prepare(`
      SELECT source, COUNT(*) as count 
      FROM user_search_history 
      WHERE user_id = ? AND source != '' 
      GROUP BY source 
      ORDER BY count DESC 
      LIMIT 5
    `).bind(user.userId).all<{ source: string; count: number }>();

    const recentSearches = await c.env.DB.prepare(
      'SELECT query, created_at FROM user_search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
    ).bind(user.userId).all<{ query: string; created_at: number }>();

    const now = Date.now();
    const oneWeekAgo = now - CONFIG.Stats.WEEK_IN_MS;
    const twoWeeksAgo = now - CONFIG.Stats.TWO_WEEKS_IN_MS;

    const thisWeekSearches = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_search_history WHERE user_id = ? AND created_at >= ?'
    ).bind(user.userId, oneWeekAgo).first<{ count: number }>();

    const lastWeekSearches = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_search_history WHERE user_id = ? AND created_at >= ? AND created_at < ?'
    ).bind(user.userId, twoWeeksAgo, oneWeekAgo).first<{ count: number }>();

    const thisWeek = thisWeekSearches?.count || 0;
    const lastWeek = lastWeekSearches?.count || 0;
    let searchGrowthPercent = 0;
    if (lastWeek > 0) {
      searchGrowthPercent = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    } else if (thisWeek > 0) {
      searchGrowthPercent = 100;
    }

    return c.json(success({
      totalSearches: totalSearches?.count || 0,
      topSources: topSources.results || [],
      recentSearches: recentSearches.results || [],
      searchGrowthPercent,
      thisWeekSearches: thisWeek,
      lastWeekSearches: lastWeek,
    }));
  } catch (err) {
    console.error('Get search stats error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索统计失败'), 500);
  }
});

userRoutes.get('/source-configs', async (c) => {
  const user = c.get('user');

  try {
    const configs = await c.env.DB.prepare(
      'SELECT * FROM user_search_source_configs WHERE user_id = ?'
    ).bind(user.userId).all();

    return c.json(success({
      configs: configs.results || [],
    }));
  } catch (err) {
    console.error('Get source configs error:', err);
    return c.json(error('SERVER_ERROR', '获取配置失败'), 500);
  }
});

userRoutes.put('/source-configs/:sourceId', validateBody(schemas.user.updateSourceConfig), async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('sourceId');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.user.updateSourceConfig>;
    const { isEnabled, customPriority, customName, customSubtitle, customIcon, notes } = body;

    const existing = await c.env.DB.prepare(
      'SELECT id FROM user_search_source_configs WHERE user_id = ? AND source_id = ?'
    ).bind(user.userId, sourceId).first();

    const now = Date.now();

    if (existing) {
      const updates: string[] = [];
      const params: (string | number | null)[] = [];

      if (isEnabled !== undefined) {
        updates.push('is_enabled = ?');
        params.push(isEnabled ? 1 : 0);
      }
      if (customPriority !== undefined) {
        updates.push('custom_priority = ?');
        params.push(customPriority ?? null);
      }
      if (customName !== undefined) {
        updates.push('custom_name = ?');
        params.push(customName || null);
      }
      if (customSubtitle !== undefined) {
        updates.push('custom_subtitle = ?');
        params.push(customSubtitle || null);
      }
      if (customIcon !== undefined) {
        updates.push('custom_icon = ?');
        params.push(customIcon || null);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes || null);
      }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now, user.userId, sourceId);
        await c.env.DB.prepare(`
          UPDATE user_search_source_configs
          SET ${updates.join(', ')}
          WHERE user_id = ? AND source_id = ?
        `).bind(...params).run();
      }
    } else {
      const configId = generateId();
      await c.env.DB.prepare(`
        INSERT INTO user_search_source_configs (id, user_id, source_id, is_enabled, custom_priority, custom_name, custom_subtitle, custom_icon, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        configId,
        user.userId,
        sourceId,
        isEnabled !== undefined ? (isEnabled ? 1 : 0) : 1,
        customPriority ?? null,
        customName || null,
        customSubtitle || null,
        customIcon || null,
        notes || null,
        now,
        now
      ).run();
    }

    return c.json(success(null, '配置已保存'));
  } catch (err) {
    console.error('Update source config error:', err);
    return c.json(error('SERVER_ERROR', '保存配置失败'), 500);
  }
});

userRoutes.get('/activities', async (c) => {
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 100);
  const offset = parseInt(c.req.query('offset') || '0');
  const actionType = c.req.query('action');

  try {
    let whereClause = 'WHERE user_id = ?';
    const params: (string | number)[] = [user.userId];

    if (actionType) {
      whereClause += ' AND action = ?';
      params.push(actionType);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM user_actions ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const activities = await c.env.DB.prepare(`
      SELECT id, action, data, ip_address, user_agent, created_at
      FROM user_actions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const actionLabels: Record<string, string> = {
      login: '登录',
      login_failed: '登录失败',
      logout: '登出',
      search: '搜索',
      add_favorite: '添加收藏',
      remove_favorite: '取消收藏',
      sync_favorites: '同步收藏',
      update_settings: '更新设置',
      change_password: '修改密码',
      change_email: '修改邮箱',
      delete_account: '删除账户',
      clear_search_history: '清空搜索历史',
      share_source: '分享搜索源',
      review_source: '评价搜索源',
      report_source: '举报搜索源',
    };

    return c.json(success({
      activities: (activities.results || []).map((a) => {
        const result = userActivitySchema.safeParse(a);
        const activity = result.success ? result.data : a as { id: string; action: string; data?: string; ip_address?: string; user_agent?: string; created_at: number };
        return {
          id: activity.id,
          action: activity.action,
          actionLabel: actionLabels[activity.action] || activity.action,
          data: activity.data ? (() => { try { return JSON.parse(activity.data); } catch { return {}; } })() : {},
          ipAddress: activity.ip_address,
          userAgent: activity.user_agent,
          createdAt: activity.created_at,
        };
      }),
      total: countResult?.total || 0,
      limit,
      offset,
    }));
  } catch (err) {
    console.error('Get activities error:', err);
    return c.json(error('SERVER_ERROR', '获取活动记录失败'), 500);
  }
});

userRoutes.get('/activities/stats', async (c) => {
  const user = c.get('user');

  try {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const totalActions = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_actions WHERE user_id = ?'
    ).bind(user.userId).first<{ count: number }>();

    const todayActions = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_actions WHERE user_id = ? AND created_at > ?'
    ).bind(user.userId, oneDayAgo).first<{ count: number }>();

    const weekActions = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_actions WHERE user_id = ? AND created_at > ?'
    ).bind(user.userId, oneWeekAgo).first<{ count: number }>();

    const monthActions = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_actions WHERE user_id = ? AND created_at > ?'
    ).bind(user.userId, oneMonthAgo).first<{ count: number }>();

    const actionsByType = await c.env.DB.prepare(`
      SELECT action, COUNT(*) as count
      FROM user_actions
      WHERE user_id = ?
      GROUP BY action
      ORDER BY count DESC
    `).bind(user.userId).all();

    const recentLogins = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM user_actions
      WHERE user_id = ? AND action = 'login' AND created_at > ?
    `).bind(user.userId, oneMonthAgo).first<{ count: number }>();

    const thisWeekLogins = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM user_actions
      WHERE user_id = ? AND action = 'login' AND created_at > ?
    `).bind(user.userId, oneWeekAgo).first<{ count: number }>();

    const lastWeekStart = now - 14 * 24 * 60 * 60 * 1000;
    const lastWeekLogins = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM user_actions
      WHERE user_id = ? AND action = 'login' AND created_at > ? AND created_at <= ?
    `).bind(user.userId, lastWeekStart, oneWeekAgo).first<{ count: number }>();

    const recentFailedLogins = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM user_actions
      WHERE user_id = ? AND action = 'login_failed' AND created_at > ?
    `).bind(user.userId, oneMonthAgo).first<{ count: number }>();

    const recentSearches = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM user_actions
      WHERE user_id = ? AND action = 'search' AND created_at > ?
    `).bind(user.userId, oneMonthAgo).first<{ count: number }>();

    const recentFavorites = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM user_actions
      WHERE user_id = ? AND action IN ('add_favorite', 'remove_favorite') AND created_at > ?
    `).bind(user.userId, oneMonthAgo).first<{ count: number }>();

    return c.json(success({
      total: totalActions?.count || 0,
      today: todayActions?.count || 0,
      week: weekActions?.count || 0,
      month: monthActions?.count || 0,
      actionsByType: actionsByType.results || [],
      summary: {
        logins: recentLogins?.count || 0,
        thisWeekLogins: thisWeekLogins?.count || 0,
        lastWeekLogins: lastWeekLogins?.count || 0,
        failedLogins: recentFailedLogins?.count || 0,
        searches: recentSearches?.count || 0,
        favorites: recentFavorites?.count || 0,
      },
    }));
  } catch (err) {
    console.error('Get activities stats error:', err);
    return c.json(error('SERVER_ERROR', '获取活动统计失败'), 500);
  }
});
