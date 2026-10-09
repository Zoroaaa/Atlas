/**
 * 社区数据访问层
 *
 * 收口 community_tags / community_posts / community_comments / community_likes /
 * community_reports / community_user_stats 的读写，使 community 路由不再直接持有 SQL。
 * 需要原子性的多语句操作（batch）在此整体提供，避免拆分后丢失原子性。
 */
import type { CommunityUserStats } from '@/types';

/** 帖子行（community_posts 查询结果；联表查询时可附带作者 username） */
export type CommunityPostRow = Record<string, unknown> & { userName?: string | null };

/** 评论行（community_comments 查询结果；联表查询时附带作者 username） */
export type CommunityCommentRow = Record<string, unknown> & { userName?: string | null };

/** SQL 绑定值 */
type SqlValue = string | number | boolean | null;

// ===========================================================================
// community_tags
// ===========================================================================

/** 查询所有活跃标签（附带使用该标签的活跃帖子数） */
export async function listActiveTags(db: D1Database): Promise<Array<Record<string, unknown>>> {
  const rows = await db
    .prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM community_posts p WHERE p.status = 'active' AND p.tags LIKE '%' || t.tag_name || '%') as posts_count
       FROM community_tags t
       WHERE t.tag_active = 1
       ORDER BY tag_name ASC`
    )
    .all<Record<string, unknown>>();
  return rows.results || [];
}

/** 按标签名查询标签 id（用于创建时的重名校验） */
export async function findTagIdByName(db: D1Database, name: string): Promise<{ id: string } | null> {
  return db.prepare('SELECT id FROM community_tags WHERE tag_name = ?').bind(name).first<{ id: string }>();
}

/** 新增标签（创建时即置为启用） */
export async function insertTag(
  db: D1Database,
  params: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    createdBy: string;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO community_tags (id, tag_name, tag_description, tag_color, tag_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .bind(params.id, params.name, params.description, params.color, params.createdBy, params.now, params.now)
    .run();
}

/** 按 id 查询标签完整行 */
export async function findTagById(db: D1Database, id: string): Promise<Record<string, unknown> | null> {
  return db.prepare('SELECT * FROM community_tags WHERE id = ?').bind(id).first<Record<string, unknown>>();
}

/** 查询同名（忽略大小写）的其他标签 */
export async function findDuplicateTagName(
  db: D1Database,
  opts: { name: string; excludeId: string }
): Promise<{ id: string } | null> {
  return db
    .prepare('SELECT id FROM community_tags WHERE LOWER(tag_name) = LOWER(?) AND id != ?')
    .bind(opts.name, opts.excludeId)
    .first<{ id: string }>();
}

/** 更新标签指定字段（字段列表与绑定值由调用方按顺序构造，含 updated_at 与 id） */
export async function updateTagFields(
  db: D1Database,
  opts: { updates: string[]; params: SqlValue[] }
): Promise<void> {
  await db
    .prepare(`UPDATE community_tags SET ${opts.updates.join(', ')} WHERE id = ?`)
    .bind(...opts.params)
    .run();
}

/** 统计使用某标签的帖子数（按 LIKE 模式匹配 tags 字段） */
export async function countPostsByTagPattern(db: D1Database, pattern: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as cnt FROM community_posts WHERE tags LIKE ?')
    .bind(pattern)
    .first<{ cnt: number }>();
  return row?.cnt || 0;
}

/** 删除标签 */
export async function deleteTag(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM community_tags WHERE id = ?').bind(id).run();
}

// ===========================================================================
// community_posts
// ===========================================================================

/** 构造「我的帖子」过滤条件（所属用户 + 可选状态） */
function userPostFilter(opts: { userId: string; status?: string | null }): {
  clause: string;
  params: Array<string | number>;
} {
  let clause = 'WHERE user_id = ?';
  const params: Array<string | number> = [opts.userId];
  if (opts.status) {
    clause += ' AND status = ?';
    params.push(opts.status);
  }
  return { clause, params };
}

/** 统计某用户的帖子总数（可选按状态过滤） */
export async function countUserPosts(
  db: D1Database,
  opts: { userId: string; status?: string | null }
): Promise<number> {
  const { clause, params } = userPostFilter(opts);
  const row = await db
    .prepare(`SELECT COUNT(*) as total FROM community_posts ${clause}`)
    .bind(...params)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询某用户的帖子（按创建时间倒序） */
export async function listUserPosts(
  db: D1Database,
  opts: { userId: string; status?: string | null; limit: number; offset: number }
): Promise<CommunityPostRow[]> {
  const { clause, params } = userPostFilter(opts);
  const rows = await db
    .prepare(`SELECT * FROM community_posts ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, opts.limit, opts.offset)
    .all<CommunityPostRow>();
  return rows.results || [];
}

