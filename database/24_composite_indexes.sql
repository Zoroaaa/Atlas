-- ============================================================================
-- 24_composite_indexes.sql
--
-- 社区列表查询的复合索引。
--
-- 背景：
--   - 帖子列表 = status = ? ORDER BY created_at DESC
--     （community-repository.ts listPosts），现有 idx_posts_status 与 idx_posts_created
--     只能二选一：要么用 status 定位后在内存排序，要么扫 created_at 逐行过滤。
--   - 评论列表 = post_id = ? ORDER BY created_at DESC
--     （community-repository.ts listPostComments），idx_comments_post 只覆盖等值过滤，
--     排序仍需额外一趟。
--
-- 幂等：CREATE INDEX IF NOT EXISTS，可在全新库与已升级库重复执行。
-- 回滚：DROP INDEX IF EXISTS idx_posts_status_created;
--       DROP INDEX IF EXISTS idx_comments_post_created;
--       只删索引，不影响数据。
-- 注意：idx_posts_status / idx_comments_post 保留不动——其它查询（按状态计数、
--       按 post_id 聚合）仍会用到它们。
-- ============================================================================

-- 帖子列表：状态过滤 + 创建时间倒序
CREATE INDEX IF NOT EXISTS idx_posts_status_created
    ON community_posts(status, created_at DESC);

-- 评论列表：帖子过滤 + 创建时间倒序
CREATE INDEX IF NOT EXISTS idx_comments_post_created
    ON community_comments(post_id, created_at DESC);
