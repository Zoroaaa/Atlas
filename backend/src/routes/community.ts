/**
 * 社区模块路由
 * 功能：资源分享（帖子/标签/评论/点赞/收藏/举报/统计/通知）
 * 版本：3.0 - 从搜索源分享重构为资源分享
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error, generateId } from '@/utils';
import { authMiddleware, checkIsAdmin } from '@/middleware/auth';
import { validateBody, schemas } from '@/validation';
import {
  listActiveTags,
  findTagIdByName,
  insertTag,
  findTagById,
  findDuplicateTagName,
  updateTagFields,
  countPostsByTagPattern,
  deleteTag,
  countUserPosts,
  listUserPosts,
  countFavoritePosts,
  listFavoritePosts,
  listPosts,
  findPostWithUserById,
  incrementPostViewCount,
  findPostInteractionState,
  insertPost,
  findPostById,
  updatePostFields,
  findPostOwnerId,
  postExists,
  deletePost,
  updatePostStatus,
  updatePostFeatured,
  findPostLike,
  insertPostLike,
  deletePostLikeById,
  countPostComments,
  listPostComments,
  insertComment,
  findCommentById,
  deleteComment,
  findPendingReport,
  insertReport,
  queryCommunityStats,
  findUserCommunityStats,
  listUserRecentPosts,
  listMyPostBriefs,
  queryNotificationEvents,
} from '@/repositories/community-repository';

export const communityRoutes = new Hono<{ Bindings: Env }>();

communityRoutes.use('*', authMiddleware);

// ============================================================
// 1. 标签管理
// ============================================================

/** 获取所有活跃标签 */
communityRoutes.get('/tags', async (c) => {
  try {
    const tags = await listActiveTags(c.env.DB);

    return c.json(success(
      tags.map(t => ({
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
communityRoutes.post('/tags', validateBody(schemas.community.createTag), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.community.createTag>;
  const { name, description, color } = body;

  if (name.trim().length === 0) {
    return c.json(error('VALIDATION_ERROR', '标签名称不能为空'), 400);
  }

  try {
    const existing = await findTagIdByName(c.env.DB, name.trim());

    if (existing) {
      return c.json(error('DUPLICATE_ERROR', '标签已存在'), 400);
    }

    const id = generateId();
    const now = Date.now();

    await insertTag(c.env.DB, {
      id,
      name: name.trim(),
      description: description || null,
      color: color || '#3b82f6',
      createdBy: user.userId,
      now,
    });

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
    const tag = await findTagById(c.env.DB, tagId);

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
communityRoutes.put('/tags/:id', validateBody(schemas.community.updateTag), async (c) => {
  const tagId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.community.updateTag>;
  const { name, description, color, isActive } = body;

  try {
    const existingTag = await findTagById(c.env.DB, tagId);

    if (!existingTag) {
      return c.json(error('NOT_FOUND', '标签不存在'), 404);
    }

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 20) {
        return c.json(error('VALIDATION_ERROR', '标签名称长度必须在2-20个字符之间'), 400);
      }

      const duplicateTag = await findDuplicateTagName(c.env.DB, { name: trimmedName, excludeId: tagId });

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

    if (color !== undefined) {
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

    await updateTagFields(c.env.DB, { updates, params });

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
    const existingTag = await findTagById(c.env.DB, tagId);

    if (!existingTag) {
      return c.json(error('NOT_FOUND', '标签不存在'), 404);
    }

    if (existingTag.created_by !== user.userId) {
      return c.json(error('FORBIDDEN', '无权删除此标签'), 403);
    }

    // 检查是否有帖子使用该标签
    const usageCount = await countPostsByTagPattern(c.env.DB, `%"${existingTag.tag_name}"%`);

    if (usageCount > 0) {
      return c.json(error('VALIDATION_ERROR', '不能删除正在使用的标签'), 400);
    }

    await deleteTag(c.env.DB, tagId);

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
    const statusFilter = status && ['active', 'pending', 'rejected', 'hidden'].includes(status) ? status : null;

    const total = await countUserPosts(c.env.DB, { userId: user.userId, status: statusFilter });

    const rows = await listUserPosts(c.env.DB, {
      userId: user.userId,
      status: statusFilter,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return c.json(success({
      items: rows.map(p => ({
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
    const total = await countFavoritePosts(c.env.DB, user.userId);

    const rows = await listFavoritePosts(c.env.DB, {
      userId: user.userId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return c.json(success({
      items: rows.map(p => ({
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
    const { total, rows, likedPostIds, favoritedPostIds } = await listPosts(c.env.DB, {
      userId: user.userId,
      status,
      postType,
      tags,
      search,
      sort,
      page,
      pageSize,
    });

    // 当前用户的点赞/收藏状态
    const likedSet = new Set(likedPostIds);
    const favoritedSet = new Set(favoritedPostIds);

    const items = rows.map(p => ({
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
      isLiked: likedSet.has(p.id as string),
      isFavorited: favoritedSet.has(p.id as string),
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
    const post = await findPostWithUserById(c.env.DB, postId);

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    // 增加浏览量
    await incrementPostViewCount(c.env.DB, postId);

    // 查询当前用户的点赞/收藏状态
    const interaction = await findPostInteractionState(c.env.DB, { postId, userId: user.userId });

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
      isLiked: interaction.liked,
      isFavorited: interaction.favorited,
    }));
  } catch (err) {
    console.error('Get post detail error:', err);
    return c.json(error('SERVER_ERROR', '获取帖子详情失败'), 500);
  }
});

/** 创建帖子 */
communityRoutes.post('/posts', validateBody(schemas.community.createPost), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.community.createPost>;
  const { postType, title, coverImage, contentData, caption, tags } = body;

  if (title.trim().length === 0) {
    return c.json(error('VALIDATION_ERROR', '标题不能为空'), 400);
  }

  try {
    const id = generateId();
    const now = Date.now();
    const contentDataStr = typeof contentData === 'string' ? contentData : JSON.stringify(contentData);

    // 执行 INSERT（触发器 update_user_stats_after_post 自动更新用户统计）
    await insertPost(c.env.DB, {
      id,
      userId: user.userId,
      postType,
      title: title.trim(),
      coverImage,
      contentData: contentDataStr,
      caption: caption?.trim() || '',
      tags: JSON.stringify(tags || []),
      now,
    });

    return c.json(success({
      id,
      userId: user.userId,
      postType,
      title: title.trim(),
      coverImage,
      contentData: contentDataStr,
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
communityRoutes.put('/posts/:id', validateBody(schemas.community.updatePost), async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.community.updatePost>;

  try {
    const post = await findPostById(c.env.DB, postId);

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

    await updatePostFields(c.env.DB, { updates, params });

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
    const post = await findPostOwnerId(c.env.DB, postId);

    if (!post) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    if (post.user_id !== user.userId) {
      return c.json(error('FORBIDDEN', '无权删除此帖子'), 403);
    }

    await deletePost(c.env.DB, postId);
    return c.json(success(null, '删除成功'));
  } catch (err) {
    console.error('Delete post error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});

/** 更新帖子状态（管理员） */
communityRoutes.put('/posts/:id/status', validateBody(schemas.community.updatePostStatus), async (c) => {
  const postId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.community.updatePostStatus>;
  const { status } = body;

  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const exists = await postExists(c.env.DB, postId);

    if (!exists) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    await updatePostStatus(c.env.DB, { postId, status, now: Date.now() });

    return c.json(success({ postId, status }, '状态更新成功'));
  } catch (err) {
    console.error('Update post status error:', err);
    return c.json(error('SERVER_ERROR', '更新状态失败'), 500);
  }
});

/** 设置/取消推荐（管理员） */
communityRoutes.put('/posts/:id/feature', validateBody(schemas.community.featurePost), async (c) => {
  const postId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.community.featurePost>;
  const { isFeatured } = body;

  if (!await checkIsAdmin(c)) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  try {
    const exists = await postExists(c.env.DB, postId);

    if (!exists) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    await updatePostFeatured(c.env.DB, { postId, isFeatured, now: Date.now() });

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
    const exists = await postExists(c.env.DB, postId);

    if (!exists) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    const existing = await findPostLike(c.env.DB, { postId, userId: user.userId, likeType: 'like' });

    if (existing) {
      // 取消点赞 — 触发器自动减少计数
      await deletePostLikeById(c.env.DB, existing.id);
      return c.json(success({ liked: false }, '取消点赞'));
    } else {
      // 点赞 — 触发器自动增加计数
      const likeId = generateId();
      await insertPostLike(c.env.DB, { id: likeId, postId, userId: user.userId, likeType: 'like', now: Date.now() });
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
    const exists = await postExists(c.env.DB, postId);

    if (!exists) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    const existing = await findPostLike(c.env.DB, { postId, userId: user.userId, likeType: 'favorite' });

    if (existing) {
      await deletePostLikeById(c.env.DB, existing.id);
      return c.json(success({ favorited: false }, '取消收藏'));
    } else {
      const favId = generateId();
      await insertPostLike(c.env.DB, { id: favId, postId, userId: user.userId, likeType: 'favorite', now: Date.now() });
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
    const postExistsFlag = await postExists(c.env.DB, postId);

    if (!postExistsFlag) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    const total = await countPostComments(c.env.DB, postId);

    const comments = await listPostComments(c.env.DB, {
      postId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return c.json(success({
      items: comments.map(cm => ({
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
communityRoutes.post('/comments', validateBody(schemas.community.createComment), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.community.createComment>;
  const { postId, content } = body;

  if (content.trim().length === 0) {
    return c.json(error('VALIDATION_ERROR', '评论内容不能为空'), 400);
  }
  if (content.trim().length > 1000) {
    return c.json(error('VALIDATION_ERROR', '评论内容最多1000个字符'), 400);
  }

  try {
    const postExistsFlag = await postExists(c.env.DB, postId);

    if (!postExistsFlag) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    const id = generateId();
    const now = Date.now();

    await insertComment(c.env.DB, { id, postId, userId: user.userId, content: content.trim(), now });

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
    const comment = await findCommentById(c.env.DB, commentId);

    if (!comment) {
      return c.json(error('NOT_FOUND', '评论不存在'), 404);
    }

    const isAdmin = await checkIsAdmin(c);
    if (comment.user_id !== user.userId && !isAdmin) {
      return c.json(error('FORBIDDEN', '无权删除此评论'), 403);
    }

    await deleteComment(c.env.DB, commentId);
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
communityRoutes.post('/posts/:id/report', validateBody(schemas.community.reportPost), async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.community.reportPost>;
  const { reason, details } = body;

  if (reason.trim().length === 0) {
    return c.json(error('VALIDATION_ERROR', '请提供举报原因'), 400);
  }

  try {
    const postExistsFlag = await postExists(c.env.DB, postId);

    if (!postExistsFlag) {
      return c.json(error('NOT_FOUND', '帖子不存在'), 404);
    }

    // 检查是否已举报过
    const existingReport = await findPendingReport(c.env.DB, { postId, userId: user.userId });

    if (existingReport) {
      return c.json(error('DUPLICATE_ERROR', '您已举报过该帖子，请等待处理结果'), 400);
    }

    const reportId = generateId();
    const now = Date.now();

    await insertReport(c.env.DB, {
      id: reportId,
      postId,
      userId: user.userId,
      reason: reason.trim(),
      details: details?.trim() || null,
      now,
    });

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
    const {
      totalPostsResult,
      totalUsersResult,
      totalCommentsResult,
      totalLikesResult,
      totalFavoritesResult,
      postsByTypeResult,
      recentActivityResult,
    } = await queryCommunityStats(c.env.DB);

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
    const stats = await findUserCommunityStats(c.env.DB, user.userId);

    const recentPosts = await listUserRecentPosts(c.env.DB, { userId: user.userId, limit: 5 });

    return c.json(success({
      postsCount: (stats?.posts_count as number) || 0,
      likesReceived: (stats?.likes_received as number) || 0,
      favoritesReceived: (stats?.favorites_received as number) || 0,
      commentsCount: (stats?.comments_count as number) || 0,
      reputationScore: (stats?.reputation_score as number) || 0,
      contributionLevel: (stats?.contribution_level as string) || 'beginner',
      recentPosts: recentPosts.map(p => ({
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
    const myPosts = await listMyPostBriefs(c.env.DB, user.userId);

    const myPostIds = myPosts.map(p => p.id);
    const postInfoMap: Record<string, { title: string; coverImage: string }> = {};
    myPosts.forEach(p => { postInfoMap[p.id] = { title: p.title, coverImage: p.cover_image }; });

    if (myPostIds.length === 0) {
      return c.json(success({
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      }));
    }

    // 并行查询各类事件
    const { likesResult, commentsResult, favoritesResult, reportsResult } =
      await queryNotificationEvents(c.env.DB, { postIds: myPostIds, userId: user.userId });

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