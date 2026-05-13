/**
 * 社区模块路由
 * 功能：搜索源分享、标签管理、评论、点赞、举报等
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { Env, CommunitySourceTag, CommunitySharedSource, CommunitySourceReview } from '@/types';
import { success, error, generateId } from '@/utils';
import { z } from 'zod';
import { authMiddleware } from '@/middleware';

export const communityRoutes = new Hono<{ Bindings: Env }>();

communityRoutes.use('*', authMiddleware);

communityRoutes.get('/tags', async (c) => {
  try {
    const tags = await c.env.DB.prepare(
      'SELECT * FROM community_source_tags WHERE tag_active = 1 ORDER BY usage_count DESC, tag_name ASC'
    ).all<CommunitySourceTag>();

    return c.json(success(tags.results || []));
  } catch (err) {
    console.error('Get tags error:', err);
    return c.json(error('SERVER_ERROR', '获取标签失败'), 500);
  }
});

communityRoutes.post('/tags', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { name, description, color } = body;

  if (!name) {
    return c.json(error('VALIDATION_ERROR', '标签名称不能为空'), 400);
  }

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM community_source_tags WHERE tag_name = ?'
    ).bind(name).first();

    if (existing) {
      return c.json(error('DUPLICATE_ERROR', '标签已存在'), 400);
    }

    const id = generateId();
    const now = Date.now();

    await c.env.DB.prepare(
      `INSERT INTO community_source_tags (id, tag_name, tag_description, tag_color, usage_count, is_official, tag_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, 1, ?, ?, ?)`
    ).bind(id, name, description || null, color || '#3b82f6', user.userId, now, now).run();

    return c.json(success({
      id,
      tagName: name,
      tagDescription: description || null,
      tagColor: color || '#3b82f6',
      usageCount: 0,
      createdAt: now,
      createdBy: user.userId,
    }, '创建成功'));
  } catch (err) {
    console.error('Create tag error:', err);
    return c.json(error('SERVER_ERROR', '创建失败'), 500);
  }
});

communityRoutes.put('/tags/:id', async (c) => {
  const user = c.get('user');
  const tagId = c.req.param('id');
  const body = await c.req.json();
  const { name, description, color, isActive } = body;

  try {
    const existingTag = await c.env.DB.prepare(
      'SELECT * FROM community_source_tags WHERE id = ?'
    ).bind(tagId).first<CommunitySourceTag>();

    if (!existingTag) {
      return c.json(error('NOT_FOUND', '标签不存在'), 404);
    }

    if (existingTag.created_by !== user.userId && !existingTag.is_official) {
      return c.json(error('FORBIDDEN', '无权修改此标签'), 403);
    }

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 20) {
        return c.json(error('VALIDATION_ERROR', '标签名称长度必须在2-20个字符之间'), 400);
      }

      const duplicateTag = await c.env.DB.prepare(
        'SELECT id FROM community_source_tags WHERE LOWER(tag_name) = LOWER(?) AND id != ?'
      ).bind(trimmedName, tagId).first();

      if (duplicateTag) {
        return c.json(error('DUPLICATE_ERROR', '标签名称已存在'), 400);
      }
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (name !== undefined && name.trim() !== existingTag.tag_name) {
      updates.push('tag_name = ?');
      params.push(name.trim());
    }

    if (description !== undefined) {
      updates.push('tag_description = ?');
      params.push(description?.trim() || '');
    }

    if (color !== undefined && /^#[0-9a-fA-F]{6}$/.test(color)) {
      updates.push('tag_color = ?');
      params.push(color);
    }

    if (isActive !== undefined) {
      updates.push('tag_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return c.json(error('VALIDATION_ERROR', '没有需要更新的内容'), 400);
    }

    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(tagId);

    await c.env.DB.prepare(
      `UPDATE community_source_tags SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    return c.json(success({
      tagId,
      updatedFields: Object.keys(body).filter(key => ['name', 'description', 'color', 'isActive'].includes(key))
    }, '标签更新成功'));
  } catch (err) {
    console.error('Update tag error:', err);
    return c.json(error('SERVER_ERROR', '更新标签失败'), 500);
  }
});

communityRoutes.get('/tags/:id', async (c) => {
  const tagId = c.req.param('id');

  try {
    const tag = await c.env.DB.prepare(
      'SELECT * FROM community_source_tags WHERE id = ?'
    ).bind(tagId).first<CommunitySourceTag>();

    if (!tag) {
      return c.json(error('NOT_FOUND', '标签不存在'), 404);
    }

    return c.json(success({
      id: tag.id,
      name: tag.tag_name,
      description: tag.tag_description,
      color: tag.tag_color,
      usageCount: tag.usage_count,
      isOfficial: tag.is_official === 1,
      isActive: tag.tag_active === 1,
      createdAt: tag.created_at,
      createdBy: tag.created_by,
    }));
  } catch (err) {
    console.error('Get tag error:', err);
    return c.json(error('SERVER_ERROR', '获取标签失败'), 500);
  }
});

communityRoutes.delete('/tags/:id', async (c) => {
  const user = c.get('user');
  const tagId = c.req.param('id');

  try {
    const existingTag = await c.env.DB.prepare(
      'SELECT * FROM community_source_tags WHERE id = ?'
    ).bind(tagId).first<CommunitySourceTag>();

    if (!existingTag) {
      return c.json(error('NOT_FOUND', '标签不存在'), 404);
    }

    if (existingTag.created_by !== user.userId) {
      return c.json(error('FORBIDDEN', '无权删除此标签'), 403);
    }

    if (existingTag.is_official) {
      return c.json(error('FORBIDDEN', '不能删除官方标签'), 403);
    }

    if (existingTag.usage_count > 0) {
      return c.json(error('VALIDATION_ERROR', '不能删除正在使用的标签'), 400);
    }

    await c.env.DB.prepare('DELETE FROM community_source_tags WHERE id = ?').bind(tagId).run();

    return c.json(success({ deletedId: tagId }, '标签删除成功'));
  } catch (err) {
    console.error('Delete tag error:', err);
    return c.json(error('SERVER_ERROR', '删除标签失败'), 500);
  }
});

communityRoutes.get('/sources', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const status = c.req.query('status') || 'active';
  const search = c.req.query('search');
  const tags = c.req.query('tags');
  const sort = c.req.query('sort') || 'popular';
  const category = c.req.query('category');

  try {
    const whereClauses: string[] = ['s.status = ?'];
    const params: (string | number)[] = [status];

    if (search) {
      whereClauses.push('(s.source_name LIKE ? OR s.description LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    if (category) {
      whereClauses.push('s.source_category = ?');
      params.push(category);
    }

    if (tags) {
      const tagList = tags.split(',').filter(t => t.trim());
      if (tagList.length > 0) {
        tagList.forEach(tag => {
          whereClauses.push('s.tags LIKE ?');
          params.push(`%"${tag}"%`);
        });
      }
    }

    let orderBy = 's.view_count DESC, s.like_count DESC';
    if (sort === 'recent') {
      orderBy = 's.created_at DESC';
    } else if (sort === 'rating') {
      orderBy = 's.rating_score DESC, s.rating_count DESC';
    } else if (sort === 'downloads') {
      orderBy = 's.download_count DESC';
    }

    const whereClause = whereClauses.join(' AND ');

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM community_shared_sources s WHERE ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    const sources = await c.env.DB.prepare(
      `SELECT s.*, u.username as author_name 
       FROM community_shared_sources s 
       LEFT JOIN users u ON s.user_id = u.id 
       WHERE ${whereClause} 
       ORDER BY ${orderBy} 
       LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, (page - 1) * pageSize).all<CommunitySharedSource & { author_name?: string }>();

    const likedSourceIds: Set<string> = new Set();
    if (sources.results && sources.results.length > 0) {
      const sourceIds = sources.results.map(s => s.id);
      const inClause = sourceIds.map(() => '?').join(',');
      const likes = await c.env.DB.prepare(
        `SELECT shared_source_id FROM community_source_likes 
         WHERE user_id = ? AND like_type = 'like' AND shared_source_id IN (${inClause})`
      ).bind(user.userId, ...sourceIds).all<{ shared_source_id: string }>();
      
      (likes.results || []).forEach(l => likedSourceIds.add(l.shared_source_id));
    }

    const items = (sources.results || []).map(s => ({
      ...s,
      is_liked: likedSourceIds.has(s.id) ? 1 : 0,
    }));

    return c.json(success({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  } catch (err) {
    console.error('Get shared sources error:', err);
    return c.json(error('SERVER_ERROR', '获取分享源失败'), 500);
  }
});

communityRoutes.get('/sources/my-favorites', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');

  try {
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM community_source_likes l
       JOIN community_shared_sources s ON l.shared_source_id = s.id
       WHERE l.user_id = ? AND l.like_type = 'like' AND s.status = 'active'`
    ).bind(user.userId).first<{ total: number }>();

    const sources = await c.env.DB.prepare(
      `SELECT s.*, u.username as author_name FROM community_source_likes l
       JOIN community_shared_sources s ON l.shared_source_id = s.id
       LEFT JOIN users u ON s.user_id = u.id
       WHERE l.user_id = ? AND l.like_type = 'like' AND s.status = 'active'
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(user.userId, pageSize, (page - 1) * pageSize).all<CommunitySharedSource & { author_name?: string }>();

    return c.json(success({
      items: sources.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get my favorites error:', err);
    return c.json(error('SERVER_ERROR', '获取收藏失败'), 500);
  }
});

communityRoutes.get('/sources/my-sources', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const status = c.req.query('status');

  try {
    let query = 'SELECT * FROM community_shared_sources WHERE user_id = ?';
    const params: (string | number)[] = [user.userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM (${query})`
    ).bind(...params).first<{ total: number }>();

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);

    const sources = await c.env.DB.prepare(query).bind(...params).all<CommunitySharedSource>();

    return c.json(success({
      items: sources.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get my sources error:', err);
    return c.json(error('SERVER_ERROR', '获取失败'), 500);
  }
});

communityRoutes.get('/sources/popular', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  const tag = c.req.query('tag');

  try {
    let query = `SELECT s.*, u.username as author_name 
       FROM community_shared_sources s 
       LEFT JOIN users u ON s.user_id = u.id 
       WHERE s.status = 'active'`;
    const params: (string | number)[] = [];

    if (tag) {
      query += ` AND s.tags LIKE ?`;
      params.push(`%"${tag}"%`);
    }

    query += ` ORDER BY s.view_count DESC, s.like_count DESC LIMIT ?`;
    params.push(limit);

    const sources = await c.env.DB.prepare(query).bind(...params).all<CommunitySharedSource & { author_name?: string }>();

    return c.json(success(sources.results || []));
  } catch (err) {
    console.error('Get popular sources error:', err);
    return c.json(error('SERVER_ERROR', '获取失败'), 500);
  }
});

communityRoutes.get('/sources/recent', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');

  try {
    const sources = await c.env.DB.prepare(
      `SELECT * FROM community_shared_sources 
       WHERE status = 'active' 
       ORDER BY created_at DESC 
       LIMIT ?`
    ).bind(limit).all<CommunitySharedSource>();

    return c.json(success(sources.results || []));
  } catch (err) {
    console.error('Get recent sources error:', err);
    return c.json(error('SERVER_ERROR', '获取失败'), 500);
  }
});

communityRoutes.get('/sources/user-stats', async (c) => {
  const user = c.get('user');

  try {
    const stats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending_count,
        COALESCE(SUM(download_count), 0) as total_downloads,
        COALESCE(SUM(like_count), 0) as total_likes,
        COALESCE(SUM(view_count), 0) as total_views,
        AVG(CASE WHEN rating_count > 0 THEN rating_score END) as avg_rating
      FROM community_shared_sources WHERE user_id = ?
    `).bind(user.userId).first();

    const [reviewsResult, tagsResult] = await c.env.DB.batch([
      c.env.DB.prepare('SELECT COUNT(*) as c FROM community_source_reviews WHERE user_id = ?').bind(user.userId),
      c.env.DB.prepare('SELECT COUNT(*) as c FROM community_source_tags WHERE created_by = ?').bind(user.userId),
    ]) as unknown as [{ results: Array<{ c: number }> }, { results: Array<{ c: number }> }];

    const reviewsGiven = reviewsResult.results[0]?.c || 0;
    const tagsCreated = tagsResult.results[0]?.c || 0;

    const recentShares = await c.env.DB.prepare(
      `SELECT id, source_name, status, download_count, like_count, view_count, rating_score, created_at 
       FROM community_shared_sources 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 10`
    ).bind(user.userId).all();

    return c.json(success({
      general: {
        sharedSources: stats?.total || 0,
        pendingSources: stats?.pending_count || 0,
        totalDownloads: stats?.total_downloads || 0,
        totalLikes: stats?.total_likes || 0,
        totalViews: stats?.total_views || 0,
        avgRating: stats?.avg_rating || 0,
        reviewsGiven,
        tagsCreated,
      },
      recentShares: recentShares.results || []
    }));
  } catch (err) {
    console.error('Get user stats error:', err);
    return c.json(error('SERVER_ERROR', '获取用户统计失败'), 500);
  }
});

communityRoutes.get('/sources/stats', async (c) => {
  try {
    const cacheKey = new Request('https://internal/community-stats');
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

    const totalSources = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM community_shared_sources WHERE status = ?'
    ).bind('active').first<{ count: number }>();

    const totalDownloads = await c.env.DB.prepare(
      'SELECT COALESCE(SUM(download_count), 0) as total FROM community_shared_sources'
    ).first<{ total: number }>();

    const totalUsers = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT user_id) as count FROM community_shared_sources'
    ).first<{ count: number }>();

    const totalReviews = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM community_source_reviews'
    ).first<{ count: number }>();

    const avgRating = await c.env.DB.prepare(
      'SELECT AVG(rating_score) as avg FROM community_shared_sources WHERE rating_count > 0'
    ).first<{ avg: number }>();

    const categoriesCount = await c.env.DB.prepare(
      'SELECT COUNT(DISTINCT source_category) as count FROM community_shared_sources WHERE status = ?'
    ).bind('active').first<{ count: number }>();

    const topCategories = await c.env.DB.prepare(`
      SELECT source_category as category, COUNT(*) as count 
      FROM community_shared_sources 
      WHERE status = 'active' 
      GROUP BY source_category 
      ORDER BY count DESC 
      LIMIT 10
    `).all<{ category: string; count: number }>();

    const recentActivity = await c.env.DB.prepare(`
      SELECT id, 'share' as type, source_name as sourceName, created_at as createdAt 
      FROM community_shared_sources 
      WHERE status = 'active' 
      ORDER BY created_at DESC 
      LIMIT 10
    `).all<{ id: string; type: string; sourceName: string; createdAt: number }>();

    return c.json(success({
      totalSources: totalSources?.count || 0,
      totalDownloads: totalDownloads?.total || 0,
      totalUsers: totalUsers?.count || 0,
      totalReviews: totalReviews?.count || 0,
      averageRating: avgRating?.avg || 0,
      categoriesCount: categoriesCount?.count || 0,
      topCategories: topCategories.results || [],
      recentActivity: (recentActivity.results || []).map(item => ({
        ...item,
        createdAt: new Date(item.createdAt).toISOString()
      }))
    }));

    const response = c.json(success({
      totalSources: totalSources?.count || 0,
      totalDownloads: totalDownloads?.total || 0,
      totalUsers: totalUsers?.count || 0,
      totalReviews: totalReviews?.count || 0,
      averageRating: avgRating?.avg || 0,
      categoriesCount: categoriesCount?.count || 0,
      topCategories: topCategories.results || [],
      recentActivity: (recentActivity.results || []).map(item => ({
        ...item,
        createdAt: new Date(item.createdAt).toISOString()
      }))
    }));

    c.executionCtx.waitUntil(
      cache.put(cacheKey, response.clone())
    );

    return response;
  } catch (err) {
    console.error('Get community stats error:', err);
    return c.json(error('SERVER_ERROR', '获取社区统计失败'), 500);
  }
});

communityRoutes.get('/sources/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const source = await c.env.DB.prepare(
      'SELECT * FROM community_shared_sources WHERE id = ?'
    ).bind(id).first<CommunitySharedSource>();

    if (!source) {
      return c.json(error('NOT_FOUND', '分享源不存在'), 404);
    }

    await c.env.DB.prepare(
      'UPDATE community_shared_sources SET view_count = view_count + 1 WHERE id = ?'
    ).bind(id).run();

    return c.json(success(source));
  } catch (err) {
    console.error('Get shared source error:', err);
    return c.json(error('SERVER_ERROR', '获取分享源失败'), 500);
  }
});

communityRoutes.post('/sources', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { sourceName, sourceSubtitle, sourceIcon, sourceUrlTemplate, sourceCategory, description, tags } = body;

  if (!sourceName || !sourceUrlTemplate || !sourceCategory) {
    return c.json(error('VALIDATION_ERROR', '名称、URL和分类不能为空'), 400);
  }

  try {
    const id = generateId();
    const now = Date.now();

    await c.env.DB.prepare(
      `INSERT INTO community_shared_sources (id, user_id, source_name, source_subtitle, source_icon, source_url_template, source_category, description, tags, download_count, like_count, view_count, rating_score, rating_count, is_verified, is_featured, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 'active', ?, ?)`
    ).bind(id, user.userId, sourceName, sourceSubtitle || null, sourceIcon || '🔍', sourceUrlTemplate, sourceCategory, description || '', JSON.stringify(tags || []), now, now).run();

    return c.json(success({
      id,
      sourceName,
      sourceSubtitle: sourceSubtitle || null,
      sourceIcon: sourceIcon || '🔍',
      sourceUrlTemplate,
      sourceCategory,
      description: description || '',
      tags: tags || [],
      userId: user.userId,
      status: 'active',
      viewCount: 0,
      downloadCount: 0,
      likeCount: 0,
      ratingScore: 0,
      ratingCount: 0,
      createdAt: now,
      updatedAt: now,
    }, '提交成功'));
  } catch (err) {
    console.error('Create shared source error:', err);
    return c.json(error('SERVER_ERROR', '提交失败'), 500);
  }
});

communityRoutes.delete('/sources/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  try {
    const source = await c.env.DB.prepare(
      'SELECT user_id FROM community_shared_sources WHERE id = ?'
    ).bind(id).first();

    if (!source) {
      return c.json(error('NOT_FOUND', '分享源不存在'), 404);
    }

    if (source.user_id !== user.userId) {
      return c.json(error('FORBIDDEN', '无权删除'), 403);
    }

    await c.env.DB.prepare('DELETE FROM community_shared_sources WHERE id = ?').bind(id).run();
    return c.json(success(null, '删除成功'));
  } catch (err) {
    console.error('Delete shared source error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});

communityRoutes.put('/sources/:id', async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('id');

  try {
    const existingSource = await c.env.DB.prepare(
      'SELECT * FROM community_shared_sources WHERE id = ? AND user_id = ?'
    ).bind(sourceId, user.userId).first<CommunitySharedSource>();

    if (!existingSource) {
      return c.json(error('NOT_FOUND', '搜索源不存在或您无权编辑'), 404);
    }

    const body = await c.req.json();
    const { sourceName, sourceSubtitle, sourceIcon, description, tags, sourceCategory } = body;

    if (sourceName !== undefined && sourceName.trim().length < 2) {
      return c.json(error('VALIDATION_ERROR', '搜索源名称至少需要2个字符'), 400);
    }

    const now = Date.now();

    await c.env.DB.prepare(`
      UPDATE community_shared_sources SET
        source_name = ?,
        source_subtitle = ?,
        source_icon = ?,
        description = ?,
        tags = ?,
        source_category = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      sourceName?.trim() || existingSource.source_name,
      sourceSubtitle?.trim() || existingSource.source_subtitle,
      sourceIcon?.trim() || existingSource.source_icon,
      description?.trim() || existingSource.description,
      JSON.stringify(tags || []),
      sourceCategory || existingSource.source_category,
      now,
      sourceId,
      user.userId
    ).run();

    return c.json(success({
      sourceId,
      updatedFields: Object.keys(body).filter(key => 
        ['sourceName', 'sourceSubtitle', 'sourceIcon', 'description', 'tags', 'sourceCategory'].includes(key)
      )
    }, '搜索源更新成功'));
  } catch (err) {
    console.error('Update shared source error:', err);
    return c.json(error('SERVER_ERROR', '更新搜索源失败'), 500);
  }
});

communityRoutes.put('/sources/:id/status', async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('id');
  const body = await c.req.json();
  const { status, reason } = body;

  if (!['active', 'rejected'].includes(status)) {
    return c.json(error('VALIDATION_ERROR', '无效的状态'), 400);
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const source = await c.env.DB.prepare(
      'SELECT * FROM community_shared_sources WHERE id = ?'
    ).bind(sourceId).first<CommunitySharedSource>();

    if (!source) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    const now = Date.now();

    await c.env.DB.prepare(
      'UPDATE community_shared_sources SET status = ?, updated_at = ? WHERE id = ?'
    ).bind(status, now, sourceId).run();

    return c.json(success({
      sourceId,
      status,
      reason: reason || null,
    }, status === 'active' ? '已通过审核' : '已拒绝'));
  } catch (err) {
    console.error('Update source status error:', err);
    return c.json(error('SERVER_ERROR', '更新状态失败'), 500);
  }
});

communityRoutes.post('/sources/:id/like', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM community_source_likes WHERE shared_source_id = ? AND user_id = ? AND like_type = ?'
    ).bind(id, user.userId, 'like').first();

    if (existing) {
      await c.env.DB.prepare('DELETE FROM community_source_likes WHERE id = ?').bind(existing.id).run();
      await c.env.DB.prepare(
        'UPDATE community_shared_sources SET like_count = MAX(0, like_count - 1) WHERE id = ?'
      ).bind(id).run();
      return c.json(success({ liked: false }, '取消点赞'));
    } else {
      const likeId = generateId();
      await c.env.DB.prepare(
        'INSERT INTO community_source_likes (id, shared_source_id, user_id, like_type, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(likeId, id, user.userId, 'like', Date.now()).run();
      await c.env.DB.prepare(
        'UPDATE community_shared_sources SET like_count = like_count + 1 WHERE id = ?'
      ).bind(id).run();
      return c.json(success({ liked: true }, '点赞成功'));
    }
  } catch (err) {
    console.error('Like shared source error:', err);
    return c.json(error('SERVER_ERROR', '操作失败'), 500);
  }
});

communityRoutes.get('/sources/:id/reviews', async (c) => {
  const sourceId = c.req.param('id');

  try {
    const reviews = await c.env.DB.prepare(
      `SELECT r.*, u.username 
       FROM community_source_reviews r 
       JOIN users u ON r.user_id = u.id 
       WHERE r.shared_source_id = ? 
       ORDER BY r.created_at DESC`
    ).bind(sourceId).all<CommunitySourceReview & { username: string }>();

    return c.json(success(reviews.results || []));
  } catch (err) {
    console.error('Get reviews error:', err);
    return c.json(error('SERVER_ERROR', '获取评论失败'), 500);
  }
});

communityRoutes.post('/reviews', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { sharedSourceId, rating, comment } = body;

  if (!sharedSourceId || !rating || rating < 1 || rating > 5) {
    return c.json(error('VALIDATION_ERROR', '参数无效'), 400);
  }

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM community_source_reviews WHERE shared_source_id = ? AND user_id = ?'
    ).bind(sharedSourceId, user.userId).first();

    if (existing) {
      return c.json(error('DUPLICATE_ERROR', '您已评价过该资源'), 400);
    }

    const id = generateId();
    const now = Date.now();

    await c.env.DB.prepare(
      `INSERT INTO community_source_reviews (id, shared_source_id, user_id, rating, comment, is_anonymous, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    ).bind(id, sharedSourceId, user.userId, rating, comment || '', now, now).run();

    return c.json(success({
      id,
      sharedSourceId,
      userId: user.userId,
      rating,
      comment: comment || '',
      createdAt: now,
      updatedAt: now,
    }, '评论成功'));
  } catch (err) {
    console.error('Create review error:', err);
    return c.json(error('SERVER_ERROR', '评论失败'), 500);
  }
});

communityRoutes.delete('/reviews/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  try {
    const review = await c.env.DB.prepare(
      'SELECT user_id FROM community_source_reviews WHERE id = ?'
    ).bind(id).first();

    if (!review) {
      return c.json(error('NOT_FOUND', '评论不存在'), 404);
    }

    if (review.user_id !== user.userId) {
      return c.json(error('FORBIDDEN', '无权删除'), 403);
    }

    await c.env.DB.prepare('DELETE FROM community_source_reviews WHERE id = ?').bind(id).run();

    return c.json(success(null, '删除成功'));
  } catch (err) {
    console.error('Delete review error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});

communityRoutes.put('/reviews/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const { rating, comment } = body;

  if (rating !== undefined && (rating < 1 || rating > 5)) {
    return c.json(error('VALIDATION_ERROR', '评分必须在1-5之间'), 400);
  }

  if (comment !== undefined && comment.length > 1000) {
    return c.json(error('VALIDATION_ERROR', '评论内容最多1000个字符'), 400);
  }

  try {
    const review = await c.env.DB.prepare(
      'SELECT * FROM community_source_reviews WHERE id = ?'
    ).bind(id).first<CommunitySourceReview>();

    if (!review) {
      return c.json(error('NOT_FOUND', '评论不存在'), 404);
    }

    if (review.user_id !== user.userId) {
      return c.json(error('FORBIDDEN', '无权修改'), 403);
    }

    const newRating = rating !== undefined ? rating : review.rating;
    const newComment = comment !== undefined ? comment : review.comment;
    const now = Date.now();

    await c.env.DB.prepare(
      'UPDATE community_source_reviews SET rating = ?, comment = ?, updated_at = ? WHERE id = ?'
    ).bind(newRating, newComment, now, id).run();

    if (rating !== undefined && rating !== review.rating) {
      const stats = await c.env.DB.prepare(
        'SELECT AVG(rating) as avg, COUNT(*) as count FROM community_source_reviews WHERE shared_source_id = ?'
      ).bind(review.shared_source_id).first<{ avg: number; count: number }>();

      if (stats) {
        await c.env.DB.prepare(
          'UPDATE community_shared_sources SET rating_score = ?, rating_count = ?, updated_at = ? WHERE id = ?'
        ).bind(stats.avg, stats.count, now, review.shared_source_id).run();
      }
    }

    return c.json(success({
      id,
      rating: newRating,
      comment: newComment,
      updatedAt: now,
    }, '评论已更新'));
  } catch (err) {
    console.error('Update review error:', err);
    return c.json(error('SERVER_ERROR', '更新评论失败'), 500);
  }
});

communityRoutes.post('/sources/:id/report', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const { reason, details } = body;

  if (!reason) {
    return c.json(error('VALIDATION_ERROR', '请提供举报原因'), 400);
  }

  try {
    const source = await c.env.DB.prepare(
      'SELECT id FROM community_shared_sources WHERE id = ?'
    ).bind(id).first();

    if (!source) {
      return c.json(error('NOT_FOUND', '分享源不存在'), 404);
    }

    const reportId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(
      `INSERT INTO community_source_reports (id, shared_source_id, reporter_user_id, report_reason, report_details, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(reportId, id, user.userId, reason, details || null, now, now).run();

    return c.json(success({ reportId }, '举报已提交'));
  } catch (err) {
    console.error('Report shared source error:', err);
    return c.json(error('SERVER_ERROR', '举报失败'), 500);
  }
});

communityRoutes.post('/sources/:id/download', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  try {
    const downloadId = generateId();
    const now = Date.now();
    const ip = c.req.header('x-forwarded-for') || 
               c.req.header('x-real-ip') || 
               c.req.header('CF-Connecting-IP') ||
               null;
    const userAgent = c.req.header('User-Agent') || null;

    await c.env.DB.prepare(
      `INSERT INTO community_source_downloads (id, shared_source_id, user_id, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(downloadId, id, user.userId, ip, userAgent, now).run();

    return c.json(success(null, '下载计数已更新'));
  } catch (err) {
    console.error('Download count error:', err);
    return c.json(error('SERVER_ERROR', '操作失败'), 500);
  }
});

communityRoutes.get('/notifications', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const offset = (page - 1) * pageSize;

  try {
    const mySources = await c.env.DB.prepare(
      'SELECT id, source_name FROM community_shared_sources WHERE user_id = ?'
    ).bind(user.userId).all<{ id: string; source_name: string }>();

    const mySourceIds = (mySources.results || []).map(s => s.id);
    const sourceNameMap: Record<string, string> = {};
    (mySources.results || []).forEach(s => { sourceNameMap[s.id] = s.source_name; });

    if (mySourceIds.length === 0) {
      return c.json(success({
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      }));
    }

    const inClause = mySourceIds.map(() => '?').join(',');

    const likes = await c.env.DB.prepare(
      `SELECT l.id, l.shared_source_id, l.user_id as actor_id, u.username as actor_name, l.created_at,
              'like' as type
       FROM community_source_likes l
       LEFT JOIN users u ON l.user_id = u.id
       WHERE l.shared_source_id IN (${inClause}) AND l.user_id != ?
       ORDER BY l.created_at DESC LIMIT 100`
    ).bind(...mySourceIds, user.userId).all<any>();

    const reviews = await c.env.DB.prepare(
      `SELECT r.id, r.shared_source_id, r.user_id as actor_id, u.username as actor_name, r.rating, r.comment, r.created_at,
              'review' as type
       FROM community_source_reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.shared_source_id IN (${inClause}) AND r.user_id != ?
       ORDER BY r.created_at DESC LIMIT 100`
    ).bind(...mySourceIds, user.userId).all<any>();

    const downloads = await c.env.DB.prepare(
      `SELECT d.id, d.shared_source_id, d.user_id as actor_id, u.username as actor_name, d.created_at,
              'download' as type
       FROM community_source_downloads d
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.shared_source_id IN (${inClause}) AND d.user_id != ? AND d.user_id IS NOT NULL
       ORDER BY d.created_at DESC LIMIT 100`
    ).bind(...mySourceIds, user.userId).all<any>();

    const reports = await c.env.DB.prepare(
      `SELECT r.id, r.shared_source_id, r.status, r.report_reason, r.updated_at as created_at,
              'report_resolved' as type
       FROM community_source_reports r
       WHERE r.shared_source_id IN (${inClause}) AND r.status != 'pending'
       ORDER BY r.updated_at DESC LIMIT 50`
    ).bind(...mySourceIds).all();

    const notificationSchema = z.object({
      id: z.string(),
      shared_source_id: z.string(),
      actor_name: z.string().optional(),
      created_at: z.number(),
      rating: z.number().optional(),
      comment: z.string().optional(),
      report_reason: z.string().optional(),
      status: z.string().optional(),
      type: z.string(),
    });

    const allNotifications = [
      ...(likes.results || []).map((n) => {
        const result = notificationSchema.safeParse(n);
        const notif = result.success ? result.data : n;
        return {
          id: `like_${notif.id}`,
          type: 'like',
          sourceId: notif.shared_source_id,
          sourceName: sourceNameMap[String(notif.shared_source_id)] || '未知搜索源',
          actorName: notif.actor_name || '匿名用户',
          content: `点赞了你的搜索源`,
          createdAt: notif.created_at,
        };
      }),
      ...(reviews.results || []).map((n) => {
        const result = notificationSchema.safeParse(n);
        const notif = result.success ? result.data : n;
        return {
          id: `review_${notif.id}`,
          type: 'review',
          sourceId: notif.shared_source_id,
          sourceName: sourceNameMap[String(notif.shared_source_id)] || '未知搜索源',
          actorName: notif.actor_name || '匿名用户',
          content: `评价了你的搜索源（${notif.rating}星）${notif.comment ? '：' + notif.comment.slice(0, 50) : ''}`,
          rating: notif.rating,
          createdAt: notif.created_at,
        };
      }),
      ...(downloads.results || []).map((n) => {
        const result = notificationSchema.safeParse(n);
        const notif = result.success ? result.data : n;
        return {
          id: `download_${notif.id}`,
          type: 'download',
          sourceId: notif.shared_source_id,
          sourceName: sourceNameMap[String(notif.shared_source_id)] || '未知搜索源',
          actorName: notif.actor_name || '匿名用户',
          content: `导入了你的搜索源`,
          createdAt: notif.created_at,
        };
      }),
      ...(reports.results || []).map((n) => {
        const result = notificationSchema.safeParse(n);
        const notif = result.success ? result.data : n;
        return {
          id: `report_${notif.id}`,
          type: 'report_resolved',
          sourceId: notif.shared_source_id,
          sourceName: sourceNameMap[String(notif.shared_source_id)] || '未知搜索源',
          actorName: '管理员',
          content: `对举报"${notif.report_reason}"的处理结果：${notif.status === 'resolved' ? '已解决' : '已驳回'}`,
          createdAt: notif.created_at,
        };
      }),
    ].sort((a, b) => b.createdAt - a.createdAt);

    const total = allNotifications.length;
    const items = allNotifications.slice(offset, offset + pageSize);

    return c.json(success({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  } catch (err) {
    console.error('Get notifications error:', err);
    return c.json(error('SERVER_ERROR', '获取通知失败'), 500);
  }
});