/** 统计用户收藏的活跃帖子总数 */
export async function countFavoritePosts(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as total FROM community_likes l
       JOIN community_posts p ON l.post_id = p.id
       WHERE l.user_id = ? AND l.like_type = 'favorite' AND p.status = 'active'`
    )
    .bind(userId)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询用户收藏的帖子（含作者名，按收藏时间倒序） */
export async function listFavoritePosts(
  db: D1Database,
  opts: { userId: string; limit: number; offset: number }
): Promise<CommunityPostRow[]> {
  const rows = await db
    .prepare(
      `SELECT p.*, u.username as userName
       FROM community_likes l
       JOIN community_posts p ON l.post_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE l.user_id = ? AND l.like_type = 'favorite' AND p.status = 'active'
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(opts.userId, opts.limit, opts.offset)
    .all<CommunityPostRow>();
  return rows.results || [];
}

/**
 * 帖子列表：按状态/类型/关键词/标签筛选并排序，附带当前用户点赞/收藏状态
 * @returns total 总数、rows 当前页帖子、likedPostIds / favoritedPostIds 当前用户已互动的帖子 id
 */
export async function listPosts(
  db: D1Database,
  opts: {
    userId: string;
    status: string;
    postType?: string;
    tags?: string;
    search?: string;
    sort: string;
    page: number;
    pageSize: number;
  }
): Promise<{ total: number; rows: CommunityPostRow[]; likedPostIds: string[]; favoritedPostIds: string[] }> {
  const whereClauses: string[] = ['p.status = ?'];
  const params: Array<string | number> = [opts.status];

  if (opts.postType && ['jav', 'anime', 'movie', 'manga', 'novel', 'actress'].includes(opts.postType)) {
    whereClauses.push('p.post_type = ?');
    params.push(opts.postType);
  }

  if (opts.search) {
    whereClauses.push('(p.title LIKE ? OR p.caption LIKE ?)');
    const searchTerm = `%${opts.search}%`;
    params.push(searchTerm, searchTerm);
  }

  if (opts.tags) {
    const tagList = opts.tags.split(',').filter(t => t.trim());
    if (tagList.length > 0) {
      whereClauses.push(`(${tagList.map(() => 'p.tags LIKE ?').join(' OR ')})`);
      tagList.forEach(tag => params.push(`%"${tag.trim()}"%`));
    }
  }

  let orderBy = 'p.created_at DESC';
  if (opts.sort === 'hot') {
    orderBy = 'p.like_count DESC, p.view_count DESC, p.created_at DESC';
  }

  const whereClause = whereClauses.join(' AND ');

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM community_posts p WHERE ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();
  const total = countResult?.total || 0;

  const posts = await db
    .prepare(
      `SELECT p.*, u.username as userName
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .bind(...params, opts.pageSize, (opts.page - 1) * opts.pageSize)
    .all<CommunityPostRow>();
  const rows = posts.results || [];

  const likedPostIds: string[] = [];
  const favoritedPostIds: string[] = [];
  if (rows.length > 0) {
    const postIds = rows.map(p => p.id as string);
    const [likesResult, favoritesResult] = await db.batch([
      db
        .prepare(
          `SELECT post_id FROM community_likes WHERE user_id = ? AND like_type = 'like' AND post_id IN (${postIds.map(() => '?').join(',')})`
        )
        .bind(opts.userId, ...postIds),
      db
        .prepare(
          `SELECT post_id FROM community_likes WHERE user_id = ? AND like_type = 'favorite' AND post_id IN (${postIds.map(() => '?').join(',')})`
        )
        .bind(opts.userId, ...postIds),
    ]) as unknown as [{ results: Array<{ post_id: string }> }, { results: Array<{ post_id: string }> }];

    (likesResult.results || []).forEach(l => likedPostIds.push(l.post_id));
    (favoritesResult.results || []).forEach(f => favoritedPostIds.push(f.post_id));
  }

  return { total, rows, likedPostIds, favoritedPostIds };
}

/** 按 id 查询帖子（含作者名） */
export async function findPostWithUserById(db: D1Database, id: string): Promise<CommunityPostRow | null> {
  return db
    .prepare(
      `SELECT p.*, u.username as userName
       FROM community_posts p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`
    )
    .bind(id)
    .first<CommunityPostRow>();
}

/** 帖子浏览量 +1 */
export async function incrementPostViewCount(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE community_posts SET view_count = view_count + 1 WHERE id = ?').bind(id).run();
}

/** 查询当前用户对某帖子的点赞/收藏状态（一次 batch） */
export async function findPostInteractionState(
  db: D1Database,
  opts: { postId: string; userId: string }
): Promise<{ liked: boolean; favorited: boolean }> {
  const [likeRecord, favoriteRecord] = await db.batch([
    db
      .prepare("SELECT id FROM community_likes WHERE post_id = ? AND user_id = ? AND like_type = 'like'")
      .bind(opts.postId, opts.userId),
    db
      .prepare("SELECT id FROM community_likes WHERE post_id = ? AND user_id = ? AND like_type = 'favorite'")
      .bind(opts.postId, opts.userId),
  ]) as unknown as [{ results: Array<{ id: string }> }, { results: Array<{ id: string }> }];

  return {
    liked: !!likeRecord.results?.length,
    favorited: !!favoriteRecord.results?.length,
  };
}

/** 新增帖子（计数列与状态由 SQL 初始化，后续由触发器维护） */
export async function insertPost(
  db: D1Database,
  params: {
    id: string;
    userId: string;
    postType: string;
    title: string;
    coverImage: string;
    contentData: string;
    caption: string;
    tags: string;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO community_posts (id, user_id, post_type, title, cover_image, content_data, caption, tags, view_count, like_count, comment_count, favorite_count, share_count, status, is_featured, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'active', 0, ?, ?)`
    )
    .bind(
      params.id,
      params.userId,
      params.postType,
      params.title,
      params.coverImage,
      params.contentData,
      params.caption,
      params.tags,
      params.now,
      params.now
    )
    .run();
}

