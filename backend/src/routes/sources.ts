/**
 * 搜索源管理路由
 * 功能：搜索源、分类、大类管理
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env, SearchSource, SearchSourceCategory, MajorCategory, UserSearchSourceConfig } from '@/types';
import { success, error, generateId } from '@/utils';
import { cached, invalidateCache } from '@/utils/cache';
import { authMiddleware, checkIsAdmin } from '@/middleware/auth';
import { VALIDATION_RULES } from '@/constants';
import { validateBody, schemas } from '@/validation';

const R = VALIDATION_RULES;

export const sourceRoutes = new Hono<{ Bindings: Env }>();

sourceRoutes.use('*', authMiddleware);

// 大类/分类属于低频变化的静态字典，列表读走 5 分钟进程内缓存；
// 任一分类写操作成功后立即失效，保证管理端改动即时可见。
sourceRoutes.use('*', async (c, next) => {
  await next();
  if (c.req.method !== 'GET' && c.req.path.includes('categories') && c.res.status < 400) {
    invalidateCache('sources:dict');
  }
});

// 不再使用本地 checkAdminRole 函数，改用从 middleware/auth.ts 导入的 checkIsAdmin/checkIsSuperAdmin

sourceRoutes.get('/major-categories', async (c) => {
  try {
    const categories = await cached('sources:dict:major', 5 * 60_000, async () => {
      const rows = await c.env.DB.prepare(
        'SELECT * FROM search_major_categories WHERE is_active = 1 ORDER BY display_order ASC'
      ).all<MajorCategory>();
      return rows.results || [];
    });

    return c.json(success({
      categories,
    }));
  } catch (err) {
    console.error('Get major categories error:', err);
    return c.json(error('SERVER_ERROR', '获取主分类失败'), 500);
  }
});

sourceRoutes.get('/major-categories/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const category = await c.env.DB.prepare(
      'SELECT * FROM search_major_categories WHERE id = ? AND is_active = 1'
    ).bind(id).first<MajorCategory>();

    if (!category) {
      return c.json(error('NOT_FOUND', '大类不存在'), 404);
    }

    return c.json(success({ category }));
  } catch (err) {
    console.error('Get major category error:', err);
    return c.json(error('SERVER_ERROR', '获取大类失败'), 500);
  }
});

sourceRoutes.get('/categories', async (c) => {
  try {
    const majorCategoryId = c.req.query('majorCategoryId');
    
    let query = `
      SELECT c.*, mc.name as major_category_name 
      FROM search_source_categories c 
      LEFT JOIN search_major_categories mc ON c.major_category_id = mc.id 
      WHERE c.is_active = 1
    `;
    const params: string[] = [];
    
    if (majorCategoryId) {
      query += ' AND c.major_category_id = ?';
      params.push(majorCategoryId);
    }
    
    query += ' ORDER BY c.display_order ASC';
    
    const categories = await cached(`sources:dict:categories:${majorCategoryId || 'all'}`, 5 * 60_000, async () => {
      const rows = params.length > 0
        ? await c.env.DB.prepare(query).bind(...params).all<SearchSourceCategory & { major_category_name: string }>()
        : await c.env.DB.prepare(query).all<SearchSourceCategory & { major_category_name: string }>();
      return rows.results || [];
    });

    return c.json(success({
      categories,
    }));
  } catch (err) {
    console.error('Get categories error:', err);
    return c.json(error('SERVER_ERROR', '获取分类失败'), 500);
  }
});

sourceRoutes.get('/categories/:id', async (c) => {
  const categoryId = c.req.param('id');

  try {
    const category = await c.env.DB.prepare(
      'SELECT * FROM search_source_categories WHERE id = ? AND is_active = 1'
    ).bind(categoryId).first<SearchSourceCategory>();

    if (!category) {
      return c.json(error('NOT_FOUND', '分类不存在'), 404);
    }

    return c.json(success({ category }));
  } catch (err) {
    console.error('Get category error:', err);
    return c.json(error('SERVER_ERROR', '获取分类失败'), 500);
  }
});

sourceRoutes.get('/', async (c) => {
  const user = c.get('user');
  
  try {
    const categoryId = c.req.query('categoryId');
    const searchable = c.req.query('searchable');
    const siteType = c.req.query('siteType');
    
    let query = 'SELECT * FROM search_sources WHERE is_active = 1 AND (is_system = 1 OR created_by = ?)';
    const params: (string | number)[] = [user.userId];
    
    if (categoryId) {
      query += ' AND category_id = ?';
      params.push(categoryId);
    }
    
    if (searchable !== undefined) {
      query += ' AND searchable = ?';
      params.push(searchable === 'true' ? 1 : 0);
    }
    
    if (siteType) {
      query += ' AND site_type = ?';
      params.push(siteType);
    }
    
    query += ' ORDER BY search_priority DESC, display_order ASC';
    
    const sources = await c.env.DB.prepare(query).bind(...params).all<SearchSource>();

    return c.json(success({
      sources: sources.results || [],
    }));
  } catch (err) {
    console.error('Get sources error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索源失败'), 500);
  }
});

sourceRoutes.get('/popular', async (c) => {
  const user = c.get('user');
  
  try {
    const limit = parseInt(c.req.query('limit') || String(R.PAGINATION.DEFAULT_PAGE_SIZE), 10);
    
    const sources = await c.env.DB.prepare(`
      SELECT * FROM search_sources 
      WHERE is_active = 1 AND searchable = 1 AND (is_system = 1 OR created_by = ?)
      ORDER BY usage_count DESC, search_priority DESC 
      LIMIT ?
    `).bind(user.userId, limit).all<SearchSource>();

    return c.json(success({
      sources: sources.results || [],
    }));
  } catch (err) {
    console.error('Get popular sources error:', err);
    return c.json(error('SERVER_ERROR', '获取热门搜索源失败'), 500);
  }
});

sourceRoutes.get('/search', async (c) => {
  const user = c.get('user');
  const keyword = c.req.query('keyword');

  if (!keyword) {
    return c.json(error('VALIDATION_ERROR', '请提供搜索关键词'), 400);
  }

  try {
    const sources = await c.env.DB.prepare(`
      SELECT * FROM search_sources 
      WHERE is_active = 1 AND searchable = 1 AND (is_system = 1 OR created_by = ?)
      AND (name LIKE ? OR description LIKE ? OR subtitle LIKE ?)
      ORDER BY search_priority DESC, usage_count DESC
      LIMIT 20
    `).bind(user.userId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`).all<SearchSource>();

    return c.json(success({
      sources: sources.results || [],
    }));
  } catch (err) {
    console.error('Search sources error:', err);
    return c.json(error('SERVER_ERROR', '搜索失败'), 500);
  }
});

sourceRoutes.get('/stats', async (c) => {
  const user = c.get('user');
  
  try {
    // 8 条统计查询合并为 1 个 db.batch 往返；总量与可搜索数合并为一次聚合。
    const [
      totalsResult,
      enabledResult,
      availableResult,
      categoryCountsResult,
      topUsedSources,
      sourcesByCategory,
      sourcesBySiteType,
    ] = (await c.env.DB.batch([
      c.env.DB.prepare(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN searchable = 1 THEN 1 ELSE 0 END), 0) AS searchable
      FROM search_sources
      WHERE is_active = 1 AND (is_system = 1 OR created_by = ?)
    `).bind(user.userId),

    // 启用语义：无配置行 = 启用，仅 is_enabled = 0 才禁用
      c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM search_sources s
      LEFT JOIN user_search_source_configs u ON u.source_id = s.id AND u.user_id = ?
      WHERE s.is_active = 1
        AND (s.is_system = 1 OR s.created_by = ?)
        AND (u.is_enabled IS NULL OR u.is_enabled = 1)
    `).bind(user.userId, user.userId),

    // 可用性取最近一次探测结果（idx_status_cache_source_created 支撑取最新，不再临时排序）
      c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM search_sources s
      LEFT JOIN source_status_cache sc ON sc.id = (
        SELECT id FROM source_status_cache WHERE source_id = s.id ORDER BY created_at DESC LIMIT 1
      )
      WHERE s.is_active = 1
        AND (s.is_system = 1 OR s.created_by = ?)
        AND sc.available = 1
    `).bind(user.userId),

      c.env.DB.prepare(`
        SELECT (SELECT COUNT(*) FROM search_source_categories WHERE is_active = 1) AS totalCategories,
               (SELECT COUNT(*) FROM search_major_categories WHERE is_active = 1) AS totalMajorCategories
      `),

      c.env.DB.prepare(`
      SELECT id, name, usage_count 
      FROM search_sources 
      WHERE is_active = 1 AND (is_system = 1 OR created_by = ?)
      ORDER BY usage_count DESC 
      LIMIT 10
    `).bind(user.userId),

      c.env.DB.prepare(`
      SELECT c.name as category_name, COUNT(s.id) as source_count
      FROM search_source_categories c
      LEFT JOIN search_sources s ON c.id = s.category_id AND s.is_active = 1 AND (s.is_system = 1 OR s.created_by = ?)
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY source_count DESC
    `).bind(user.userId),

      c.env.DB.prepare(`
      SELECT site_type, COUNT(*) as count
      FROM search_sources
      WHERE is_active = 1 AND (is_system = 1 OR created_by = ?)
      GROUP BY site_type
    `).bind(user.userId),
    ])) as unknown as [
      { results: Array<{ total: number; searchable: number }> },
      { results: Array<{ count: number }> },
      { results: Array<{ count: number }> },
      { results: Array<{ totalCategories: number; totalMajorCategories: number }> },
      { results: Array<{ id: string; name: string; usage_count: number }> },
      { results: Array<{ category_name: string; source_count: number }> },
      { results: Array<{ site_type: string; count: number }> },
    ];

    const totals = totalsResult.results?.[0];
    const categoryCounts = categoryCountsResult.results?.[0];

    return c.json(success({
      totalSources: totals?.total || 0,
      searchableSources: totals?.searchable || 0,
      enabledSources: enabledResult.results?.[0]?.count || 0,
      availableSources: availableResult.results?.[0]?.count || 0,
      totalCategories: categoryCounts?.totalCategories || 0,
      totalMajorCategories: categoryCounts?.totalMajorCategories || 0,
      topUsedSources: topUsedSources.results || [],
      sourcesByCategory: sourcesByCategory.results || [],
      sourcesBySiteType: sourcesBySiteType.results || [],
    }));
  } catch (err) {
    console.error('Get sources stats error:', err);
    return c.json(error('SERVER_ERROR', '获取统计失败'), 500);
  }
});

sourceRoutes.get('/export', async (c) => {
  const user = c.get('user');
  
  try {
    const format = c.req.query('format') || 'json';
    const categoryId = c.req.query('categoryId');

    let query = `
      SELECT s.*, c.name as category_name, mc.name as major_category_name
      FROM search_sources s
      LEFT JOIN search_source_categories c ON s.category_id = c.id
      LEFT JOIN search_major_categories mc ON c.major_category_id = mc.id
      WHERE s.is_active = 1 AND (s.is_system = 1 OR s.created_by = ?)
    `;
    const params: string[] = [user.userId];

    if (categoryId) {
      query += ' AND s.category_id = ?';
      params.push(categoryId);
    }

    query += ' ORDER BY s.search_priority DESC, s.display_order ASC';

    const sources = await c.env.DB.prepare(query).bind(...params).all<SearchSource & { category_name: string; major_category_name: string }>();

    const sourcesList = sources.results || [];

    if (format === 'csv') {
      const headers = ['ID', '名称', '副标题', 'URL模板', '分类', '主分类', '站点类型', '搜索优先级', '使用次数', '是否可搜索'];
      const rows = sourcesList.map(s => [
        s.id,
        s.name,
        s.subtitle || '',
        s.url_template,
        s.category_name || '',
        s.major_category_name || '',
        s.site_type || 'web',
        s.search_priority.toString(),
        s.usage_count.toString(),
        s.searchable ? '是' : '否'
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n');

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="search-sources.csv"'
        }
      });
    }

    if (format === 'opml') {
      const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>CodeSeek 搜索源导出</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
  </head>
  <body>
${sourcesList.map(s => `    <outline type="link" text="${s.name}" htmlUrl="${s.url_template}" description="${s.subtitle || ''}" category="${s.category_name || ''}"/>`).join('\n')}
  </body>
</opml>`;

      return new Response(opml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': 'attachment; filename="search-sources.opml"'
        }
      });
    }

    return c.json(success({
      sources: sourcesList,
      exportedAt: Date.now(),
      count: sourcesList.length,
    }));
  } catch (err) {
    console.error('Export sources error:', err);
    return c.json(error('SERVER_ERROR', '导出失败'), 500);
  }
});

sourceRoutes.get('/user-configs/:userId', async (c) => {
  const userId = c.req.param('userId');
  const currentUser = c.get('user');

  const isAdmin = await checkIsAdmin(c);
  if (userId !== currentUser.userId && !isAdmin) {
    return c.json(error('FORBIDDEN', '无权访问他人配置'), 403);
  }

  try {
    const configs = await c.env.DB.prepare(
      'SELECT * FROM user_search_source_configs WHERE user_id = ?'
    ).bind(userId).all<UserSearchSourceConfig>();

    return c.json(success({
      configs: configs.results || [],
    }));
  } catch (err) {
    console.error('Get user configs error:', err);
    return c.json(error('SERVER_ERROR', '获取用户配置失败'), 500);
  }
});

sourceRoutes.get('/with-user-config/:userId', async (c) => {
  const requestedUserId = c.req.param('userId');
  const currentUser = c.get('user');

  const isAdmin = await checkIsAdmin(c);
  if (requestedUserId !== currentUser.userId && !isAdmin) {
    return c.json(error('FORBIDDEN', '无权访问他人配置'), 403);
  }

  try {
    const sources = await c.env.DB.prepare(
      'SELECT * FROM search_sources WHERE is_active = 1 AND (is_system = 1 OR created_by = ?) ORDER BY search_priority DESC, display_order ASC'
    ).bind(requestedUserId).all<SearchSource>();

    const userConfigs = await c.env.DB.prepare(
      'SELECT * FROM user_search_source_configs WHERE user_id = ?'
    ).bind(requestedUserId).all<UserSearchSourceConfig>();

    const configMap = new Map(
      (userConfigs.results || []).map(config => [config.source_id, config])
    );

    const sourcesWithConfig = (sources.results || []).map(source => ({
      ...source,
      userConfig: configMap.get(source.id) || null,
    }));

    return c.json(success({
      sources: sourcesWithConfig,
    }));
  } catch (err) {
    console.error('Get sources with user config error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索源失败'), 500);
  }
});

sourceRoutes.get('/export-user-configs/:userId', async (c) => {
  const userId = c.req.param('userId');
  const currentUser = c.get('user');

  const isAdmin = await checkIsAdmin(c);
  if (userId !== currentUser.userId && !isAdmin) {
    return c.json(error('FORBIDDEN', '无权访问他人配置'), 403);
  }

  try {
    const userConfigs = await c.env.DB.prepare(`
      SELECT u.*, s.name as source_name, s.url_template
      FROM user_search_source_configs u
      LEFT JOIN search_sources s ON u.source_id = s.id
      WHERE u.user_id = ?
    `).bind(userId).all<UserSearchSourceConfig & { source_name: string; url_template: string }>();

    const configsList = userConfigs.results || [];

    return c.json(success({
      configs: configsList,
      exportedAt: Date.now(),
      count: configsList.length,
    }));
  } catch (err) {
    console.error('Export user configs error:', err);
    return c.json(error('SERVER_ERROR', '导出失败'), 500);
  }
});

/**
 * 源看板目录：服务端筛选 + 分页
 * 返回源基础信息、分类路径名与当前用户配置；启用语义为「无配置行 = 启用」
 * 注意：必须注册在 /:id 之前，否则会被动态参数路由吞掉
 */
