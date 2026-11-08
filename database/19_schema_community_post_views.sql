-- ===============================================
-- 社区帖子浏览去重记录
-- 说明: 同一用户对同一帖子 24 小时内只计一次 view_count
-- 执行顺序: 19（需在 01_schema_core.sql / 03_schema_community.sql 之后执行）
-- 幂等: 全部使用 IF NOT EXISTS，可重复执行
-- ===============================================

CREATE TABLE IF NOT EXISTS community_post_views (
    user_id TEXT NOT NULL,                      -- 浏览用户ID
    post_id TEXT NOT NULL,                      -- 被浏览帖子ID
    last_viewed_at INTEGER NOT NULL,            -- 最近一次计入浏览量的时间戳（毫秒）
    PRIMARY KEY (user_id, post_id),             -- 保证用户+帖子唯一，便于 upsert 去重
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE
);

-- 按帖子查询浏览记录（FK 级联删除 / 后续按帖子统计）
CREATE INDEX IF NOT EXISTS idx_post_views_post ON community_post_views(post_id);
