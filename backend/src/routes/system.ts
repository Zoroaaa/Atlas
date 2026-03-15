/**
 * 系统路由模块
 * 功能：健康检查、状态缓存、用户行为记录、系统统计
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { Env, SourceStatusCache, UserAction, SearchSource } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware } from '@/middleware';
import { ConfigService } from '@/services';
import { DB_CONFIG_KEYS } from '@/constants';

export const systemRoutes = new Hono<{ Bindings: Env }>();

systemRoutes.get('/public-config', async (c) => {
  try {
    const configService = new ConfigService(c.env);

    const [
      enableRegistration,
      communityEnabled,
      siteName,
      siteDescription,
    ] = await Promise.all([
      configService.getBoolean(DB_CONFIG_KEYS.ENABLE_REGISTRATION, true),
      configService.getBoolean(DB_CONFIG_KEYS.COMMUNITY_ENABLED, true),
      configService.get(DB_CONFIG_KEYS.SITE_NAME, '磁力快搜'),
      configService.get(DB_CONFIG_KEYS.SITE_DESCRIPTION, '搜索全网资源，一步直达'),
    ]);

    return c.json(success({
      appVersion: c.env.APP_VERSION || '2.0.0',
      siteName,
      siteDescription,
      allowRegistration: enableRegistration,
      communityEnabled,
    }));
  } catch (err) {
    console.error('Get public config error:', err);
    return c.json(error('SERVER_ERROR', '获取配置失败'), 500);
  }
});

systemRoutes.get('/health', async (c) => {
  return c.json(success({
    status: 'ok',
    timestamp: Date.now(),
    version: c.env.APP_VERSION || '2.0.0',
  }));
});

systemRoutes.use('*', authMiddleware);

async function checkUrlReachability(url: string, timeoutMs = 10000): Promise<{
  status: string;
  available: boolean;
  responseTime: number;
  httpStatus: number | null;
  error: string | null;
}> {
  const startTime = Date.now();

  const headers: HeadersInit = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timer);
    const responseTime = Date.now() - startTime;
    const httpStatus = response.status;

    const reachableSet = new Set([200, 201, 204, 206, 301, 302, 303, 304, 307, 308, 400, 401, 403, 405, 406, 429]);
    const available = reachableSet.has(httpStatus) || (httpStatus >= 200 && httpStatus < 400);

    if (available) {
      const statusLabel = httpStatus >= 400 ? 'restricted' : 'online';
      return { status: statusLabel, available: true, responseTime, httpStatus, error: null };
    }

    return { status: 'error', available: false, responseTime, httpStatus, error: `HTTP ${httpStatus}` };
  } catch (err) {
    const responseTime = Date.now() - startTime;

    if (err instanceof Error) {
      if (err.name === 'AbortError' || err.message.includes('timeout')) {
        return { status: 'timeout', available: false, responseTime, httpStatus: null, error: '请求超时' };
      }
      const msg = err.message.toLowerCase();
      if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('econnrefused')) {
        return { status: 'offline', available: false, responseTime, httpStatus: null, error: '网络不可达' };
      }
      return { status: 'offline', available: false, responseTime, httpStatus: null, error: err.message };
    }

    return { status: 'offline', available: false, responseTime, httpStatus: null, error: '未知错误' };
  }
}

function resolveCheckUrl(source: SearchSource): string {
  if (source.homepage_url && source.homepage_url.startsWith('http')) {
    return source.homepage_url;
  }
  const template = source.url_template || '';
  if (template.includes('{keyword}')) {
    return template.replace('{keyword}', encodeURIComponent('test'));
  }
  return template;
}

async function saveStatusCache(
  db: Env['DB'],
  sourceId: string,
  result: { status: string; available: boolean; responseTime: number; error: string | null },
  ttlMs = 5 * 60 * 1000
): Promise<void> {
  try {
    const cacheId = generateId();
    const now = Date.now();
    await db.prepare(`
      INSERT INTO source_status_cache
        (id, source_id, keyword, keyword_hash, status, available, content_match,
         response_time, quality_score, check_error, expires_at, created_at, last_accessed, access_count)
      VALUES (?, ?, 'health', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).bind(
      cacheId, sourceId,
      result.status, result.available ? 1 : 0, result.available ? 1 : 0,
      result.responseTime, result.available ? 100 : 0, result.error,
      now + ttlMs, now, now,
    ).run();
  } catch {
    // 忽略缓存写入失败
  }
}

systemRoutes.get('/source-status-check', async (c) => {
  const sourceId = c.req.query('sourceId');

  if (!sourceId) {
    return c.json(error('VALIDATION_ERROR', '请提供搜索源ID'), 400);
  }

  try {
    const cached = await c.env.DB.prepare(`
      SELECT * FROM source_status_cache
      WHERE source_id = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(sourceId, Date.now() - 5 * 60 * 1000).first<SourceStatusCache>();

    if (cached) {
      return c.json(success({
        status: cached.status, available: cached.available === 1,
        responseTime: cached.response_time, qualityScore: cached.quality_score,
        error: cached.check_error, cached: true,
      }));
    }

    const source = await c.env.DB.prepare(
      'SELECT * FROM search_sources WHERE id = ?'
    ).bind(sourceId).first<SearchSource>();

    if (!source) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    const checkUrl = resolveCheckUrl(source);
    if (!checkUrl) {
      return c.json(error('VALIDATION_ERROR', '该搜索源没有可检测的 URL'), 400);
    }

    const result = await checkUrlReachability(checkUrl, 10000);
    saveStatusCache(c.env.DB, sourceId, result).catch(() => {});

    return c.json(success({
      status: result.status, available: result.available,
      responseTime: result.responseTime, qualityScore: result.available ? 100 : 0,
      error: result.error, cached: false, checkedUrl: checkUrl,
    }));
  } catch (err) {
    console.error('Source status check error:', err);
    return c.json(error('SERVER_ERROR', '状态检查失败'), 500);
  }
});

systemRoutes.post('/source-status-batch', async (c) => {
  try {
    const body = await c.req.json();
    const { sourceIds } = body;

    if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return c.json(error('VALIDATION_ERROR', '请提供搜索源ID列表'), 400);
    }

    if (sourceIds.length > 30) {
      return c.json(error('VALIDATION_ERROR', '单次最多检查30个搜索源'), 400);
    }

    const sources = await c.env.DB.prepare(
      `SELECT id, name, url_template, homepage_url FROM search_sources
       WHERE id IN (${sourceIds.map(() => '?').join(',')}) AND is_active = 1`
    ).bind(...sourceIds).all<{ id: string; name: string; url_template: string; homepage_url: string | null }>();

    const sourceMap = new Map(sources.results.map(s => [s.id, s]));

    const TTL = 5 * 60 * 1000;
    const cachedRows = await c.env.DB.prepare(
      `SELECT source_id, status, available, response_time, check_error
       FROM source_status_cache
       WHERE source_id IN (${sourceIds.map(() => '?').join(',')}) AND created_at > ?
       ORDER BY created_at DESC`
    ).bind(...sourceIds, Date.now() - TTL).all<{
      source_id: string; status: string; available: number; response_time: number; check_error: string | null;
    }>();

    const cacheMap = new Map<string, typeof cachedRows.results[0]>();
    for (const row of (cachedRows.results || [])) {
      if (!cacheMap.has(row.source_id)) cacheMap.set(row.source_id, row);
    }

    const toCheck = sourceIds.filter(id => !cacheMap.has(id) && sourceMap.has(id));

    const freshResults = await Promise.all(
      toCheck.map(async (sourceId) => {
        const source = sourceMap.get(sourceId)!;
        const checkUrl = resolveCheckUrl(source as unknown as SearchSource);

        if (!checkUrl) {
          return { sourceId, sourceName: source.name, status: 'unknown', available: false, responseTime: 0, error: '无可用 URL', cached: false };
        }

        const result = await checkUrlReachability(checkUrl, 9000);
        saveStatusCache(c.env.DB, sourceId, result).catch(() => {});

        return { sourceId, sourceName: source.name, status: result.status, available: result.available, responseTime: result.responseTime, error: result.error, cached: false };
      })
    );

    const results = sourceIds.map(sourceId => {
      const source = sourceMap.get(sourceId);
      if (!source) {
        return { sourceId, sourceName: '未知', status: 'not_found', available: false, responseTime: 0, error: '搜索源不存在', cached: false };
      }

      const cached = cacheMap.get(sourceId);
      if (cached) {
        return { sourceId, sourceName: source.name, status: cached.status, available: cached.available === 1, responseTime: cached.response_time, error: cached.check_error, cached: true };
      }

      return freshResults.find(r => r.sourceId === sourceId) ?? { sourceId, sourceName: source.name, status: 'unknown', available: false, responseTime: 0, error: '检查失败', cached: false };
    });

    const availableCount = results.filter(r => r.available).length;

    return c.json(success({
      results, checkedAt: Date.now(),
      summary: { total: results.length, available: availableCount, unavailable: results.length - availableCount },
    }));
  } catch (err) {
    console.error('Batch source status check error:', err);
    return c.json(error('SERVER_ERROR', '批量检查失败'), 500);
  }
});

systemRoutes.post('/record-action', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { action, data } = body;

    if (!action) {
      return c.json(error('VALIDATION_ERROR', '请提供行为类型'), 400);
    }

    const actionId = generateId();
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || c.req.header('CF-Connecting-IP') || null;
    const userAgent = c.req.header('User-Agent') || null;

    await c.env.DB.prepare(`
      INSERT INTO user_actions (id, user_id, action, data, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(actionId, user.userId, action, JSON.stringify(data || {}), ip, userAgent, Date.now()).run();

    return c.json(success({ id: actionId }, '行为已记录'));
  } catch (err) {
    console.error('Record action error:', err);
    return c.json(error('SERVER_ERROR', '记录失败'), 500);
  }
});

systemRoutes.get('/stats', async (c) => {
  try {
    const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').first<{ count: number }>();
    const sourceCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM search_sources WHERE is_active = 1').first<{ count: number }>();
    const searchCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM user_search_history').first<{ count: number }>();

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    const thisWeekActiveUsers = await c.env.DB.prepare('SELECT COUNT(DISTINCT user_id) as count FROM user_search_history WHERE created_at >= ?').bind(oneWeekAgo).first<{ count: number }>();
    const lastWeekActiveUsers = await c.env.DB.prepare('SELECT COUNT(DISTINCT user_id) as count FROM user_search_history WHERE created_at >= ? AND created_at < ?').bind(twoWeeksAgo, oneWeekAgo).first<{ count: number }>();

    const thisWeekActive = thisWeekActiveUsers?.count || 0;
    const lastWeekActive = lastWeekActiveUsers?.count || 0;
    let activeUsersGrowthPercent = 0;
    if (lastWeekActive > 0) {
      activeUsersGrowthPercent = Math.round(((thisWeekActive - lastWeekActive) / lastWeekActive) * 100);
    } else if (thisWeekActive > 0) {
      activeUsersGrowthPercent = 100;
    }

    return c.json(success({ users: userCount?.count || 0, sources: sourceCount?.count || 0, searches: searchCount?.count || 0, activeUsers: thisWeekActive, activeUsersGrowthPercent }));
  } catch (err) {
    console.error('Get stats error:', err);
    return c.json(error('SERVER_ERROR', '获取统计失败'), 500);
  }
});

systemRoutes.get('/source-status-history/:sourceId', async (c) => {
  const sourceId = c.req.param('sourceId');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const hours = parseInt(c.req.query('hours') || '24', 10);

  try {
    const history = await c.env.DB.prepare(`
      SELECT * FROM source_status_cache
      WHERE source_id = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT ?
    `).bind(sourceId, Date.now() - hours * 60 * 60 * 1000, limit).all<SourceStatusCache>();

    const source = await c.env.DB.prepare('SELECT id, name, url_template FROM search_sources WHERE id = ?').bind(sourceId).first();

    if (!source) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    const results = history.results || [];
    const availableCount = results.filter(r => r.available === 1).length;
    const avgResponseTime = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + (r.response_time || 0), 0) / results.length) : 0;

    const formattedHistory = results.map(r => ({
      status: r.status,
      available: r.available === 1,
      responseTime: r.response_time,
      checkedAt: new Date(r.created_at).toISOString(),
      error: r.check_error,
    }));

    return c.json(success({
      source,
      history: formattedHistory,
      summary: {
        totalChecks: results.length,
        availableCount,
        unavailableCount: results.length - availableCount,
        availabilityRate: results.length > 0 ? Math.round((availableCount / results.length) * 100) : 0,
        avgResponseTime,
        lastChecked: results.length > 0 ? new Date(results[0].created_at).toISOString() : null,
      },
    }));
  } catch (err) {
    console.error('Get source status history error:', err);
    return c.json(error('SERVER_ERROR', '获取状态历史失败'), 500);
  }
});

systemRoutes.get('/source-status-batch', async (c) => {
  const sourceIds = c.req.query('sourceIds');

  if (!sourceIds) {
    return c.json(error('VALIDATION_ERROR', '请提供搜索源ID列表'), 400);
  }

  const ids = sourceIds.split(',').filter(Boolean);

  if (ids.length === 0) {
    return c.json(error('VALIDATION_ERROR', '搜索源ID列表为空'), 400);
  }

  if (ids.length > 50) {
    return c.json(error('VALIDATION_ERROR', '最多同时查询50个搜索源的缓存状态'), 400);
  }

  try {
    const cachedRows = await c.env.DB.prepare(
      `SELECT source_id, status, available, response_time, check_error, created_at
       FROM source_status_cache
       WHERE source_id IN (${ids.map(() => '?').join(',')})
       ORDER BY created_at DESC`
    ).bind(...ids).all<{
      source_id: string; status: string; available: number; response_time: number; check_error: string | null; created_at: number;
    }>();

    const cacheMap = new Map<string, typeof cachedRows.results[0]>();
    for (const row of (cachedRows.results || [])) {
      if (!cacheMap.has(row.source_id)) cacheMap.set(row.source_id, row);
    }

    const results = ids.map(sourceId => {
      const cached = cacheMap.get(sourceId);
      if (cached) {
        return { sourceId, status: cached.status, available: cached.available === 1, responseTime: cached.response_time, cached: true, cacheAgeSeconds: Math.round((Date.now() - cached.created_at) / 1000), error: cached.check_error || undefined };
      }
      return { sourceId, status: 'unchecked', available: false, responseTime: 0, cached: false, cacheAgeSeconds: null, error: '尚未检查' };
    });

    return c.json(success({ results }));
  } catch (err) {
    console.error('Batch status cache query error:', err);
    return c.json(error('SERVER_ERROR', '批量查询失败'), 500);
  }
});

systemRoutes.delete('/source-status-cache/:sourceId', async (c) => {
  const sourceId = c.req.param('sourceId');

  try {
    await c.env.DB.prepare('DELETE FROM source_status_cache WHERE source_id = ?').bind(sourceId).run();
    return c.json(success(null, '缓存已清除'));
  } catch (err) {
    console.error('Clear status cache error:', err);
    return c.json(error('SERVER_ERROR', '清除缓存失败'), 500);
  }
});

systemRoutes.get('/user-actions', async (c) => {
  const user = c.get('user');
  const action = c.req.query('action');
  const limit = parseInt(c.req.query('limit') || '100', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let query = 'SELECT * FROM user_actions WHERE user_id = ?';
  const params: (string | number)[] = [user.userId];

  if (action) { query += ' AND action = ?'; params.push(action); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  try {
    const actions = await c.env.DB.prepare(query).bind(...params).all<UserAction>();

    let countQuery = 'SELECT COUNT(*) as count FROM user_actions WHERE user_id = ?';
    const countParams: string[] = [user.userId];
    if (action) { countQuery += ' AND action = ?'; countParams.push(action); }

    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<{ count: number }>();

    return c.json(success({ actions: actions.results || [], total: countResult?.count || 0, limit, offset }));
  } catch (err) {
    console.error('Get user actions error:', err);
    return c.json(error('SERVER_ERROR', '获取行为日志失败'), 500);
  }
});