sourceRoutes.get('/catalog', async (c) => {
  const user = c.get('user');

  try {
    const keyword = (c.req.query('keyword') || '').trim();
    const majorCategoryId = c.req.query('majorCategoryId');
    const categoryId = c.req.query('categoryId');
    const siteType = c.req.query('siteType');
    const searchable = c.req.query('searchable');
    // 范围：all（默认）/ mine（我创建的）/ enabled（已启用）/ searchable（仅可搜索）
    const scope = c.req.query('scope') || 'all';
    // 排序：default（分类顺序）/ name（名称）/ usage（曝光热度）
    const sort = c.req.query('sort') || 'default';

    const pageSize = Math.min(
      Math.max(
        1,
        parseInt(c.req.query('pageSize') || String(R.PAGINATION.DEFAULT_PAGE_SIZE), 10)
          || R.PAGINATION.DEFAULT_PAGE_SIZE
      ),
      R.PAGINATION.MAX_PAGE_SIZE
    );
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const offset = (page - 1) * pageSize;

    const joins = `
      FROM search_sources s
      INNER JOIN search_source_categories c ON s.category_id = c.id
      LEFT JOIN search_major_categories mc ON c.major_category_id = mc.id
      LEFT JOIN user_search_source_configs u ON u.source_id = s.id AND u.user_id = ?
      WHERE s.is_active = 1 AND (s.is_system = 1 OR s.created_by = ?)
    `;
    const conditions: string[] = [];
    const params: (string | number)[] = [user.userId, user.userId];

    if (keyword) {
      conditions.push('(s.name LIKE ? OR s.subtitle LIKE ? OR s.description LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (majorCategoryId) {
      conditions.push('c.major_category_id = ?');
      params.push(majorCategoryId);
    }
    if (categoryId) {
      conditions.push('s.category_id = ?');
      params.push(categoryId);
    }
    if (siteType) {
      conditions.push('s.site_type = ?');
      params.push(siteType);
    }
    if (searchable !== undefined) {
      conditions.push('s.searchable = ?');
      params.push(searchable === 'true' ? 1 : 0);
    }
    if (scope === 'mine') {
      conditions.push('s.is_system = 0 AND s.created_by = ?');
      params.push(user.userId);
    } else if (scope === 'enabled') {
      conditions.push('(u.is_enabled IS NULL OR u.is_enabled = 1)');
    } else if (scope === 'searchable') {
      conditions.push('s.searchable = 1');
    }

    const whereClause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';

    const orderBy = sort === 'name'
      ? 's.name ASC'
      : sort === 'usage'
        ? 's.usage_count DESC, s.name ASC'
        : 'mc.display_order ASC, c.display_order ASC, s.search_priority DESC, s.display_order ASC';

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as count ${joins}${whereClause}`
    ).bind(...params).first<{ count: number }>();
    const total = countRow?.count || 0;

    const rows = await c.env.DB.prepare(`
      SELECT
        s.*,
        c.name AS category_name,
        c.icon AS category_icon,
        c.color AS category_color,
        c.major_category_id AS major_category_id,
        mc.name AS major_category_name,
        u.id AS config_id,
        u.is_enabled AS config_is_enabled,
        u.custom_priority AS config_custom_priority,
        u.custom_name AS config_custom_name,
        u.custom_subtitle AS config_custom_subtitle,
        u.custom_icon AS config_custom_icon,
        u.notes AS config_notes
      ${joins}${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, offset).all<SearchSource & {
      category_name: string;
      category_icon: string | null;
      category_color: string;
      major_category_id: string | null;
      major_category_name: string | null;
      config_id: string | null;
      config_is_enabled: number | null;
      config_custom_priority: number | null;
      config_custom_name: string | null;
      config_custom_subtitle: string | null;
      config_custom_icon: string | null;
      config_notes: string | null;
    }>();

    const items = (rows.results || []).map(row => {
      const {
        category_name,
        category_icon,
        category_color,
        major_category_id,
        major_category_name,
        config_id,
        config_is_enabled,
        config_custom_priority,
        config_custom_name,
        config_custom_subtitle,
        config_custom_icon,
        config_notes,
        ...source
      } = row;

      return {
        ...source,
        categoryName: category_name,
        categoryIcon: category_icon,
        categoryColor: category_color,
        majorCategoryId: major_category_id,
        majorCategoryName: major_category_name,
        // 无配置行视为启用，仅显式 is_enabled = 0 才禁用
        enabled: config_is_enabled !== 0,
        userConfig: config_id
          ? {
              id: config_id,
              user_id: user.userId,
              source_id: source.id,
              is_enabled: config_is_enabled ?? 1,
              custom_priority: config_custom_priority,
              custom_name: config_custom_name,
              custom_subtitle: config_custom_subtitle,
              custom_icon: config_custom_icon,
              notes: config_notes,
            }
          : null,
      };
    });

    return c.json(success({
      items,
      total,
      page,
      pageSize,
      hasMore: offset + items.length < total,
    }));
  } catch (err) {
    console.error('Get source catalog error:', err);
    return c.json(error('SERVER_ERROR', '获取源目录失败'), 500);
  }
});

sourceRoutes.get('/:id', async (c) => {
  const sourceId = c.req.param('id');
  const user = c.get('user');

  try {
    const source = await c.env.DB.prepare(`
      SELECT
        s.*,
        c.name AS category_name,
        c.icon AS category_icon,
        c.color AS category_color,
        c.major_category_id AS major_category_id,
        mc.name AS major_category_name
      FROM search_sources s
      LEFT JOIN search_source_categories c ON s.category_id = c.id
      LEFT JOIN search_major_categories mc ON c.major_category_id = mc.id
      WHERE s.id = ? AND s.is_active = 1
    `).bind(sourceId).first<SearchSource & {
      category_name: string | null;
      category_icon: string | null;
      category_color: string | null;
      major_category_id: string | null;
      major_category_name: string | null;
    }>();

    if (!source) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    // 自定义源仅本人/管理员可见，避免通过 id 探测他人私有源
    if (!source.is_system && source.created_by !== user.userId && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '无权访问此搜索源'), 403);
    }

    const userConfig = await c.env.DB.prepare(
      'SELECT * FROM user_search_source_configs WHERE user_id = ? AND source_id = ?'
    ).bind(user.userId, sourceId).first<UserSearchSourceConfig>();

    const statusCache = await c.env.DB.prepare(`
      SELECT status, available, response_time, check_error, created_at
      FROM source_status_cache
      WHERE source_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(sourceId).first<{
      status: string;
      available: number;
      response_time: number;
      check_error: string | null;
      created_at: number;
    }>();

    const {
      category_name,
      category_icon,
      category_color,
      major_category_id,
      major_category_name,
      ...sourceFields
    } = source;

    const categoryPath = [
      ...(major_category_id
        ? [{ id: major_category_id, name: major_category_name || '', type: 'major' as const }]
        : []),
      ...(source.category_id
        ? [{ id: source.category_id, name: category_name || '', type: 'category' as const }]
        : []),
    ];

    return c.json(success({
      source: {
        ...sourceFields,
        categoryName: category_name,
        categoryIcon: category_icon,
        categoryColor: category_color,
        majorCategoryId: major_category_id,
        majorCategoryName: major_category_name,
      },
      categoryPath,
      // 无配置行视为启用，仅显式 is_enabled = 0 才禁用
      enabled: userConfig ? userConfig.is_enabled !== 0 : true,
      userConfig: userConfig || null,
      status: statusCache
        ? {
            status: statusCache.status,
            available: statusCache.available === 1,
            responseTime: statusCache.response_time,
            error: statusCache.check_error,
            checkedAt: statusCache.created_at,
          }
        : null,
    }));
  } catch (err) {
    console.error('Get source error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索源失败'), 500);
  }
});

sourceRoutes.post('/:id/increment-usage', async (c) => {
  const sourceId = c.req.param('id');
  const user = c.get('user');

  try {
    const source = await c.env.DB.prepare(
      'SELECT id, is_system, created_by, is_active FROM search_sources WHERE id = ?'
    ).bind(sourceId).first<Pick<SearchSource, 'id' | 'is_system' | 'created_by' | 'is_active'>>();

    if (!source || !source.is_active) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    // 自定义源仅本人/管理员可累加，避免他人刷计数
    if (!source.is_system && source.created_by !== user.userId && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '无权操作此搜索源'), 403);
    }

    await c.env.DB.prepare(`
      UPDATE search_sources 
      SET usage_count = usage_count + 1, last_used_at = ? 
      WHERE id = ?
    `).bind(Date.now(), sourceId).run();

    return c.json(success(null, '使用次数已更新'));
  } catch (err) {
    console.error('Increment usage error:', err);
    return c.json(error('SERVER_ERROR', '更新失败'), 500);
  }
});

sourceRoutes.post('/major-categories', validateBody(schemas.sources.createMajorCategory), async (c) => {
  
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createMajorCategory>;
    const { name, description, icon, color } = body;

    if (name.trim().length === 0) {
      return c.json(error('VALIDATION_ERROR', '大类名称不能为空'), 400);
    }

    const existingCategory = await c.env.DB.prepare(
      'SELECT id FROM search_major_categories WHERE name = ?'
    ).bind(name.trim()).first();

    if (existingCategory) {
      return c.json(error('DUPLICATE_ERROR', '大类名称已存在'), 400);
    }

    const categoryId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(`
      INSERT INTO search_major_categories (
        id, name, description, icon, color,
      is_system, is_active, display_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, 1, 0, ?, ?)
    `).bind(
      categoryId,
      name.trim(),
      description?.trim() || '',
      icon?.trim() || '🌟',
      color?.trim() || '#6b7280',
      now,
      now
    ).run();

    return c.json(success({
      id: categoryId,
      name: name.trim(),
      description: description?.trim() || '',
      icon: icon?.trim() || '🌟',
      color: color?.trim() || '#6b7280',
      isSystem: false,
    }, '大类创建成功'));
  } catch (err) {
    console.error('Create major category error:', err);
    return c.json(error('SERVER_ERROR', '创建大类失败'), 500);
  }
});

sourceRoutes.post('/categories', validateBody(schemas.sources.createCategory), async (c) => {
  
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createCategory>;
    const {
      majorCategoryId,
      name,
      description,
      icon,
      color,
      defaultSearchable,
      defaultSiteType,
      searchPriority
    } = body;

    if (name.trim().length === 0) {
      return c.json(error('VALIDATION_ERROR', '分类名称不能为空'), 400);
    }

    const majorCategory = await c.env.DB.prepare(
      'SELECT id FROM search_major_categories WHERE id = ? AND is_active = 1'
    ).bind(majorCategoryId).first();

    if (!majorCategory) {
      return c.json(error('NOT_FOUND', '大类不存在'), 404);
    }

    const categoryId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(`
      INSERT INTO search_source_categories (
        id, major_category_id, name, description, icon, color,
        default_searchable, default_site_type, search_priority,
        is_system, is_active, display_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?, ?)
    `).bind(
      categoryId,
      majorCategoryId.trim(),
      name.trim(),
      description?.trim() || '',
      icon?.trim() || '📁',
      color?.trim() || '#3b82f6',
      defaultSearchable !== false ? 1 : 0,
      defaultSiteType || 'search',
      Math.min(Math.max(searchPriority || 5, 1), 10),
      now,
      now
    ).run();

    return c.json(success({
      id: categoryId,
      majorCategoryId: majorCategoryId.trim(),
      name: name.trim(),
      description: description?.trim() || '',
      icon: icon?.trim() || '📁',
      color: color?.trim() || '#3b82f6',
      defaultSearchable: defaultSearchable !== false,
      defaultSiteType: defaultSiteType || 'search',
      searchPriority: Math.min(Math.max(searchPriority || 5, 1), 10),
      isSystem: false,
    }, '分类创建成功'));
  } catch (err) {
    console.error('Create category error:', err);
    return c.json(error('SERVER_ERROR', '创建分类失败'), 500);
  }
});

sourceRoutes.put('/categories/:id', validateBody(schemas.sources.updateCategory), async (c) => {
  const categoryId = c.req.param('id');

  try {
    const existingCategory = await c.env.DB.prepare(
      'SELECT * FROM search_source_categories WHERE id = ?'
    ).bind(categoryId).first<SearchSourceCategory>();

    if (!existingCategory) {
      return c.json(error('NOT_FOUND', '分类不存在'), 404);
    }

    if (existingCategory.is_system && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '系统分类仅管理员可修改'), 403);
    }

    const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateCategory> & Record<string, unknown>;
    const updates: string[] = [];
    const params: (string | number)[] = [];

    const allowedFields = [
      'name', 'description', 'icon', 'color',
      'defaultSearchable', 'defaultSiteType', 'searchPriority'
    ];

    allowedFields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(body, field)) return;
      const value = body[field];
      if (field === 'searchPriority') {
        updates.push('search_priority = ?');
        params.push(Math.min(Math.max(Number(value) || 5, 1), 10));
      } else if (field === 'defaultSearchable') {
        updates.push('default_searchable = ?');
        params.push(value ? 1 : 0);
      } else if (typeof value === 'string') {
        updates.push(`${field === 'defaultSiteType' ? 'default_site_type' : field} = ?`);
        params.push(value.trim());
      }
    });

    if (updates.length === 0) {
      return c.json(error('VALIDATION_ERROR', '没有提供要更新的数据'), 400);
    }

    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(categoryId);

    await c.env.DB.prepare(`
      UPDATE search_source_categories 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...params).run();

    return c.json(success(null, '分类更新成功'));
  } catch (err) {
    console.error('Update category error:', err);
    return c.json(error('SERVER_ERROR', '更新分类失败'), 500);
  }
});

