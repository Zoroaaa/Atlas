/**
 * 用户路由模块
 * 功能：用户设置、收藏、搜索历史、活动记录
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { Env, User, UserFavorite, UserSearchHistory } from '@/types';
import { success, error, generateId, logUserAction } from '@/utils';
import { authMiddleware } from '@/middleware';
import { CONFIG, VALIDATION_RULES } from '@/constants';

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
      settings: JSON.parse(userRow.settings || '{}'),
    }));
  } catch (err) {
    console.error('Get settings error:', err);
    return c.json(error('SERVER_ERROR', '获取设置失败'), 500);
  }
});

userRoutes.put('/settings', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return c.json(error('VALIDATION_ERROR', '设置数据格式错误'), 400);
    }

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

userRoutes.get('/favorites', async (c) => {
  const user = c.get('user');

  try {
    const favorites = await c.env.DB.prepare(
      'SELECT * FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(user.userId).all<UserFavorite>();

    return c.json(success({
      favorites: favorites.results || [],
    }));
  } catch (err) {
    console.error('Get favorites error:', err);
    return c.json(error('SERVER_ERROR', '获取收藏失败'), 500);
  }
});

userRoutes.post('/favorites', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { title, subtitle, url, icon, keyword } = body;

    if (!title || !url) {
      return c.json(error('VALIDATION_ERROR', '标题和URL是必填项'), 400);
    }

    const existing = await c.env.DB.prepare(
      'SELECT id, title, subtitle, url, icon, keyword, created_at FROM user_favorites WHERE user_id = ? AND url = ?'
    ).bind(user.userId, url).first<UserFavorite>();

    if (existing) {
      return c.json(success({
        id: existing.id,
        title: existing.title,
        subtitle: existing.subtitle,
        url: existing.url,
        icon: existing.icon,
        keyword: existing.keyword,
        createdAt: existing.created_at,
      }, '已收藏该链接'));
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
      INSERT INTO user_favorites (id, user_id, title, subtitle, url, icon, keyword, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      favoriteId,
      user.userId,
      title,
      subtitle || null,
      url,
      icon || null,
      keyword || null,
      now,
      now
    ).run();

    await logUserAction(c.env, user.userId, 'add_favorite', { title, url }, c);

    return c.json(success({
      id: favoriteId,
      title,
      subtitle: subtitle || null,
      url,
      icon: icon || null,
      keyword: keyword || null,
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

    if (!result.success) {
      return c.json(error('NOT_FOUND', '收藏不存在'), 404);
    }

    await logUserAction(c.env, user.userId, 'remove_favorite', { favoriteId }, c);

    return c.json(success(null, '已取消收藏'));
  } catch (err) {
    console.error('Remove favorite error:', err);
    return c.json(error('SERVER_ERROR', '取消收藏失败'), 500);
  }
});

userRoutes.get('/search-history', async (c) => {
  const user = c.get('user');

  try {
    const limit = parseInt(c.req.query('limit') || '100', 10);
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

userRoutes.post('/search-history', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { query, source, resultsCount } = body;

    if (!query) {
      return c.json(error('VALIDATION_ERROR', '搜索关键词是必填项'), 400);
    }

    const maxHistory = R.SEARCH_HISTORY.MAX_COUNT;
    
    const count = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_search_history WHERE user_id = ?'
    ).bind(user.userId).first<{ count: number }>();

    if (count && count.count >= maxHistory) {
      const oldest = await c.env.DB.prepare(
        'SELECT id FROM user_search_history WHERE user_id = ? ORDER BY created_at ASC LIMIT 1'
      ).bind(user.userId).first<{ id: string }>();

      if (oldest) {
        await c.env.DB.prepare('DELETE FROM user_search_history WHERE id = ?').bind(oldest.id).run();
      }
    }

    const historyId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(`
      INSERT INTO user_search_history (id, user_id, query, source, results_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      historyId,
      user.userId,
      query,
      source || '',
      resultsCount || 0,
      now
    ).run();

    return c.json(success({
      id: historyId,
      query,
      source: source || '',
      resultsCount: resultsCount || 0,
      createdAt: now,
    }, '搜索历史已保存'));
  } catch (err) {
    console.error('Save search history error:', err);
    return c.json(error('SERVER_ERROR', '保存搜索历史失败'), 500);
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

userRoutes.put('/source-configs/:sourceId', async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('sourceId');

  try {
    const body = await c.req.json();
    const { isEnabled, customPriority, customName, customSubtitle, customIcon, notes } = body;

    const existing = await c.env.DB.prepare(
      'SELECT id FROM user_search_source_configs WHERE user_id = ? AND source_id = ?'
    ).bind(user.userId, sourceId).first();

    const now = Date.now();

    if (existing) {
      await c.env.DB.prepare(`
        UPDATE user_search_source_configs 
        SET is_enabled = ?, custom_priority = ?, custom_name = ?, custom_subtitle = ?, custom_icon = ?, notes = ?, updated_at = ?
        WHERE user_id = ? AND source_id = ?
      `).bind(
        isEnabled !== undefined ? (isEnabled ? 1 : 0) : 1,
        customPriority || null,
        customName || null,
        customSubtitle || null,
        customIcon || null,
        notes || null,
        now,
        user.userId,
        sourceId
      ).run();
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
        customPriority || null,
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
      activities: (activities.results || []).map((a: any) => ({
        id: a.id,
        action: a.action,
        actionLabel: actionLabels[a.action] || a.action,
        data: a.data ? JSON.parse(a.data) : {},
        ipAddress: a.ip_address,
        userAgent: a.user_agent,
        createdAt: a.created_at,
      })),
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
