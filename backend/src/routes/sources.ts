/**
 * 搜索源管理路由
 * 功能：搜索源、分类、大类管理
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { Env, SearchSource, SearchSourceCategory, MajorCategory, UserSearchSourceConfig, JwtPayload } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware } from '@/middleware';
import { VALIDATION_RULES } from '@/constants';

const R = VALIDATION_RULES;

export const sourceRoutes = new Hono<{ Bindings: Env }>();

sourceRoutes.use('*', authMiddleware);

const checkAdminRole = (user: JwtPayload): boolean => {
  return user.role === 'admin' || user.role === 'super_admin';
};

sourceRoutes.get('/major-categories', async (c) => {
  try {
    const categories = await c.env.DB.prepare(
      'SELECT * FROM search_major_categories WHERE is_active = 1 ORDER BY display_order ASC'
    ).all<MajorCategory>();

    return c.json(success({
      categories: categories.results || [],
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
    
    const categories = params.length > 0 
      ? await c.env.DB.prepare(query).bind(...params).all<SearchSourceCategory & { major_category_name: string }>()
      : await c.env.DB.prepare(query).all<SearchSourceCategory & { major_category_name: string }>();

    return c.json(success({
      categories: categories.results || [],
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
    const totalSources = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM search_sources WHERE is_active = 1 AND (is_system = 1 OR created_by = ?)'
    ).bind(user.userId).first<{ count: number }>();

    const searchableSources = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM search_sources WHERE is_active = 1 AND searchable = 1 AND (is_system = 1 OR created_by = ?)'
    ).bind(user.userId).first<{ count: number }>();

    const totalCategories = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM search_source_categories WHERE is_active = 1'
    ).first<{ count: number }>();

    const totalMajorCategories = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM search_major_categories WHERE is_active = 1'
    ).first<{ count: number }>();

    const topUsedSources = await c.env.DB.prepare(`
      SELECT id, name, usage_count 
      FROM search_sources 
      WHERE is_active = 1 AND (is_system = 1 OR created_by = ?)
      ORDER BY usage_count DESC 
      LIMIT 10
    `).bind(user.userId).all<{ id: string; name: string; usage_count: number }>();

    const sourcesByCategory = await c.env.DB.prepare(`
      SELECT c.name as category_name, COUNT(s.id) as source_count
      FROM search_source_categories c
      LEFT JOIN search_sources s ON c.id = s.category_id AND s.is_active = 1 AND (s.is_system = 1 OR s.created_by = ?)
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY source_count DESC
    `).bind(user.userId).all<{ category_name: string; source_count: number }>();

    const sourcesBySiteType = await c.env.DB.prepare(`
      SELECT site_type, COUNT(*) as count
      FROM search_sources
      WHERE is_active = 1 AND (is_system = 1 OR created_by = ?)
      GROUP BY site_type
    `).bind(user.userId).all<{ site_type: string; count: number }>();

    return c.json(success({
      totalSources: totalSources?.count || 0,
      searchableSources: searchableSources?.count || 0,
      totalCategories: totalCategories?.count || 0,
      totalMajorCategories: totalMajorCategories?.count || 0,
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
  const userId = c.req.param('userId');

  try {
    const sources = await c.env.DB.prepare(
      'SELECT * FROM search_sources WHERE is_active = 1 AND (is_system = 1 OR created_by = ?) ORDER BY search_priority DESC, display_order ASC'
    ).bind(userId).all<SearchSource>();

    const userConfigs = await c.env.DB.prepare(
      'SELECT * FROM user_search_source_configs WHERE user_id = ?'
    ).bind(userId).all<UserSearchSourceConfig>();

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

sourceRoutes.get('/:id', async (c) => {
  const sourceId = c.req.param('id');

  try {
    const source = await c.env.DB.prepare(
      'SELECT * FROM search_sources WHERE id = ? AND is_active = 1'
    ).bind(sourceId).first<SearchSource>();

    if (!source) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    return c.json(success({ source }));
  } catch (err) {
    console.error('Get source error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索源失败'), 500);
  }
});

sourceRoutes.post('/:id/increment-usage', async (c) => {
  const sourceId = c.req.param('id');

  try {
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

sourceRoutes.post('/major-categories', async (c) => {
  const user = c.get('user');
  
  if (!checkAdminRole(user)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const body = await c.req.json();
    const { name, description, icon, color, requiresKeyword } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json(error('VALIDATION_ERROR', '大类名称不能为空'), 400);
    }

    if (name.length > 30) {
      return c.json(error('VALIDATION_ERROR', '大类名称不能超过30个字符'), 400);
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
        id, name, description, icon, color, requires_keyword, 
        is_system, is_active, display_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, ?, ?)
    `).bind(
      categoryId,
      name.trim(),
      description?.trim() || '',
      icon?.trim() || '🌟',
      color?.trim() || '#6b7280',
      requiresKeyword !== false ? 1 : 0,
      now,
      now
    ).run();

    return c.json(success({
      id: categoryId,
      name: name.trim(),
      description: description?.trim() || '',
      icon: icon?.trim() || '🌟',
      color: color?.trim() || '#6b7280',
      requiresKeyword: requiresKeyword !== false,
      isSystem: false,
    }, '大类创建成功'));
  } catch (err) {
    console.error('Create major category error:', err);
    return c.json(error('SERVER_ERROR', '创建大类失败'), 500);
  }
});

sourceRoutes.post('/categories', async (c) => {
  const user = c.get('user');
  
  if (!checkAdminRole(user)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const body = await c.req.json();
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

    if (!majorCategoryId || typeof majorCategoryId !== 'string') {
      return c.json(error('VALIDATION_ERROR', '大类ID不能为空'), 400);
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
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
      Math.min(Math.max(parseInt(searchPriority) || 5, 1), 10),
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
      searchPriority: Math.min(Math.max(parseInt(searchPriority) || 5, 1), 10),
      isSystem: false,
    }, '分类创建成功'));
  } catch (err) {
    console.error('Create category error:', err);
    return c.json(error('SERVER_ERROR', '创建分类失败'), 500);
  }
});

sourceRoutes.put('/categories/:id', async (c) => {
  const user = c.get('user');
  const categoryId = c.req.param('id');

  try {
    const existingCategory = await c.env.DB.prepare(
      'SELECT * FROM search_source_categories WHERE id = ?'
    ).bind(categoryId).first<SearchSourceCategory>();

    if (!existingCategory) {
      return c.json(error('NOT_FOUND', '分类不存在'), 404);
    }

    if (existingCategory.is_system && !checkAdminRole(user)) {
      return c.json(error('FORBIDDEN', '系统分类仅管理员可修改'), 403);
    }

    const body = await c.req.json();
    const updates: string[] = [];
    const params: (string | number)[] = [];

    const allowedFields = [
      'name', 'description', 'icon', 'color',
      'defaultSearchable', 'defaultSiteType', 'searchPriority'
    ];

    allowedFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        if (field === 'searchPriority') {
          updates.push('search_priority = ?');
          params.push(Math.min(Math.max(parseInt(body[field]) || 5, 1), 10));
        } else if (field === 'defaultSearchable') {
          updates.push('default_searchable = ?');
          params.push(body[field] ? 1 : 0);
        } else if (typeof body[field] === 'string') {
          updates.push(`${field === 'defaultSiteType' ? 'default_site_type' : field} = ?`);
          params.push(body[field].trim());
        }
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
  const user = c.get('user');
  const categoryId = c.req.param('id');

  try {
    const existingCategory = await c.env.DB.prepare(
      'SELECT * FROM search_source_categories WHERE id = ?'
    ).bind(categoryId).first<SearchSourceCategory>();

    if (!existingCategory) {
      return c.json(error('NOT_FOUND', '分类不存在'), 404);
    }

    if (existingCategory.is_system && !checkAdminRole(user)) {
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

sourceRoutes.post('/', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const {
      categoryId,
      name,
      subtitle,
      description,
      icon,
      urlTemplate,
      homepageUrl,
      siteType,
      searchable,
      requiresKeyword,
      searchPriority
    } = body;

    if (!categoryId || typeof categoryId !== 'string') {
      return c.json(error('VALIDATION_ERROR', '分类ID不能为空'), 400);
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json(error('VALIDATION_ERROR', '搜索源名称不能为空'), 400);
    }

    if (!urlTemplate || typeof urlTemplate !== 'string' || urlTemplate.trim().length === 0) {
      return c.json(error('VALIDATION_ERROR', 'URL模板不能为空'), 400);
    }

    if (!/^https?:\/\/.+/.test(urlTemplate)) {
      return c.json(error('VALIDATION_ERROR', 'URL模板格式不正确'), 400);
    }

    const category = await c.env.DB.prepare(
      'SELECT id FROM search_source_categories WHERE id = ? AND is_active = 1'
    ).bind(categoryId).first();

    if (!category) {
      return c.json(error('NOT_FOUND', '分类不存在'), 404);
    }

    const sourceId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(`
      INSERT INTO search_sources (
        id, category_id, name, subtitle, description, icon, url_template,
        homepage_url, site_type, searchable, requires_keyword, search_priority,
        is_system, is_active, display_order, usage_count, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 999, 0, ?, ?, ?)
    `).bind(
      sourceId,
      categoryId.trim(),
      name.trim(),
      subtitle?.trim() || null,
      description?.trim() || null,
      icon?.trim() || '🔍',
      urlTemplate.trim(),
      homepageUrl?.trim() || null,
      siteType || 'search',
      searchable !== false ? 1 : 0,
      requiresKeyword !== false ? 1 : 0,
      Math.min(Math.max(parseInt(searchPriority) || 5, 1), 10),
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
      siteType: siteType || 'search',
      searchable: searchable !== false,
      requiresKeyword: requiresKeyword !== false,
      searchPriority: Math.min(Math.max(parseInt(searchPriority) || 5, 1), 10),
    }, '搜索源创建成功'));
  } catch (err) {
    console.error('Create source error:', err);
    return c.json(error('SERVER_ERROR', '创建搜索源失败'), 500);
  }
});

sourceRoutes.put('/major-categories/:id', async (c) => {
  const user = c.get('user');
  
  if (!checkAdminRole(user)) {
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

    if (existingCategory.is_system && !checkAdminRole(user)) {
      return c.json(error('FORBIDDEN', '系统大类仅管理员可修改'), 403);
    }

    const body = await c.req.json();
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

    if (body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(body.color)) {
      updates.push('color = ?');
      params.push(body.color);
    }

    if (body.requiresKeyword !== undefined) {
      updates.push('requires_keyword = ?');
      params.push(body.requiresKeyword ? 1 : 0);
    }

    if (body.displayOrder !== undefined) {
      updates.push('display_order = ?');
      params.push(Math.max(0, parseInt(body.displayOrder) || 0));
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
        ['name', 'description', 'icon', 'color', 'requiresKeyword', 'displayOrder', 'isActive'].includes(key)
      )
    }, '大类更新成功'));
  } catch (err) {
    console.error('Update major category error:', err);
    return c.json(error('SERVER_ERROR', '更新大类失败'), 500);
  }
});

sourceRoutes.delete('/major-categories/:id', async (c) => {
  const user = c.get('user');
  
  if (!checkAdminRole(user)) {
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

    if (existingCategory.is_system && !checkAdminRole(user)) {
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

sourceRoutes.put('/:id', async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('id');

  try {
    const existingSource = await c.env.DB.prepare(
      'SELECT * FROM search_sources WHERE id = ?'
    ).bind(sourceId).first<SearchSource>();

    if (!existingSource) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    if (existingSource.is_system && !checkAdminRole(user)) {
      return c.json(error('FORBIDDEN', '系统搜索源仅管理员可修改'), 403);
    }

    const body = await c.req.json();
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    const allowedFields = [
      'categoryId', 'name', 'subtitle', 'description', 'icon',
      'urlTemplate', 'homepageUrl', 'siteType', 'searchable',
      'requiresKeyword', 'searchPriority'
    ];

    const fieldMapping: Record<string, string> = {
      categoryId: 'category_id',
      urlTemplate: 'url_template',
      homepageUrl: 'homepage_url',
      siteType: 'site_type',
      requiresKeyword: 'requires_keyword',
      searchPriority: 'search_priority'
    };

    allowedFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        const dbField = fieldMapping[field] || field;
        if (field === 'searchPriority') {
          updates.push(`${dbField} = ?`);
          params.push(Math.min(Math.max(parseInt(body[field]) || 5, 1), 10));
        } else if (field === 'searchable' || field === 'requiresKeyword') {
          updates.push(`${dbField} = ?`);
          params.push(body[field] ? 1 : 0);
        } else if (typeof body[field] === 'string') {
          updates.push(`${dbField} = ?`);
          params.push(body[field].trim());
        } else if (body[field] === null) {
          updates.push(`${dbField} = ?`);
          params.push(null);
        }
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
  const user = c.get('user');
  const sourceId = c.req.param('id');

  try {
    const existingSource = await c.env.DB.prepare(
      'SELECT * FROM search_sources WHERE id = ?'
    ).bind(sourceId).first<SearchSource>();

    if (!existingSource) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    if (existingSource.is_system && !checkAdminRole(user)) {
      return c.json(error('FORBIDDEN', '系统搜索源仅管理员可删除'), 403);
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

sourceRoutes.post('/user-configs/batch', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { configs } = body;

    if (!Array.isArray(configs) || configs.length === 0) {
      return c.json(error('VALIDATION_ERROR', '配置列表不能为空'), 400);
    }

    if (configs.length > R.USER_CONFIG.BATCH_UPDATE_MAX_COUNT) {
      return c.json(error('VALIDATION_ERROR', `批量更新不能超过${R.USER_CONFIG.BATCH_UPDATE_MAX_COUNT}个配置`), 400);
    }

    const now = Date.now();
    let updatedCount = 0;

    for (const config of configs) {
      if (!config.sourceId || typeof config.sourceId !== 'string') {
        continue;
      }

      const existingConfig = await c.env.DB.prepare(
        'SELECT id FROM user_search_source_configs WHERE user_id = ? AND source_id = ?'
      ).bind(user.userId, config.sourceId).first();

      if (existingConfig) {
        await c.env.DB.prepare(`
          UPDATE user_search_source_configs 
          SET is_enabled = ?, custom_priority = ?, custom_name = ?, 
              custom_subtitle = ?, custom_icon = ?, notes = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          config.isEnabled !== false ? 1 : 0,
          config.customPriority ? Math.min(Math.max(parseInt(config.customPriority), 1), 10) : null,
          config.customName?.trim() || null,
          config.customSubtitle?.trim() || null,
          config.customIcon?.trim() || null,
          config.notes?.trim() || null,
          now,
          existingConfig.id
        ).run();
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
          config.isEnabled !== false ? 1 : 0,
          config.customPriority ? Math.min(Math.max(parseInt(config.customPriority), 1), 10) : null,
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