sourceRoutes.delete('/categories/:id', async (c) => {
  const categoryId = c.req.param('id');

  try {
    const existingCategory = await c.env.DB.prepare(
      'SELECT * FROM search_source_categories WHERE id = ?'
    ).bind(categoryId).first<SearchSourceCategory>();

    if (!existingCategory) {
      return c.json(error('NOT_FOUND', '分类不存在'), 404);
    }

    if (existingCategory.is_system && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '系统分类仅管理员可删除'), 403);
    }

    const sourceCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM search_sources WHERE category_id = ? AND is_active = 1'
    ).bind(categoryId).first<{ count: number }>();

    if (sourceCount && sourceCount.count > 0) {
      return c.json(error('VALIDATION_ERROR', '该分类下还有搜索源，无法删除'), 400);
    }

    await c.env.DB.prepare(
      'UPDATE search_source_categories SET is_active = 0, updated_at = ? WHERE id = ?'
    ).bind(Date.now(), categoryId).run();

    return c.json(success(null, '分类已删除'));
  } catch (err) {
    console.error('Delete category error:', err);
    return c.json(error('SERVER_ERROR', '删除分类失败'), 500);
  }
});

sourceRoutes.post('/', validateBody(schemas.sources.createSource), async (c) => {
  const user = c.get('user');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createSource>;
    const {
      categoryId,
      name,
      subtitle,
      description,
      icon,
      urlTemplate,
      homepageUrl,
      searchable,
      searchPriority
    } = body;

    if (name.trim().length === 0) {
      return c.json(error('VALIDATION_ERROR', '搜索源名称不能为空'), 400);
    }

    const category = await c.env.DB.prepare(
      'SELECT id, default_site_type FROM search_source_categories WHERE id = ? AND is_active = 1'
    ).bind(categoryId).first<{ id: string; default_site_type: string }>();

    if (!category) {
      return c.json(error('NOT_FOUND', '分类不存在'), 404);
    }

    const sourceId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(`
      INSERT INTO search_sources (
        id, category_id, name, subtitle, description, icon, url_template,
        homepage_url, site_type, searchable, search_priority,
        is_system, is_active, display_order, usage_count, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 999, 0, ?, ?, ?)
    `).bind(
      sourceId,
      categoryId.trim(),
      name.trim(),
      subtitle?.trim() || null,
      description?.trim() || null,
      icon?.trim() || '🔍',
      urlTemplate.trim(),
      homepageUrl?.trim() || null,
      category.default_site_type || 'search',
      searchable !== false ? 1 : 0,
      Math.min(Math.max(searchPriority || 5, 1), 10),
      user.userId,
      now,
      now
    ).run();

    return c.json(success({
      id: sourceId,
      categoryId: categoryId.trim(),
      name: name.trim(),
      subtitle: subtitle?.trim() || null,
      description: description?.trim() || null,
      icon: icon?.trim() || '🔍',
      urlTemplate: urlTemplate.trim(),
      homepageUrl: homepageUrl?.trim() || null,
      siteType: category.default_site_type || 'search',
      searchable: searchable !== false,
      searchPriority: Math.min(Math.max(searchPriority || 5, 1), 10),
    }, '搜索源创建成功'));
  } catch (err) {
    console.error('Create source error:', err);
    return c.json(error('SERVER_ERROR', '创建搜索源失败'), 500);
  }
});

