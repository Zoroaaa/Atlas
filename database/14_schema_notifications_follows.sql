-- ===============================================
-- 通知系统 + 关注女优
-- 可重复执行（IF NOT EXISTS）；执行后无需回填
-- ===============================================

-- 1. 统一通知表（站内收件箱）
-- (user_id, dedup_key) 唯一：定时任务重跑/重试不会产生重复通知
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,                         -- 如 follow.new_work / follow.release_soon
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',         -- JSON：跳转所需信息（番号、女优 key 等）
    dedup_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER,                            -- NULL = 未读
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup ON notifications(user_id, dedup_key);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);

-- 2. 通知偏好（按类型）。没有记录 = 使用默认值（站内开、邮件关）
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    in_app INTEGER NOT NULL DEFAULT 1,
    email INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 被关注的女优（全局一份，多人关注只检查一次）
CREATE TABLE IF NOT EXISTS actress_watch (
    key TEXT PRIMARY KEY,                       -- JavBus star slug
    name TEXT NOT NULL,
    avatar TEXT,
    created_at INTEGER NOT NULL,
    last_checked_at INTEGER NOT NULL DEFAULT 0,
    last_ok_at INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,      -- 连续失败次数，用于退避
    baseline_done INTEGER NOT NULL DEFAULT 0    -- 0 = 尚未完成首次基线抓取（首次不通知）
);
CREATE INDEX IF NOT EXISTS idx_actress_watch_checked ON actress_watch(last_checked_at);

-- 4. 女优作品（关注动态 / 发售日历的数据源）
CREATE TABLE IF NOT EXISTS actress_works (
    watch_key TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    cover TEXT,
    release_date TEXT,                          -- YYYY-MM-DD
    first_detected_at INTEGER NOT NULL,
    PRIMARY KEY (watch_key, code),
    FOREIGN KEY (watch_key) REFERENCES actress_watch(key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_actress_works_release ON actress_works(release_date);
CREATE INDEX IF NOT EXISTS idx_actress_works_detected ON actress_works(watch_key, first_detected_at);

-- 5. 用户关注关系
CREATE TABLE IF NOT EXISTS user_follows (
    user_id TEXT NOT NULL,
    watch_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_viewed_at INTEGER NOT NULL,            -- 之后发现的作品算"未读"
    notify_in_app INTEGER NOT NULL DEFAULT 1,
    notify_email INTEGER NOT NULL DEFAULT 0,    -- 邮件渠道上线后使用
    PRIMARY KEY (user_id, watch_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (watch_key) REFERENCES actress_watch(key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_follows_watch ON user_follows(watch_key);
