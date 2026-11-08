-- ===============================================
-- 公告收件箱状态（读时合并）
-- 说明: 公告不复制进 notifications 表，按用户在收件箱读取时合并；
--       本表只记录每个用户的已读/删除状态。
-- 可重复执行（IF NOT EXISTS）
-- 依赖: 05_schema_feedback_announcements.sql、14_schema_notifications_follows.sql
-- ===============================================

CREATE TABLE IF NOT EXISTS user_announcement_reads (
    user_id TEXT NOT NULL,
    announcement_id TEXT NOT NULL,
    read_at INTEGER,                            -- NULL = 未读
    dismissed_at INTEGER,                       -- 非 NULL = 用户从收件箱删除
    PRIMARY KEY (user_id, announcement_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (announcement_id) REFERENCES site_announcements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_announcement_reads_user
    ON user_announcement_reads(user_id, read_at);