/** 按 id 查询帖子完整行 */
export async function findPostById(db: D1Database, id: string): Promise<Record<string, unknown> | null> {
  return db.prepare('SELECT * FROM community_posts WHERE id = ?').bind(id).first<Record<string, unknown>>();
}

/** 更新帖子指定字段（字段列表与绑定值由调用方按顺序构造，含 updated_at 与 id） */
export async function updatePostFields(
  db: D1Database,
  opts: { updates: string[]; params: Array<string | number> }
): Promise<void> {
  await db
    .prepare(`UPDATE community_posts SET ${opts.updates.join(', ')} WHERE id = ?`)
    .bind(...opts.params)
    .run();
}

/** 按 id 查询帖子作者 id */
export async function findPostOwnerId(db: D1Database, id: string): Promise<{ user_id: string } | null> {
  return db.prepare('SELECT user_id FROM community_posts WHERE id = ?').bind(id).first<{ user_id: string }>();
}

/** 帖子是否存在 */
export async function postExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM community_posts WHERE id = ?').bind(id).first();
  return !!row;
}

/** 删除帖子 */
export async function deletePost(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM community_posts WHERE id = ?').bind(id).run();
}

/** 更新帖子状态（管理员审核） */
export async function updatePostStatus(
  db: D1Database,
  opts: { postId: string; status: string; now: number }
): Promise<void> {
  await db
    .prepare('UPDATE community_posts SET status = ?, updated_at = ? WHERE id = ?')
    .bind(opts.status, opts.now, opts.postId)
    .run();
}

/** 设置/取消帖子推荐 */
export async function updatePostFeatured(
  db: D1Database,
  opts: { postId: string; isFeatured: boolean; now: number }
): Promise<void> {
  await db
    .prepare('UPDATE community_posts SET is_featured = ?, updated_at = ? WHERE id = ?')
    .bind(opts.isFeatured ? 1 : 0, opts.now, opts.postId)
    .run();
}

// ===========================================================================
// community_likes（点赞 / 收藏）
// ===========================================================================

