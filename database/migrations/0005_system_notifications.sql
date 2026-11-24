-- Atlas 数据库迁移 0005 · System & Notifications：反馈 / 公告 / 系统错误 / 任务锁 / 通知 / 关注 / 邮件队列
--
-- 由历史脚本 06、07 合并为幂等终态结构，不包含业务默认数据。
-- 全部对象使用 IF NOT EXISTS，可在已有生产库上直接执行。

-- ── 表 ────────────────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS cron_locks (
    key TEXT PRIMARY KEY,                       -- 任务标识，如 follow.check
    locked_until INTEGER NOT NULL,              -- 租约到期时间戳（毫秒）
    owner TEXT NOT NULL,                        -- 持有者 id（本次执行随机生成）
    updated_at INTEGER NOT NULL
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

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    in_app INTEGER NOT NULL DEFAULT 1,
    email INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, type),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_settings (
    user_id TEXT PRIMARY KEY,
    email_hide_details INTEGER NOT NULL DEFAULT 0,  -- 1 = 邮件里只显示条数，不含女优名/番号
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS site_announcements (
    id TEXT PRIMARY KEY,                        -- 公告唯一标识
    title TEXT NOT NULL,                        -- 公告标题
    content TEXT NOT NULL,                      -- 公告内容（支持简单文本）
    type TEXT DEFAULT 'info',                  -- 公告类型: info | warning | success | error
    is_pinned INTEGER DEFAULT 0,                -- 是否置顶 (0/1)
    is_active INTEGER DEFAULT 1,                -- 是否启用 (0/1)
    start_time INTEGER,                        -- 生效时间（NULL=立即生效）
    end_time INTEGER,                          -- 失效时间（NULL=永不失效）
    admin_user_id TEXT,                        -- 发布者ID
    created_at INTEGER NOT NULL,                -- 创建时间
    updated_at INTEGER NOT NULL,                -- 更新时间
    FOREIGN KEY (admin_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS system_errors (
    id TEXT PRIMARY KEY,                        -- 错误记录唯一标识
    source TEXT NOT NULL,                       -- 错误来源: frontend | backend
    error_type TEXT NOT NULL,                   -- 错误类型: javascript | unhandledrejection | api | server | render
    message TEXT NOT NULL,                      -- 错误消息（截断后存储）
    stack TEXT,                                 -- 错误堆栈（可能为空）
    url TEXT,                                   -- 发生位置：前端 URL 或后端路由路径
    line_number INTEGER,                        -- 行号（前端 source map 解析前）
    column_number INTEGER,                       -- 列号
    user_id TEXT,                               -- 关联用户ID（可为空，匿名用户错误）
    session_id TEXT,                            -- 前端 analytics session_id
    ip_address TEXT,                            -- 用户IP地址
    user_agent TEXT,                            -- 用户代理信息
    request_method TEXT,                        -- 请求方法（后端错误用）
    request_path TEXT,                          -- 请求路径（后端错误用）
    status_code INTEGER,                        -- HTTP 状态码（后端错误用）
    context TEXT DEFAULT '{}',                  -- 额外上下文（JSON：组件栈、面包屑等）
    fingerprint TEXT,                           -- 错误指纹（用于聚合相同错误）
    created_at INTEGER NOT NULL,                -- 发生时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS user_feedback (
    id TEXT PRIMARY KEY,                        -- 反馈唯一标识
    user_id TEXT,                               -- 提交用户ID（未登录时为NULL）
    contact_email TEXT,                         -- 联系邮箱（未登录用户必填）
    type TEXT NOT NULL,                         -- 反馈类型: bug | suggestion | other
    title TEXT NOT NULL,                        -- 反馈标题
    content TEXT NOT NULL,                      -- 反馈内容
    page_url TEXT,                              -- 发生问题的页面URL
    user_agent TEXT,                            -- 用户浏览器信息
    ip_address TEXT,                            -- 提交者IP
    status TEXT DEFAULT 'pending',              -- 状态: pending | processing | resolved | closed
    priority TEXT DEFAULT 'normal',             -- 优先级: low | normal | high | urgent
    admin_user_id TEXT,                         -- 处理管理员ID
    admin_reply TEXT,                           -- 管理员回复内容
    admin_notes TEXT,                           -- 管理员内部备注（不发送给用户）
    resolved_at INTEGER,                        -- 处理完成时间
    email_sent INTEGER DEFAULT 0,               -- 是否已发送回复邮件
    created_at INTEGER NOT NULL,                -- 提交时间
    updated_at INTEGER NOT NULL,                -- 更新时间
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY (admin_user_id) REFERENCES users (id) ON DELETE SET NULL
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

-- ── 索引 ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_actress_watch_checked ON actress_watch(last_checked_at);

CREATE INDEX IF NOT EXISTS idx_actress_works_detected ON actress_works(watch_key, first_detected_at);

CREATE INDEX IF NOT EXISTS idx_actress_works_release ON actress_works(release_date);

CREATE INDEX IF NOT EXISTS idx_actress_works_watch_release
  ON actress_works (watch_key, release_date);

CREATE INDEX IF NOT EXISTS idx_email_log_time ON email_log(sent_at);

CREATE INDEX IF NOT EXISTS idx_email_log_user_time ON email_log(user_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_email_queue_cleanup
  ON email_queue(created_at)
  WHERE status <> 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedup ON email_queue(user_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_follow_upcoming_detected ON follow_upcoming(watch_key, first_detected_at);

CREATE INDEX IF NOT EXISTS idx_follow_upcoming_release ON follow_upcoming(release_date);

CREATE INDEX IF NOT EXISTS idx_follow_upcoming_watch_release ON follow_upcoming(watch_key, release_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup ON notifications(user_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);

CREATE INDEX IF NOT EXISTS idx_site_announcements_active ON site_announcements(is_active);

CREATE INDEX IF NOT EXISTS idx_site_announcements_created_at ON site_announcements(created_at);

CREATE INDEX IF NOT EXISTS idx_site_announcements_pinned ON site_announcements(is_pinned);

CREATE INDEX IF NOT EXISTS idx_system_errors_created_at ON system_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_errors_fingerprint ON system_errors(fingerprint);

CREATE INDEX IF NOT EXISTS idx_system_errors_source ON system_errors(source);

CREATE INDEX IF NOT EXISTS idx_system_errors_user_id ON system_errors(user_id);

CREATE INDEX IF NOT EXISTS idx_user_announcement_reads_user
    ON user_announcement_reads(user_id, read_at);

CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at);

CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);

CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(type);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_user_follows_watch ON user_follows(watch_key);

-- ── 视图 ──────────────────────────────────────────────
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

