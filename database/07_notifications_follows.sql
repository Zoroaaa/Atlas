-- Atlas 数据库 · Notifications & Follows：站内通知 / 关注女优与实体 / 即将发售 / 邮件队列
-- 依赖：01_core.sql、06_system.sql
-- 本文件可重复执行：表/视图/索引/触发器均使用 IF NOT EXISTS，种子数据使用 INSERT OR IGNORE。

-- ──────────────────────────────────────────────
-- 表
-- ──────────────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    in_app INTEGER NOT NULL DEFAULT 1,
    email INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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

-- 即将发售：由 GitHub Actions 从 JavDB 拉取后写入，只保留今天及未来发售的作品
CREATE TABLE IF NOT EXISTS follow_upcoming (
    watch_key TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    cover TEXT,
    release_date TEXT NOT NULL,                 -- YYYY-MM-DD
    source TEXT NOT NULL DEFAULT 'javdb',
    first_detected_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,              -- 最近一次仍出现在 JavDB 列表中的时间
    PRIMARY KEY (watch_key, code),
    FOREIGN KEY (watch_key) REFERENCES actress_watch(key) ON DELETE CASCADE
);

-- 即将发售同步状态：每个关注对象一行，记录 JavDB 实体 ID 与失败退避
CREATE TABLE IF NOT EXISTS follow_upcoming_sources (
    watch_key TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL DEFAULT 'actress',
    javdb_entity_id TEXT,
    last_synced_at INTEGER NOT NULL DEFAULT 0,  -- 最近一次成功同步
    last_attempt_at INTEGER NOT NULL DEFAULT 0, -- 最近一次尝试（成功或失败）
    fail_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (watch_key) REFERENCES actress_watch(key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',
    dedup_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',     -- pending / sent / skipped / failed
    created_at INTEGER NOT NULL,
    sent_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    status TEXT NOT NULL,                       -- sent / failed
    item_count INTEGER NOT NULL DEFAULT 0,
    message_id TEXT,
    error TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_settings (
    user_id TEXT PRIMARY KEY,
    email_hide_details INTEGER NOT NULL DEFAULT 0,  -- 1 = 邮件里只显示条数，不含女优名/番号
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_announcement_reads (
    user_id TEXT NOT NULL,
    announcement_id TEXT NOT NULL,
    read_at INTEGER,                            -- NULL = 未读
    dismissed_at INTEGER,                       -- 非 NULL = 用户从收件箱删除
    PRIMARY KEY (user_id, announcement_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (announcement_id) REFERENCES site_announcements(id) ON DELETE CASCADE
);

-- ──────────────────────────────────────────────
-- 视图
-- ──────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS follow_targets AS
SELECT
  CASE
    WHEN instr(w.key, ':') > 0 THEN substr(w.key, 1, instr(w.key, ':') - 1)
    ELSE 'actress'
  END AS entity_type,
  CASE
    WHEN instr(w.key, ':') > 0 THEN substr(w.key, instr(w.key, ':') + 1)
    ELSE w.key
  END AS entity_key,
  w.key AS watch_key,
  w.name AS name,
  w.avatar AS avatar,
  w.created_at AS created_at,
  w.last_checked_at AS last_checked_at,
  w.last_ok_at AS last_ok_at,
  w.fail_count AS fail_count,
  w.baseline_done AS baseline_done
FROM actress_watch w;

-- ──────────────────────────────────────────────
-- 索引
-- ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup ON notifications(user_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);

CREATE INDEX IF NOT EXISTS idx_actress_watch_checked ON actress_watch(last_checked_at);

CREATE INDEX IF NOT EXISTS idx_actress_works_release ON actress_works(release_date);

CREATE INDEX IF NOT EXISTS idx_actress_works_detected ON actress_works(watch_key, first_detected_at);

CREATE INDEX IF NOT EXISTS idx_user_follows_watch ON user_follows(watch_key);

CREATE INDEX IF NOT EXISTS idx_follow_upcoming_release ON follow_upcoming(release_date);

CREATE INDEX IF NOT EXISTS idx_follow_upcoming_watch_release ON follow_upcoming(watch_key, release_date);

CREATE INDEX IF NOT EXISTS idx_follow_upcoming_detected ON follow_upcoming(watch_key, first_detected_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedup ON email_queue(user_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_email_log_user_time ON email_log(user_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_email_log_time ON email_log(sent_at);

CREATE INDEX IF NOT EXISTS idx_user_announcement_reads_user
    ON user_announcement_reads(user_id, read_at);

CREATE INDEX IF NOT EXISTS idx_email_queue_cleanup
  ON email_queue(created_at)
  WHERE status <> 'pending';

CREATE INDEX IF NOT EXISTS idx_actress_works_watch_release
  ON actress_works (watch_key, release_date);
