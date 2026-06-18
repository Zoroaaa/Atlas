-- ===============================================
-- 社区 v3.0 统计数据修复脚本
-- 用途: 重新计算并回正所有统计数据（触发器缺失期间的遗漏）
-- 执行方式: wrangler d1 execute <DB_NAME> --file=./database/fix_community_stats.sql
-- ===============================================

-- ============================================================
-- 第1步：回正帖子的 like_count / comment_count / favorite_count
-- （这些字段本应由触发器维护，但可能有偏差）
-- ============================================================

-- 回正评论数
UPDATE community_posts SET
    comment_count = (SELECT COUNT(*) FROM community_comments WHERE post_id = community_posts.id),
    updated_at = updated_at;

-- 回正点赞数
UPDATE community_posts SET
    like_count = (SELECT COUNT(*) FROM community_likes WHERE post_id = community_posts.id AND like_type = 'like'),
    updated_at = updated_at;

-- 回正收藏数
UPDATE community_posts SET
    favorite_count = (SELECT COUNT(*) FROM community_likes WHERE post_id = community_posts.id AND like_type = 'favorite'),
    updated_at = updated_at;

-- ============================================================
-- 第2步：重建 community_user_stats（全量重算）
-- 先清空旧数据，再从各表聚合重新插入
-- ============================================================

DELETE FROM community_user_stats;

-- 为每个发过帖子的用户创建/更新统计记录
INSERT INTO community_user_stats (
    id, user_id,
    posts_count,
    likes_received,
    favorites_received,
    comments_count,
    reputation_score,
    contribution_level,
    created_at,
    updated_at
)
SELECT
    u.user_id || '_stats' as id,
    u.user_id,
    COALESCE(u.posts, 0),
    COALESCE(u.likes, 0),
    COALESCE(u.favorites, 0),
    COALESCE(u.comments, 0),
    COALESCE(u.posts, 0) * 5 + COALESCE(u.likes, 0) * 1 + COALESCE(u.comments, 0) * 2,
    CASE
        WHEN COALESCE(u.posts, 0) >= 50 THEN 'master'
        WHEN COALESCE(u.posts, 0) >= 20 THEN 'expert'
        WHEN COALESCE(u.posts, 0) >= 5 THEN 'contributor'
        ELSE 'beginner'
    END,
    COALESCE(u.first_post_time, strftime('%s', 'now') * 1000),
    strftime('%s', 'now') * 1000
FROM (
    -- 聚合每个用户的所有统计数据（含自身操作）
    SELECT
        p.user_id,
        COUNT(DISTINCT p.id) as posts,
        (SELECT COUNT(*) FROM community_likes l JOIN community_posts lp ON l.post_id = lp.id
         WHERE lp.user_id = p.user_id AND l.like_type = 'like') as likes,
        (SELECT COUNT(*) FROM community_likes l JOIN community_posts lp ON l.post_id = lp.id
         WHERE lp.user_id = p.user_id AND l.like_type = 'favorite') as favorites,
        (SELECT COUNT(*) FROM community_comments c JOIN community_posts cp ON c.post_id = cp.id
         WHERE cp.user_id = p.user_id) as comments,
        MIN(p.created_at) as first_post_time
    FROM community_posts p
    GROUP BY p.user_id
) u;

-- ============================================================
-- 第3步：验证结果
-- ============================================================
SELECT '--- 帖子计数验证 ---' as info;
SELECT post_type, COUNT(*) as total,
       SUM(like_count) as total_likes,
       SUM(comment_count) as total_comments,
       SUM(favorite_count) as total_favorites
FROM community_posts WHERE status = 'active' GROUP BY post_type;

SELECT '--- 用户统计验证 ---' as info;
SELECT user_id, posts_count, likes_received, favorites_received,
       comments_count, reputation_score, contribution_level
FROM community_user_stats ORDER BY reputation_score DESC LIMIT 20;

SELECT '--- 触发器状态检查 ---' as info;
SELECT name, type FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'update_%';
