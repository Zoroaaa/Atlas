-- ============================================================================
-- 20_fix_community_user_stats.sql
--
-- 终态脚本：执行后社区用户统计完全改为读取时聚合，不再存在物化统计表、
--          统计触发器，以及 share_count / is_featured 两个死字段。
--
-- 背景：原 community_user_stats 只有 AFTER INSERT 触发器，取消点赞/收藏、
--       删除评论/帖子、隐藏帖子都不会回退，导致统计永久偏高。
--       统计是 community_posts / community_likes / community_comments 的
--       纯派生值，读时聚合后结构上不会漂移。
--
-- 执行内容（不可回滚，无备份表）：
--   1) 删除 4 个用户统计触发器
--   2) 删除 idx_posts_featured（SQLite 不允许删除仍被索引引用的列）
--   3) 删除 community_posts.share_count / community_posts.is_featured
--   4) 删除 community_user_stats 表
--   5) 补读时聚合所需的复合索引
--
-- 说明：03_schema_community.sql / 09_indexes_triggers.sql 中相关定义属于历史迁移，
--       执行本脚本后全部失效。不要在本脚本之后重跑 09，否则会重建引用已删除
--       表的统计触发器。
--       本脚本为一次性终态迁移，只执行一次；重复执行会因列已删除而报错。
-- ============================================================================

-- 1) 删除用户统计的增量触发器
DROP TRIGGER IF EXISTS update_user_stats_after_post;
DROP TRIGGER IF EXISTS update_user_stats_after_like;
DROP TRIGGER IF EXISTS update_user_stats_after_favorite;
DROP TRIGGER IF EXISTS update_user_stats_after_comment;

-- 2) 删除依赖 is_featured 的索引
DROP INDEX IF EXISTS idx_posts_featured;

-- 3) 删除死字段
ALTER TABLE community_posts DROP COLUMN share_count;
ALTER TABLE community_posts DROP COLUMN is_featured;

-- 4) 删除物化统计表（统计改由读取时聚合）
DROP TABLE IF EXISTS community_user_stats;

-- 5) 收赞/收收藏聚合使用的复合索引
CREATE INDEX IF NOT EXISTS idx_likes_post_type ON community_likes(post_id, like_type);