/** 查询用户对帖子的某类互动记录（like / favorite） */
export async function findPostLike(
  db: D1Database,
  opts: { postId: string; userId: string; likeType: string }
): Promise<{ id: string } | null> {
  return db
    .prepare('SELECT id FROM community_likes WHERE post_id = ? AND user_id = ? AND like_type = ?')
    .bind(opts.postId, opts.userId, opts.likeType)
    .first<{ id: string }>();
}

/** 新增点赞/收藏记录 */
export async function insertPostLike(
  db: D1Database,
  params: { id: string; postId: string; userId: string; likeType: string; now: number }
): Promise<void> {
  await db
    .prepare('INSERT INTO community_likes (id, post_id, user_id, like_type, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(params.id, params.postId, params.userId, params.likeType, params.now)
    .run();
}

/** 按 id 删除点赞/收藏记录 */
export async function deletePostLikeById(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM community_likes WHERE id = ?').bind(id).run();
}

// ===========================================================================
// community_comments
// ===========================================================================

/** 统计帖子评论数 */
export async function countPostComments(db: D1Database, postId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as total FROM community_comments WHERE post_id = ?')
    .bind(postId)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询帖子评论（含作者名，按创建时间倒序） */
export async function listPostComments(
  db: D1Database,
  opts: { postId: string; limit: number; offset: number }
): Promise<CommunityCommentRow[]> {
  const rows = await db
    .prepare(
      `SELECT c.*, u.username as userName
       FROM community_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ?
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(opts.postId, opts.limit, opts.offset)
    .all<CommunityCommentRow>();
  return rows.results || [];
}

/** 新增评论 */
export async function insertComment(
  db: D1Database,
  params: { id: string; postId: string; userId: string; content: string; now: number }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO community_comments (id, post_id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(params.id, params.postId, params.userId, params.content, params.now, params.now)
    .run();
}

/** 按 id 查询评论完整行 */
export async function findCommentById(db: D1Database, id: string): Promise<Record<string, unknown> | null> {
  return db.prepare('SELECT * FROM community_comments WHERE id = ?').bind(id).first<Record<string, unknown>>();
}

/** 删除评论 */
export async function deleteComment(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM community_comments WHERE id = ?').bind(id).run();
}

// ===========================================================================
// community_reports
// ===========================================================================

/** 查询用户对某帖子的待处理举报记录 */
export async function findPendingReport(
  db: D1Database,
  opts: { postId: string; userId: string }
): Promise<{ id: string } | null> {
  return db
    .prepare('SELECT id FROM community_reports WHERE post_id = ? AND reporter_user_id = ? AND status = ?')
    .bind(opts.postId, opts.userId, 'pending')
    .first<{ id: string }>();
}

/** 新增举报（状态初始为 pending） */
export async function insertReport(
  db: D1Database,
  params: { id: string; postId: string; userId: string; reason: string; details: string | null; now: number }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO community_reports (id, post_id, reporter_user_id, report_reason, report_details, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .bind(params.id, params.postId, params.userId, params.reason, params.details, params.now, params.now)
    .run();
}

// ===========================================================================
// 统计
// ===========================================================================

/** 社区总览统计（一次 batch：帖子/用户/评论/点赞/收藏/类型分布/最近动态） */
export async function queryCommunityStats(db: D1Database): Promise<{
  totalPostsResult: { results: Array<{ count: number }> };
  totalUsersResult: { results: Array<{ count: number }> };
  totalCommentsResult: { results: Array<{ count: number }> };
  totalLikesResult: { results: Array<{ total: number }> };
  totalFavoritesResult: { results: Array<{ total: number }> };
  postsByTypeResult: { results: Array<{ post_type: string; count: number }> };
  recentActivityResult: { results: Array<{ id: string; post_type: string; title: string; created_at: number }> };
}> {
  const [
    totalPostsResult,
    totalUsersResult,
    totalCommentsResult,
    totalLikesResult,
    totalFavoritesResult,
    postsByTypeResult,
    recentActivityResult,
  ] = await db.batch([
    db.prepare("SELECT COUNT(*) as count FROM community_posts WHERE status = 'active'"),
    db.prepare("SELECT COUNT(DISTINCT user_id) as count FROM community_posts WHERE status = 'active'"),
    db.prepare('SELECT COUNT(*) as count FROM community_comments'),
    db.prepare('SELECT COALESCE(SUM(like_count), 0) as total FROM community_posts'),
    db.prepare('SELECT COALESCE(SUM(favorite_count), 0) as total FROM community_posts'),
    db.prepare(`
          SELECT post_type as type, COUNT(*) as count
          FROM community_posts WHERE status = 'active'
          GROUP BY post_type ORDER BY count DESC
        `),
    db.prepare(`
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

  return {
    totalPostsResult,
    totalUsersResult,
    totalCommentsResult,
    totalLikesResult,
    totalFavoritesResult,
    postsByTypeResult,
    recentActivityResult,
  };
}

/** 查询用户社区统计行（由触发器维护） */
export async function findUserCommunityStats(
  db: D1Database,
  userId: string
): Promise<CommunityUserStats | null> {
  return db.prepare('SELECT * FROM community_user_stats WHERE user_id = ?').bind(userId).first<CommunityUserStats>();
}

/** 查询用户最近的活跃帖子 */
export async function listUserRecentPosts(
  db: D1Database,
  opts: { userId: string; limit: number }
): Promise<Array<Record<string, unknown>>> {
  const rows = await db
    .prepare(
      `SELECT * FROM community_posts
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at DESC LIMIT ?`
    )
    .bind(opts.userId, opts.limit)
    .all<Record<string, unknown>>();
  return rows.results || [];
}

// ===========================================================================
// 通知
// ===========================================================================

/** 查询用户发布的帖子简要信息（id / 标题 / 封面） */
export async function listMyPostBriefs(
  db: D1Database,
  userId: string
): Promise<Array<{ id: string; title: string; cover_image: string }>> {
  const rows = await db
    .prepare('SELECT id, title, cover_image FROM community_posts WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string; title: string; cover_image: string }>();
  return rows.results || [];
}

/** 查询与用户帖子相关的各类事件（点赞/评论/收藏/举报处理，一次 batch） */
export async function queryNotificationEvents(
  db: D1Database,
  opts: { postIds: string[]; userId: string }
): Promise<{
  likesResult: { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; created_at: number }> };
  commentsResult: { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; content: string; created_at: number }> };
  favoritesResult: { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; created_at: number }> };
  reportsResult: { results: Array<{ id: string; post_id: string; status: string; report_reason: string; created_at: number }> };
}> {
  const inClause = opts.postIds.map(() => '?').join(',');

  const [likesResult, commentsResult, favoritesResult, reportsResult] = await db.batch([
    db.prepare(`
        SELECT l.id, l.post_id, l.user_id as actor_id, u.username as actor_name, l.created_at
        FROM community_likes l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.post_id IN (${inClause}) AND l.like_type = 'like' AND l.user_id != ?
        ORDER BY l.created_at DESC LIMIT 200
      `).bind(...opts.postIds, opts.userId),
    db.prepare(`
        SELECT c.id, c.post_id, c.user_id as actor_id, u.username as actor_name, c.content, c.created_at
        FROM community_comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id IN (${inClause}) AND c.user_id != ?
        ORDER BY c.created_at DESC LIMIT 200
      `).bind(...opts.postIds, opts.userId),
    db.prepare(`
        SELECT f.id, f.post_id, f.user_id as actor_id, u.username as actor_name, f.created_at
        FROM community_likes f
        LEFT JOIN users u ON f.user_id = u.id
        WHERE f.post_id IN (${inClause}) AND f.like_type = 'favorite' AND f.user_id != ?
        ORDER BY f.created_at DESC LIMIT 200
      `).bind(...opts.postIds, opts.userId),
    db.prepare(`
        SELECT r.id, r.post_id, r.status, r.report_reason, r.updated_at as created_at
        FROM community_reports r
        WHERE r.post_id IN (${inClause}) AND r.status != 'pending'
        ORDER BY r.updated_at DESC LIMIT 100
      `).bind(...opts.postIds),
  ]) as unknown as [
    { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; created_at: number }> },
    { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; content: string; created_at: number }> },
    { results: Array<{ id: string; post_id: string; actor_id: string; actor_name: string; created_at: number }> },
    { results: Array<{ id: string; post_id: string; status: string; report_reason: string; created_at: number }> },
  ];

  return { likesResult, commentsResult, reportsResult, favoritesResult };
}