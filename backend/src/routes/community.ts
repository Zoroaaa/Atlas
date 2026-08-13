/**
 * 社区模块路由
 * 功能：资源分享（帖子/标签/评论/点赞/收藏/举报/统计/通知）
 * 版本：3.0 - 从搜索源分享重构为资源分享
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import {
  CreatePostRequest,
  UpdatePostRequest,
  CreateCommentRequest,
  CreateTagRequest,
  UpdateTagRequest,
  ReportRequest,
} from '@codeseek/shared';
import { success, error, generateId } from '@/utils';
import { authMiddleware, checkIsAdmin } from '@/middleware/auth';

export const communityRoutes = new Hono<{ Bindings: Env }>();

communityRoutes.use('*', authMiddleware);

// ============================================================
// 1. 标签管理
// ============================================================

/** 获取所有活跃标签 */
communityRoutes.get('/tags', async (c) => {
  try {
    const tags = await c.env.DB.prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM community_posts p WHERE p.status = 'active' AND p.tags LIKE '%' || t.tag_name || '%') as posts_count
       FROM community_tags t
       WHERE t.tag_active = 1
       ORDER BY tag_name ASC`
    ).all<Record<string, unknown>>();

    return c.json(success(
      (tags.results || []).map(t => ({
        id: t.id,
        tagName: t.tag_name,
        tagDescription: t.tag_description,
        tagColor: t.tag_color,
        isActive: !!t.tag_active,
        createdAt: t.created_at,
        createdBy: t.created_by,
        postsCount: (t.posts_count as number) || 0,
      }))
    ));
  } catch (err) {
    console.error('Get tags error:', err);
    return c.json(error('SERVER_ERROR', '获取标签失败'), 500);
  }
});

/** 创建标签 */
communityRoutes.post('/tags', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as CreateTagRequest;
  const { name, description, color } = body;

  if (!name || name.trim().length === 0) {
    return c.json(error('VALIDATION_ERROR', '标签名称不能为空'), 400);
  }

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM community_tags WHERE tag_name = ?'
    ).bind(name.trim()).first();

    if (existing) {
      return c.json(error('DUPLICATE_ERROR', '标签已存在'), 400);
    }

    const id = generateId();
    const now = Date.now();

    await c.env.DB.prepare(
      `INSERT INTO community_tags (id, tag_name, tag_description, tag_color, tag_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(id, name.trim(), description || null, color || '#3b82f6', user.userId, now, now).run();

    return c.json(success({
      id,
      tagName: name.trim(),
      tagDescription: description || null,
      tagColor: color || '#3b82f6',
      isActive: true,
      createdAt: now,
      createdBy: user.userId,
    }, '创建成功'));
  } catch (err) {
    console.error('Create tag error:', err);
    return c.json(error('SERVER_ERROR', '创建失败'), 500);
  }
});

/** 获取标签详情 */
communityRoutes.get('/tags/:id', async (c) => {
  const tagId = c.req.param('id');

  try {
    const tag = await c.env.DB.prepare(
      'SELECT * FROM community_tags WHERE id = ?'
    ).bind(tagId).first<Record<string, unknown>>();

    if (!tag) {
      return c.json(error('NOT_FOUND', '标签不存在'), 404);
    }

    return c.json(success({
      id: tag.id,
      tagName: tag.tag_name,
      tagDescription: tag.tag_description,
      tagColor: tag.tag_color,
      isActive: !!tag.tag_active,
      createdAt: tag.created_at,
      createdBy: tag.created_by,
    }));
  } catch (err) {
    console.error('Get tag error:', err);
    return c.json(error('SERVER_ERROR', '获取标签失败'), 500);
  }
});