sourceRoutes.put('/major-categories/:id', validateBody(schemas.sources.updateMajorCategory), async (c) => {
  
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const categoryId = c.req.param('id');

  try {
    const existingCategory = await c.env.DB.prepare(
      'SELECT * FROM search_major_categories WHERE id = ?'
    ).bind(categoryId).first<MajorCategory>();

    if (!existingCategory) {
      return c.json(error('NOT_FOUND', '大类不存在'), 404);
    }

    if (existingCategory.is_system && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '系统大类仅管理员可修改'), 403);
    }

    const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateMajorCategory>;
    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (body.name !== undefined) {
      const trimmedName = body.name.trim();
      if (trimmedName.length < 1 || trimmedName.length > 30) {
        return c.json(error('VALIDATION_ERROR', '大类名称长度必须在1-30个字符之间'), 400);
      }

      const duplicateCategory = await c.env.DB.prepare(
        'SELECT id FROM search_major_categories WHERE LOWER(name) = LOWER(?) AND id != ?'
      ).bind(trimmedName, categoryId).first();

      if (duplicateCategory) {
        return c.json(error('DUPLICATE_ERROR', '大类名称已存在'), 400);
      }

      updates.push('name = ?');
      params.push(trimmedName);
    }

    if (body.description !== undefined) {
      updates.push('description = ?');
      params.push(body.description?.trim() || '');
    }

    if (body.icon !== undefined) {
      updates.push('icon = ?');
      params.push(body.icon?.trim() || '🌟');
    }

    if (body.color !== undefined) {
      updates.push('color = ?');
      params.push(body.color);
    }

    if (body.displayOrder !== undefined) {
      updates.push('display_order = ?');
      params.push(Math.max(0, body.displayOrder || 0));
    }

    if (body.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(body.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return c.json(error('VALIDATION_ERROR', '没有需要更新的内容'), 400);
    }

    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(categoryId);

    await c.env.DB.prepare(
      `UPDATE search_major_categories SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    return c.json(success({
      categoryId,
      updatedFields: Object.keys(body).filter(key =>
        ['name', 'description', 'icon', 'color', 'displayOrder', 'isActive'].includes(key)
      )
    }, '大类更新成功'));
  } catch (err) {
    console.error('Update major category error:', err);
    return c.json(error('SERVER_ERROR', '更新大类失败'), 500);
  }
});

sourceRoutes.delete('/major-categories/:id', async (c) => {
  
  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  const categoryId = c.req.param('id');

  try {
    const existingCategory = await c.env.DB.prepare(
      'SELECT * FROM search_major_categories WHERE id = ?'
    ).bind(categoryId).first<MajorCategory>();

    if (!existingCategory) {
      return c.json(error('NOT_FOUND', '大类不存在'), 404);
    }

    if (existingCategory.is_system && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '系统大类仅管理员可删除'), 403);
    }

    const categoryCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM search_source_categories WHERE major_category_id = ? AND is_active = 1'
    ).bind(categoryId).first<{ count: number }>();

    if (categoryCount && categoryCount.count > 0) {
      return c.json(error('VALIDATION_ERROR', '该大类下还有分类，无法删除'), 400);
    }

    await c.env.DB.prepare(
      'UPDATE search_major_categories SET is_active = 0, updated_at = ? WHERE id = ?'
    ).bind(Date.now(), categoryId).run();

    return c.json(success({ deletedId: categoryId }, '大类已删除'));
  } catch (err) {
    console.error('Delete major category error:', err);
    return c.json(error('SERVER_ERROR', '删除大类失败'), 500);
  }
});

sourceRoutes.delete('/user-configs/:sourceId', async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('sourceId');

  try {
    const result = await c.env.DB.prepare(
      'DELETE FROM user_search_source_configs WHERE user_id = ? AND source_id = ?'
    ).bind(user.userId, sourceId).run();

    if (!result.success || result.meta.changes === 0) {
      return c.json(error('NOT_FOUND', '配置不存在'), 404);
    }

    return c.json(success(null, '配置已删除'));
  } catch (err) {
    console.error('Delete user config error:', err);
    return c.json(error('SERVER_ERROR', '删除配置失败'), 500);
  }
});

sourceRoutes.put('/:id', validateBody(schemas.sources.updateSource), async (c) => {
  const sourceId = c.req.param('id');
  const user = c.get('user');

  try {
    const existingSource = await c.env.DB.prepare(
      'SELECT * FROM search_sources WHERE id = ?'
    ).bind(sourceId).first<SearchSource>();

    if (!existingSource) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    if (existingSource.is_system && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '系统搜索源仅管理员可修改'), 403);
    }

    // 非系统源仅创建者或管理员可修改
    if (!existingSource.is_system && existingSource.created_by !== user.userId && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '无权修改他人搜索源'), 403);
    }

    const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateSource> & Record<string, unknown>;
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    const allowedFields = [
      'categoryId', 'name', 'subtitle', 'description', 'icon',
      'urlTemplate', 'homepageUrl', 'searchable',
      'searchPriority'
    ];

    const fieldMapping: Record<string, string> = {
      categoryId: 'category_id',
      urlTemplate: 'url_template',
      homepageUrl: 'homepage_url',
      searchPriority: 'search_priority'
    };

    allowedFields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(body, field)) return;
      const dbField = fieldMapping[field] || field;
      const value = body[field];
      if (field === 'searchPriority') {
        updates.push(`${dbField} = ?`);
        params.push(Math.min(Math.max(Number(value) || 5, 1), 10));
      } else if (field === 'searchable') {
        updates.push(`${dbField} = ?`);
        params.push(value ? 1 : 0);
      } else if (typeof value === 'string') {
        updates.push(`${dbField} = ?`);
        params.push(value.trim());
      } else if (value === null) {
        updates.push(`${dbField} = ?`);
        params.push(null);
      }
    });

    if (updates.length === 0) {
      return c.json(error('VALIDATION_ERROR', '没有提供要更新的数据'), 400);
    }

    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(sourceId);

    await c.env.DB.prepare(`
      UPDATE search_sources 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...params).run();

    return c.json(success(null, '搜索源更新成功'));
  } catch (err) {
    console.error('Update source error:', err);
    return c.json(error('SERVER_ERROR', '更新搜索源失败'), 500);
  }
});

