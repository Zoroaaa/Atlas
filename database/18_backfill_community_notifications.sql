-- ===============================================
-- 可选：回填历史社区互动到统一收件箱
-- 执行前提: 17_schema_announcement_reads.sql 已执行、阶段 2 代码已上线
-- 特性: 可重复执行（依赖 notifications 的 (user_id, dedup_key) 唯一索引）
-- 说明: 历史数据统一标记为已读（read_at = 当前时间），避免上线后未读数爆量。
--       不需要回填时可跳过本文件。
-- ===============================================

-- 1) 点赞
INSERT OR IGNORE INTO notifications
    (id, user_id, type, title, body, payload, dedup_key, created_at, read_at)
SELECT
    'bf_' || lower(hex(randomblob(16))),
    p.user_id,
    'community.like',
    u.username || ' 点赞了你的帖子',
    p.title,
    json_object('postId', p.id, 'postTitle', p.title, 'actorName', u.username),
    'community_like:' || l.id,
    l.created_at,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM community_likes l
JOIN community_posts p ON p.id = l.post_id
JOIN users u ON u.id = l.user_id
WHERE l.like_type = 'like'
  AND p.user_id <> l.user_id;

-- 2) 收藏
INSERT OR IGNORE INTO notifications
    (id, user_id, type, title, body, payload, dedup_key, created_at, read_at)
SELECT
    'bf_' || lower(hex(randomblob(16))),
    p.user_id,
    'community.favorite',
    u.username || ' 收藏了你的帖子',
    p.title,
    json_object('postId', p.id, 'postTitle', p.title, 'actorName', u.username),
    'community_favorite:' || l.id,
    l.created_at,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM community_likes l
JOIN community_posts p ON p.id = l.post_id
JOIN users u ON u.id = l.user_id
WHERE l.like_type = 'favorite'
  AND p.user_id <> l.user_id;

-- 3) 评论
INSERT OR IGNORE INTO notifications
    (id, user_id, type, title, body, payload, dedup_key, created_at, read_at)
SELECT
    'bf_' || lower(hex(randomblob(16))),
    p.user_id,
    'community.comment',
    u.username || ' 评论了你的帖子',
    substr(c.content, 1, 100),
    json_object('postId', p.id, 'postTitle', p.title, 'actorName', u.username, 'comment', substr(c.content, 1, 100)),
    'community_comment:' || c.id,
    c.created_at,
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM community_comments c
JOIN community_posts p ON p.id = c.post_id
JOIN users u ON u.id = c.user_id
WHERE p.user_id <> c.user_id;

-- 4) 举报处理结果
INSERT OR IGNORE INTO notifications
    (id, user_id, type, title, body, payload, dedup_key, created_at, read_at)
SELECT
    'bf_' || lower(hex(randomblob(16))),
    p.user_id,
    'community.report_resolved',
    '你帖子上的举报已处理',
    p.title || ' · ' || CASE r.status WHEN 'resolved' THEN '已处理' ELSE '已驳回' END,
    json_object(
        'postId', p.id,
        'postTitle', p.title,
        'status', r.status,
        'action', COALESCE(r.admin_action, '')
    ),
    'community_report:' || r.id || ':' || r.status,
    COALESCE(r.resolved_at, r.updated_at),
    CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM community_reports r
JOIN community_posts p ON p.id = r.post_id
WHERE r.status IN ('resolved', 'dismissed')
  AND p.user_id <> COALESCE(r.admin_user_id, '');