/** 更新标签 */
communityRoutes.put('/tags/:id', async (c) => {
  const tagId = c.req.param('id');
  const body = await c.req.json() as UpdateTagRequest;
  const { name, description, color, isActive } = body;

  try {
    const existingTag = await c.env.DB.prepare(
      'SELECT * FROM community_tags WHERE id = ?'
    ).bind(tagId).first<Record<string, unknown>>();

    if (!existingTag) {
      return c.json(error('NOT_FOUND', '标签不存在'), 404);
    }

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 20) {
        return c.json(error('VALIDATION_ERROR', '标签名称长度必须在2-20个字符之间'), 400);
      }

      const duplicateTag = await c.env.DB.prepare(
        'SELECT id FROM community_tags WHERE LOWER(tag_name) = LOWER(?) AND id != ?'
      ).bind(trimmedName, tagId).first();

      if (duplicateTag) {
        return c.json(error('DUPLICATE_ERROR', '标签名称已存在'), 400);
      }
    }

    const updates: string[] = [];
    const params: (string | number | boolean | null)[] = [];

    if (name !== undefined && name.trim() !== existingTag.tag_name) {
      updates.push('tag_name = ?');
      params.push(name.trim());
    }

    if (description !== undefined) {
      updates.push('tag_description = ?');
      params.push(description?.trim() || null);
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
      `UPDATE community_tags SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    return c.json(success({
      tagId,
      updatedFields: Object.keys(body),
    }, '标签更新成功'));
  } catch (err) {
    console.error('Update tag error:', err);
    return c.json(error('SERVER_ERROR', '更新标签失败'), 500);
  }
});

/** 删除标签 */
communityRoutes.delete('/tags/:id', async (c) => {
  const user = c.get('user');
  const tagId = c.req.param('id');

  try {
    const existingTag = await c.env.DB.prepare(
      'SELECT * FROM community_tags WHERE id = ?'
    ).bind(tagId).first<Record<string, unknown>>();

    if (!existingTag) {
      return c.json(error('NOT_FOUND', '标签不存在'), 404);
    }

    if (existingTag.created_by !== user.userId) {
      return c.json(error('FORBIDDEN', '无权删除此标签'), 403);
    }

    // 检查是否有帖子使用该标签
    const usageCheck = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM community_posts WHERE tags LIKE ?"
    ).bind(`%"${existingTag.tag_name}"%`).first<{ cnt: number }>();

    if (usageCheck && usageCheck.cnt > 0) {
      return c.json(error('VALIDATION_ERROR', '不能删除正在使用的标签'), 400);
    }

    await c.env.DB.prepare('DELETE FROM community_tags WHERE id = ?').bind(tagId).run();

    return c.json(success({ deletedId: tagId }, '标签删除成功'));
  } catch (err) {
    console.error('Delete tag error:', err);
    return c.json(error('SERVER_ERROR', '删除标签失败'), 500);
  }
});

// ============================================================
// 6. 个人中心（必须在 /posts/:id 之前注册！）
// ============================================================

/** 我的帖子 */
communityRoutes.get('/posts/my-posts', async (c) => {
  const user = c.get('user');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20')));
  const status = c.req.query('status');

  try {
    let whereClause = 'WHERE user_id = ?';
    const params: (string | number)[] = [user.userId];

    if (status && ['active', 'pending', 'rejected', 'hidden'].includes(status)) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM community_posts ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    const posts = await c.env.DB.prepare(
      `SELECT * FROM community_posts ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>();

    return c.json(success({
      items: (posts.results || []).map(p => ({
        id: p.id,
        userId: p.user_id,
        postType: p.post_type,
        title: p.title,
        coverImage: p.cover_image,
        contentData: p.content_data,
        caption: p.caption,
        tags: typeof p.tags === 'string' ? JSON.parse(p.tags as string) : p.tags,
        viewCount: p.view_count,
        likeCount: p.like_count,
        commentCount: p.comment_count,
        favoriteCount: p.favorite_count,
        shareCount: p.share_count,
        status: p.status,
        isFeatured: !!p.is_featured,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  } catch (err) {
    console.error('Get my posts error:', err);
    return c.json(error('SERVER_ERROR', '获取我的帖子失败'), 500);
  }
});

/** 我的收藏 */
communityRoutes.get('/posts/my-favorites', async (c) => {
  const user = c.get('user');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20')));

  try {
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM community_likes l
       JOIN community_posts p ON l.post_id = p.id
       WHERE l.user_id = ? AND l.like_type = 'favorite' AND p.status = 'active'`
    ).bind(user.userId).first<{ total: number }>();

    const total = countResult?.total || 0;

    const posts = await c.env.DB.prepare(
      `SELECT p.*, u.username as userName
       FROM community_likes l
       JOIN community_posts p ON l.post_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE l.user_id = ? AND l.like_type = 'favorite' AND p.status = 'active'
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(user.userId, pageSize, (page - 1) * pageSize)
     .all<Record<string, unknown> & { userName: string }>();

    return c.json(success({
      items: (posts.results || []).map(p => ({
        id: p.id,
        userId: p.user_id,
        userName: p.userName,
        postType: p.post_type,
        title: p.title,
        coverImage: p.cover_image,
        contentData: p.content_data,
        caption: p.caption,
        tags: typeof p.tags === 'string' ? JSON.parse(p.tags as string) : p.tags,
        viewCount: p.view_count,
        likeCount: p.like_count,
        commentCount: p.comment_count,
        favoriteCount: p.favorite_count,
        shareCount: p.share_count,
        status: p.status,
        isFeatured: !!p.is_featured,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        isFavorited: true,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  } catch (err) {
    console.error('Get my favorites error:', err);
    return c.json(error('SERVER_ERROR', '获取收藏失败'), 500);
  }
});

// ============================================================
// 2. 帖子管理
// ============================================================

/** 获取帖子列表 */
communityRoutes.get('/posts', async (c) => {
  const user = c.get('user');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20')));
  const postType = c.req.query('postType') as string;
  const tags = c.req.query('tags');
  const sort = c.req.query('sort') || 'latest';
  const search = c.req.query('search');
  const status = c.req.query('status') || 'active';

  try {
    const whereClauses: string[] = ['p.status = ?'];
    const params: (string | number)[] = [status];

    if (postType && ['jav', 'anime', 'movie', 'manga', 'novel', 'actress'].includes(postType)) {
      whereClauses.push('p.post_type = ?');
      params.push(postType);
    }

    if (search) {
      whereClauses.push('(p.title LIKE ? OR p.caption LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (tags) {
      const tagList = tags.split(',').filter(t => t.trim());
      if (tagList.length > 0) {
        whereClauses.push(`(${tagList.map(() => 'p.tags LIKE ?').join(' OR ')})`);
        tagList.forEach(tag => params.push(`%"${tag.trim()}"%`));
      }
    }

    let orderBy = 'p.created_at DESC';
    if (sort === 'hot') {
      orderBy = 'p.like_count DESC, p.view_count DESC, p.created_at DESC';
    }

    const whereClause = whereClauses.join(' AND ');

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM community_posts p WHERE ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    const posts = await c.env.DB.prepare(
      `SELECT p.*, u.username as userName
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, (page - 1) * pageSize)
     .all<Record<string, unknown> & { userName: string }>();

    // 批量查询当前用户的点赞/收藏状态
    const likedPostIds = new Set<string>();
    const favoritedPostIds = new Set<string>();
    if (posts.results && posts.results.length > 0) {
      const postIds = posts.results.map(p => p.id);

      const [likesResult, favoritesResult] = await c.env.DB.batch([
        c.env.DB.prepare(
          `SELECT post_id FROM community_likes WHERE user_id = ? AND like_type = 'like' AND post_id IN (${postIds.map(() => '?').join(',')})`
        ).bind(user.userId, ...postIds),
        c.env.DB.prepare(
          `SELECT post_id FROM community_likes WHERE user_id = ? AND like_type = 'favorite' AND post_id IN (${postIds.map(() => '?').join(',')})`
        ).bind(user.userId, ...postIds),
      ]) as unknown as [
        { results: Array<{ post_id: string }> },
        { results: Array<{ post_id: string }> },
      ];

      (likesResult.results || []).forEach(l => likedPostIds.add(l.post_id));
      (favoritesResult.results || []).forEach(f => favoritedPostIds.add(f.post_id));
    }

    const items = (posts.results || []).map(p => ({
      id: p.id,
      userId: p.user_id,
      userName: p.userName,
      postType: p.post_type,
      title: p.title,
      coverImage: p.cover_image,
      contentData: p.content_data,
      caption: p.caption,
      tags: typeof p.tags === 'string' ? JSON.parse(p.tags as string) : p.tags,
      viewCount: p.view_count,
      likeCount: p.like_count,
      commentCount: p.comment_count,
      favoriteCount: p.favorite_count,
      shareCount: p.share_count,
      status: p.status,
      isFeatured: !!p.is_featured,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      isLiked: likedPostIds.has(p.id as string),
      isFavorited: favoritedPostIds.has(p.id as string),
    }));

    return c.json(success({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  } catch (err) {
    console.error('Get posts error:', err);
    return c.json(error('SERVER_ERROR', '获取帖子列表失败'), 500);
  }
});

/** 获取帖子详情 */
communityRoutes.get('/posts/:id', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');

  try {
    const post = await c.env.DB.prepare(
      `SELECT p.*, u.username as userName
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`
    ).bind(postId).first<Record<string, unknown> & { userName: string }>();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    // 增加浏览量
    await c.env.DB.prepare(
      'UPDATE community_posts SET view_count = view_count + 1 WHERE id = ?'
    ).bind(postId).run();

    // 查询当前用户的点赞/收藏状态
    const [likeRecord, favoriteRecord] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT id FROM community_likes WHERE post_id = ? AND user_id = ? AND like_type = 'like'").bind(postId, user.userId),
      c.env.DB.prepare("SELECT id FROM community_likes WHERE post_id = ? AND user_id = ? AND like_type = 'favorite'").bind(postId, user.userId),
    ]) as unknown as [{ results: Array<{ id: string }> }, { results: Array<{ id: string }> }];

    return c.json(success({
      id: post.id,
      userId: post.user_id,
      userName: post.userName,
      postType: post.post_type,
      title: post.title,
      coverImage: post.cover_image,
      contentData: post.content_data,
      caption: post.caption,
      tags: typeof post.tags === 'string' ? JSON.parse(post.tags) : post.tags,
      viewCount: (post.view_count as number) + 1,
      likeCount: post.like_count,
      commentCount: post.comment_count,
      favoriteCount: post.favorite_count,
      shareCount: post.share_count,
      status: post.status,
      isFeatured: !!post.is_featured,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      isLiked: !!likeRecord.results?.length,
      isFavorited: !!favoriteRecord.results?.length,
    }));
  } catch (err) {
    console.error('Get post detail error:', err);
    return c.json(error('SERVER_ERROR', '获取帖子详情失败'), 500);
  }
});

/** 创建帖子 */
communityRoutes.post('/posts', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as CreatePostRequest;
  const { postType, title, coverImage, contentData, caption, tags } = body;

  if (!postType || !['jav', 'anime', 'movie', 'manga', 'novel', 'actress'].includes(postType)) {
    return c.json(error('VALIDATION_ERROR', '无效的帖子类型'), 400);
  }
  if (!title || title.trim().length === 0) {
    return c.json(error('VALIDATION_ERROR', '标题不能为空'), 400);
  }
  if (!coverImage) {
    return c.json(error('VALIDATION_ERROR', '封面图片不能为空'), 400);
  }
  if (!contentData) {
    return c.json(error('VALIDATION_ERROR', '内容数据不能为空'), 400);
  }

  try {
    const id = generateId();
    const now = Date.now();

    // 执行 INSERT（触发器 update_user_stats_after_post 自动更新用户统计）
    await c.env.DB.prepare(
      `INSERT INTO community_posts (id, user_id, post_type, title, cover_image, content_data, caption, tags, view_count, like_count, comment_count, favorite_count, share_count, status, is_featured, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'active', 0, ?, ?)`
    ).bind(id, user.userId, postType, title.trim(), coverImage, typeof contentData === 'string' ? contentData : JSON.stringify(contentData), caption?.trim() || '', JSON.stringify(tags || []), now, now).run();

    return c.json(success({
      id,
      userId: user.userId,
      postType,
      title: title.trim(),
      coverImage,
      contentData: typeof contentData === 'string' ? contentData : JSON.stringify(contentData),
      caption: caption?.trim() || '',
      tags: tags || [],
      status: 'active' as const,
      isFeatured: false,
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      favoriteCount: 0,
      shareCount: 0,
      createdAt: now,
      updatedAt: now,
    }, '发布成功'));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Create post error:', err);
    return c.json(error('SERVER_ERROR', `发布失败: ${errorMessage}`, { rawError: errorMessage }), 500);
  }
});

/** 更新帖子（仅 caption 和 tags） */
communityRoutes.put('/posts/:id', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = await c.req.json() as UpdatePostRequest;

  try {
    const post = await c.env.DB.prepare(
      'SELECT * FROM community_posts WHERE id = ?'
    ).bind(postId).first<Record<string, unknown>>();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    if (post.user_id !== user.userId) {
      return c.json(error('FORBIDDEN', '无权编辑此帖子'), 403);
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (body.caption !== undefined) {
      updates.push('caption = ?');
      params.push(body.caption?.trim() || '');
    }

    if (body.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(body.tags || []));
    }

    if (updates.length === 0) {
      return c.json(error('VALIDATION_ERROR', '没有需要更新的内容'), 400);
    }

    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(postId);

    await c.env.DB.prepare(
      `UPDATE community_posts SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    return c.json(success({ postId, updatedFields: Object.keys(body) }, '更新成功'));
  } catch (err) {
    console.error('Update post error:', err);
    return c.json(error('SERVER_ERROR', '更新失败'), 500);
  }
});

/** 删除帖子（仅作者） */
communityRoutes.delete('/posts/:id', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');

  try {
    const post = await c.env.DB.prepare(
      'SELECT user_id FROM community_posts WHERE id = ?'
    ).bind(postId).first<{ user_id: string }>();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    if (post.user_id !== user.userId) {
      return c.json(error('FORBIDDEN', '无权删除此帖子'), 403);
    }

    await c.env.DB.prepare('DELETE FROM community_posts WHERE id = ?').bind(postId).run();
    return c.json(success(null, '删除成功'));
  } catch (err) {
    console.error('Delete post error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});

/** 更新帖子状态（管理员） */
communityRoutes.put('/posts/:id/status', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = await c.req.json();
  const { status } = body;

  if (!['active', 'pending', 'rejected', 'hidden'].includes(status)) {
    return c.json(error('VALIDATION_ERROR', '无效的状态值'), 400);
  }

  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const post = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    await c.env.DB.prepare(
      'UPDATE community_posts SET status = ?, updated_at = ? WHERE id = ?'
    ).bind(status, Date.now(), postId).run();

    return c.json(success({ postId, status }, '状态更新成功'));
  } catch (err) {
    console.error('Update post status error:', err);
    return c.json(error('SERVER_ERROR', '更新状态失败'), 500);
  }
});

/** 设置/取消推荐（管理员） */
communityRoutes.put('/posts/:id/feature', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = await c.req.json();
  const { isFeatured } = body;

  if (typeof isFeatured !== 'boolean') {
    return c.json(error('VALIDATION_ERROR', 'isFeatured 必须为布尔值'), 400);
  }

  if (!await checkIsAdmin(c.env.DB, user.userId)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const post = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    await c.env.DB.prepare(
      'UPDATE community_posts SET is_featured = ?, updated_at = ? WHERE id = ?'
    ).bind(isFeatured ? 1 : 0, Date.now(), postId).run();

    return c.json(success({ postId, isFeatured }, isFeatured ? '已设为推荐' : '已取消推荐'));
  } catch (err) {
    console.error('Feature post error:', err);
    return c.json(error('SERVER_ERROR', '操作失败'), 500);
  }
});

// ============================================================
// 3. 互动功能 - 点赞 / 收藏（切换）
// ============================================================

/** 点赞/取消点赞 */
communityRoutes.post('/posts/:id/like', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');

  try {
    const post = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    const existing = await c.env.DB.prepare(
      "SELECT id FROM community_likes WHERE post_id = ? AND user_id = ? AND like_type = 'like'"
    ).bind(postId, user.userId).first();

    if (existing) {
      // 取消点赞 — 触发器自动减少计数
      await c.env.DB.prepare('DELETE FROM community_likes WHERE id = ?').bind(existing.id).run();
      return c.json(success({ liked: false }, '取消点赞'));
    } else {
      // 点赞 — 触发器自动增加计数
      const likeId = generateId();
      await c.env.DB.prepare(
        "INSERT INTO community_likes (id, post_id, user_id, like_type, created_at) VALUES (?, ?, ?, 'like', ?)"
      ).bind(likeId, postId, user.userId, Date.now()).run();
      return c.json(success({ liked: true }, '点赞成功'));
    }
  } catch (err) {
    console.error('Like post error:', err);
    return c.json(error('SERVER_ERROR', '操作失败'), 500);
  }
});

/** 收藏/取消收藏 */
communityRoutes.post('/posts/:id/favorite', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');

  try {
    const post = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    const existing = await c.env.DB.prepare(
      "SELECT id FROM community_likes WHERE post_id = ? AND user_id = ? AND like_type = 'favorite'"
    ).bind(postId, user.userId).first();

    if (existing) {
      await c.env.DB.prepare('DELETE FROM community_likes WHERE id = ?').bind(existing.id).run();
      return c.json(success({ favorited: false }, '取消收藏'));
    } else {
      const favId = generateId();
      await c.env.DB.prepare(
        "INSERT INTO community_likes (id, post_id, user_id, like_type, created_at) VALUES (?, ?, ?, 'favorite', ?)"
      ).bind(favId, postId, user.userId, Date.now()).run();
      return c.json(success({ favorited: true }, '收藏成功'));
    }
  } catch (err) {
    console.error('Favorite post error:', err);
    return c.json(error('SERVER_ERROR', '操作失败'), 500);
  }
});

// ============================================================
// 4. 评论功能
// ============================================================

/** 获取帖子评论列表 */
communityRoutes.get('/posts/:id/comments', async (c) => {
  const postId = c.req.param('id');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20')));

  try {
    const postExists = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (!postExists) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    const countResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM community_comments WHERE post_id = ?'
    ).bind(postId).first<{ total: number }>();

    const total = countResult?.total || 0;

    const comments = await c.env.DB.prepare(
      `SELECT c.*, u.username as userName
       FROM community_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ?
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(postId, pageSize, (page - 1) * pageSize)
     .all<Record<string, unknown> & { userName: string }>();

    return c.json(success({
      items: (comments.results || []).map(cm => ({
        id: cm.id,
        postId: cm.post_id,
        userId: cm.user_id,
        userName: cm.userName,
        content: cm.content,
        createdAt: cm.created_at,
        updatedAt: cm.updated_at,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  } catch (err) {
    console.error('Get comments error:', err);
    return c.json(error('SERVER_ERROR', '获取评论失败'), 500);
  }
});

/** 发表评论 */
communityRoutes.post('/comments', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as CreateCommentRequest;
  const { postId, content } = body;

  if (!postId) {
    return c.json(error('VALIDATION_ERROR', '帖子ID不能为空'), 400);
  }
  if (!content || content.trim().length === 0) {
    return c.json(error('VALIDATION_ERROR', '评论内容不能为空'), 400);
  }
  if (content.trim().length > 1000) {
    return c.json(error('VALIDATION_ERROR', '评论内容最多1000个字符'), 400);
  }

  try {
    const post = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    const id = generateId();
    const now = Date.now();

    await c.env.DB.prepare(
      'INSERT INTO community_comments (id, post_id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, postId, user.userId, content.trim(), now, now).run();

    return c.json(success({
      id,
      postId,
      userId: user.userId,
      content: content.trim(),
      createdAt: now,
      updatedAt: now,
    }, '评论成功'));
  } catch (err) {
    console.error('Create comment error:', err);
    return c.json(error('SERVER_ERROR', '评论失败'), 500);
  }
});

/** 删除评论（作者或管理员） */
communityRoutes.delete('/comments/:id', async (c) => {
  const user = c.get('user');
  const commentId = c.req.param('id');

  try {
    const comment = await c.env.DB.prepare(
      'SELECT * FROM community_comments WHERE id = ?'
    ).bind(commentId).first<Record<string, unknown>>();

    if (!comment) {
      return c.json(error('NOT_FOUND', '评论不存在'), 404);
    }

    const isAdmin = await checkIsAdmin(c.env.DB, user.userId);
    if (comment.user_id !== user.userId && !isAdmin) {
      return c.json(error('FORBIDDEN', '无权删除此评论'), 403);
    }

    await c.env.DB.prepare('DELETE FROM community_comments WHERE id = ?').bind(commentId).run();
    return c.json(success(null, '删除成功'));
  } catch (err) {
    console.error('Delete comment error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});

// ============================================================
// 5. 举报功能
// ============================================================

/** 举报帖子 */
communityRoutes.post('/posts/:id/report', async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = await c.req.json() as ReportRequest;
  const { reason, details } = body;

  if (!reason || reason.trim().length === 0) {
    return c.json(error('VALIDATION_ERROR', '请提供举报原因'), 400);
  }

  try {
    const post = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    // 检查是否已举报过
    const existingReport = await c.env.DB.prepare(
      'SELECT id FROM community_reports WHERE post_id = ? AND reporter_user_id = ? AND status = ?'
    ).bind(postId, user.userId, 'pending').first();

    if (existingReport) {
      return c.json(error('DUPLICATE_ERROR', '您已举报过该帖子，请等待处理结果'), 400);
    }

    const reportId = generateId();
    const now = Date.now();

    await c.env.DB.prepare(
      `INSERT INTO community_reports (id, post_id, reporter_user_id, report_reason, report_details, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(reportId, postId, user.userId, reason.trim(), details?.trim() || null, now, now).run();

    return c.json(success({ reportId }, '举报已提交，感谢您的反馈'));
  } catch (err) {
    console.error('Report post error:', err);
    return c.json(error('SERVER_ERROR', '举报失败'), 500);
  }
});

// ============================================================
// 7. 统计
// ============================================================

/** 社区统计（实时查询，社区数据变化频繁不适合缓存） */
communityRoutes.get('/stats', async (c) => {
  try {
    const [totalPostsResult, totalUsersResult, totalCommentsResult, totalLikesResult, totalFavoritesResult, postsByTypeResult, recentActivityResult] =
      await c.env.DB.batch([
        c.env.DB.prepare("SELECT COUNT(*) as count FROM community_posts WHERE status = 'active'"),
        c.env.DB.prepare('SELECT COUNT(DISTINCT user_id) as count FROM community_posts WHERE status = \'active\''),
        c.env.DB.prepare('SELECT COUNT(*) as count FROM community_comments'),
        c.env.DB.prepare('SELECT COALESCE(SUM(like_count), 0) as total FROM community_posts'),
        c.env.DB.prepare('SELECT COALESCE(SUM(favorite_count), 0) as total FROM community_posts'),
        c.env.DB.prepare(`
          SELECT post_type as type, COUNT(*) as count
          FROM community_posts WHERE status = 'active'
          GROUP BY post_type ORDER BY count DESC
        `),
        c.env.DB.prepare(`
          SELECT id, post_type as type, title, created_at
          FROM community_posts WHERE status = 'active'
          ORDER BY created_at DESC LIMIT 10
        `),
      ]) as unknown as [
        { results: Array<{ count: number }> },
        { results: Array<{ count: number }> },
        { results: Array<{ count: number }> },
        { results: Array<{ total: number }> },
        { results: Array<{ total: number }> },
        { results: Array<{ post_type: string; count: number }> },
        { results: Array<{ id: string; post_type: string; title: string; created_at: number }> },
      ];

    const totalPosts = totalPostsResult.results?.[0]?.count || 0;
    const totalUsers = totalUsersResult.results?.[0]?.count || 0;
    const totalComments = totalCommentsResult.results?.[0]?.count || 0;
    const totalLikes = totalLikesResult.results?.[0]?.total || 0;
    const totalFavorites = totalFavoritesResult.results?.[0]?.total || 0;
    const averageEngagement = totalPosts > 0
      ? Math.round(((totalLikes + totalFavorites + totalComments) / totalPosts) * 100) / 100
      : 0;

    return c.json(success({
      totalPosts,
      totalUsers,
      totalComments,
      totalLikes,
      totalFavorites,
      averageEngagement,
      postsByType: (postsByTypeResult.results || []).map(item => ({
        type: (item as Record<string, unknown>).post_type || '',
        count: (item as Record<string, unknown>).count || 0,
      })),
      recentActivity: (recentActivityResult.results || []).map(item => ({
        id: item.id,
        type: item.post_type || '',
        title: item.title || '',
        createdAt: item.created_at,
      })),
    }));
  } catch (err) {
    console.error('Get community stats error:', err);
    return c.json(error('SERVER_ERROR', '获取社区统计失败'), 500);
  }
});

/** 当前用户统计（由触发器自动维护 community_user_stats 表） */
communityRoutes.get('/user-stats', async (c) => {
  const user = c.get('user');

  try {
    // 直接读取触发器维护的统计表
    const stats = await c.env.DB.prepare(
      `SELECT * FROM community_user_stats WHERE user_id = ?`
    ).bind(user.userId).first<Record<string, unknown>>();

    const recentPosts = await c.env.DB.prepare(
      `SELECT * FROM community_posts
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at DESC LIMIT 5`
    ).bind(user.userId).all<Record<string, unknown>>();

    return c.json(success({
      postsCount: (stats?.posts_count as number) || 0,
      likesReceived: (stats?.likes_received as number) || 0,
      favoritesReceived: (stats?.favorites_received as number) || 0,
      commentsCount: (stats?.comments_count as number) || 0,
      reputationScore: (stats?.reputation_score as number) || 0,
      contributionLevel: (stats?.contribution_level as string) || 'beginner',
      recentPosts: (recentPosts.results || []).map(p => ({
        id: p.id,
        userId: p.user_id,
        postType: p.post_type,
        title: p.title,
        coverImage: p.cover_image,
        caption: p.caption,
        tags: typeof p.tags === 'string' ? JSON.parse(p.tags as string) : p.tags,
        viewCount: p.view_count,
        likeCount: p.like_count,
        commentCount: p.comment_count,
        favoriteCount: p.favorite_count,
        shareCount: p.share_count,
        status: p.status,
        isFeatured: !!p.is_featured,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    }));
  } catch (err) {
    console.error('Get user stats error:', err);
    return c.json(error('SERVER_ERROR', '获取用户统计失败'), 500);
  }
});

// ============================================================
// 8. 通知
// ============================================================

/** 获取通知列表 */
communityRoutes.get('/notifications', async (c) => {
  const user = c.get('user');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20')));
  const offset = (page - 1) * pageSize;

  try {
    // 获取用户发布的所有帖子
    const myPosts = await c.env.DB.prepare(
      'SELECT id, title, cover_image FROM community_posts WHERE user_id = ?'
    ).bind(user.userId).all<{ id: string; title: string; cover_image: string }>();

    const myPostIds = (myPosts.results || []).map(p => p.id);
    const postInfoMap: Record<string, { title: string; coverImage: string }> = {};
    (myPosts.results || []).forEach(p => { postInfoMap[p.id] = { title: p.title, coverImage: p.cover_image }; });

    if (myPostIds.length === 0) {
      return c.json(success({
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      }));
    }

    const inClause = myPostIds.map(() => '?').join(',');

    // 并行查询各类事件
    const [likesResult, commentsResult, favoritesResult, reportsResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT l.id, l.post_id, l.user_id as actor_id, u.username as actor_name, l.created_at
        FROM community_likes l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.post_id IN (${inClause}) AND l.like_type = 'like' AND l.user_id != ?
        ORDER BY l.created_at DESC LIMIT 200
      `).bind(...myPostIds, user.userId),
      c.env.DB.prepare(`
        SELECT c.id, c.post_id, c.user_id as actor_id, u.username as actor_name, c.content, c.created_at
        FROM community_comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id IN (${inClause}) AND c.user_id != ?
        ORDER BY c.created_at DESC LIMIT 200
      `).bind(...myPostIds, user.userId),
      c.env.DB.prepare(`
        SELECT f.id, f.post_id, f.user_id as actor_id, u.username as actor_name, f.created_at
        FROM community_likes f
        LEFT JOIN users u ON f.user_id = u.id
        WHERE f.post_id IN (${inClause}) AND f.like_type = 'favorite' AND f.user_id != ?
        ORDER BY f.created_at DESC LIMIT 200
      `).bind(...myPostIds, user.userId),
      c.env.DB.prepare(`
        SELECT r.id, r.post_id, r.status, r.report_reason, r.updated_at as created_at
        FROM community_reports r
        WHERE r.post_id IN (${inClause}) AND r.status != 'pending'
        ORDER BY r.updated_at DESC LIMIT 100
      `).bind(...myPostIds),
    ]) as unknown as [
      { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; created_at: number }> },
      { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; content: string; created_at: number }> },
      { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; created_at: number }> },
      { results: Array<{ id: string; post_id: string; status: string; report_reason: string; created_at: number }> },
    ];

    const allNotifications = [
      ...(likesResult.results || []).map(n => ({
        id: `like_${n.id}`,
        type: 'like' as const,
        postId: n.post_id,
        postTitle: postInfoMap[n.post_id]?.title || '',
        postCoverImage: postInfoMap[n.post_id]?.coverImage || '',
        actorName: n.actor_name || '匿名用户',
        content: '点赞了你的帖子',
        createdAt: n.created_at,
        isRead: false,
      })),
      ...(commentsResult.results || []).map(n => ({
        id: `comment_${n.id}`,
        type: 'comment' as const,
        postId: n.post_id,
        postTitle: postInfoMap[n.post_id]?.title || '',
        postCoverImage: postInfoMap[n.post_id]?.coverImage || '',
        actorName: n.actor_name || '匿名用户',
        content: `评论了你的帖子：${n.content.slice(0, 50)}${n.content.length > 50 ? '...' : ''}`,
        createdAt: n.created_at,
        isRead: false,
      })),
      ...(favoritesResult.results || []).map(n => ({
        id: `favorite_${n.id}`,
        type: 'favorite' as const,
        postId: n.post_id,
        postTitle: postInfoMap[n.post_id]?.title || '',
        postCoverImage: postInfoMap[n.post_id]?.coverImage || '',
        actorName: n.actor_name || '匿名用户',
        content: '收藏了你的帖子',
        createdAt: n.created_at,
        isRead: false,
      })),
      ...(reportsResult.results || []).map(n => ({
        id: `report_${n.id}`,
        type: 'report_resolved' as const,
        postId: n.post_id,
        postTitle: postInfoMap[n.post_id]?.title || '',
        postCoverImage: postInfoMap[n.post_id]?.coverImage || '',
        actorName: undefined,
        content: `对举报"${n.report_reason}"的处理结果：${n.status === 'resolved' ? '已解决' : '已驳回'}`,
        createdAt: n.created_at,
        isRead: false,
      })),
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