sourceRoutes.delete('/:id', async (c) => {
  const sourceId = c.req.param('id');
  const user = c.get('user');

  try {
    const existingSource = await c.env.DB.prepare(
      'SELECT * FROM search_sources WHERE id = ?'
    ).bind(sourceId).first<SearchSource>();

    if (!existingSource) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    if (existingSource.is_system && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '系统搜索源仅管理员可删除'), 403);
    }

    // 非系统源仅创建者或管理员可删除
    if (!existingSource.is_system && existingSource.created_by !== user.userId && !await checkIsAdmin(c)) {
      return c.json(error('FORBIDDEN', '无权删除他人搜索源'), 403);
    }

    await c.env.DB.prepare(
      'UPDATE search_sources SET is_active = 0, updated_at = ? WHERE id = ?'
    ).bind(Date.now(), sourceId).run();

    await c.env.DB.prepare(
      'DELETE FROM user_search_source_configs WHERE source_id = ?'
    ).bind(sourceId).run();

    return c.json(success(null, '搜索源已删除'));
  } catch (err) {
    console.error('Delete source error:', err);
    return c.json(error('SERVER_ERROR', '删除搜索源失败'), 500);
  }
});

sourceRoutes.post('/user-configs/batch', validateBody(schemas.sources.batchUpdateUserConfigs), async (c) => {
  const user = c.get('user');

  try {
    const body = c.get('validatedBody') as z.infer<typeof schemas.sources.batchUpdateUserConfigs>;
    const { configs } = body;

    const now = Date.now();
    let updatedCount = 0;

    for (const config of configs) {
      const existingConfig = await c.env.DB.prepare(
        'SELECT id FROM user_search_source_configs WHERE user_id = ? AND source_id = ?'
      ).bind(user.userId, config.sourceId).first<{ id: string }>();

      if (existingConfig) {
        // 局部更新：只写入请求中出现的字段，避免批量启停时清空用户自定义名称/备注
        const updates: string[] = [];
        const params: (string | number | null)[] = [];

        if (config.isEnabled !== undefined) {
          updates.push('is_enabled = ?');
          params.push(config.isEnabled ? 1 : 0);
        }
        if (config.customPriority !== undefined) {
          updates.push('custom_priority = ?');
          params.push(
            config.customPriority === null
              ? null
              : Math.min(Math.max(config.customPriority, 1), 10)
          );
        }
        if (config.customName !== undefined) {
          updates.push('custom_name = ?');
          params.push(config.customName?.trim() || null);
        }
        if (config.customSubtitle !== undefined) {
          updates.push('custom_subtitle = ?');
          params.push(config.customSubtitle?.trim() || null);
        }
        if (config.customIcon !== undefined) {
          updates.push('custom_icon = ?');
          params.push(config.customIcon?.trim() || null);
        }
        if (config.notes !== undefined) {
          updates.push('notes = ?');
          params.push(config.notes?.trim() || null);
        }

        if (updates.length > 0) {
          updates.push('updated_at = ?');
          params.push(now, existingConfig.id);
          await c.env.DB.prepare(`
            UPDATE user_search_source_configs
            SET ${updates.join(', ')}
            WHERE id = ?
          `).bind(...params).run();
        }
      } else {
        const configId = generateId();
        await c.env.DB.prepare(`
          INSERT INTO user_search_source_configs (
            id, user_id, source_id, is_enabled, custom_priority,
            custom_name, custom_subtitle, custom_icon, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          configId,
          user.userId,
          config.sourceId,
          config.isEnabled === false ? 0 : 1,
          config.customPriority !== undefined && config.customPriority !== null
            ? Math.min(Math.max(config.customPriority, 1), 10)
            : null,
          config.customName?.trim() || null,
          config.customSubtitle?.trim() || null,
          config.customIcon?.trim() || null,
          config.notes?.trim() || null,
          now,
          now
        ).run();
      }
      updatedCount++;
    }

    return c.json(success({
      updatedCount,
      totalRequested: configs.length,
    }, '批量更新成功'));
  } catch (err) {
    console.error('Batch update user configs error:', err);
    return c.json(error('SERVER_ERROR', '批量更新失败'), 500);
  }
});
