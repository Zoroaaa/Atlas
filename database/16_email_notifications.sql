-- ===============================================
-- 邮件通知渠道（P3）
-- 可重复执行（IF NOT EXISTS）。需要先执行 14_schema_notifications_follows.sql
-- ===============================================

-- 1. 待发送邮件队列：只存"这条通知要发邮件"，由定时任务按用户合并成一封再发
--    (user_id, dedup_key) 唯一，重复触发幂等
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedup ON email_queue(user_id, dedup_key);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status, user_id, created_at);

-- 2. 发送记录：用于"每人每天封数上限"、失败退避、全局日额度
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
CREATE INDEX IF NOT EXISTS idx_email_log_user_time ON email_log(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_email_log_time ON email_log(sent_at);

-- 3. 通知的用户级设置
CREATE TABLE IF NOT EXISTS notification_settings (
    user_id TEXT PRIMARY KEY,
    email_hide_details INTEGER NOT NULL DEFAULT 0,  -- 1 = 邮件里只显示条数，不含女优名/番号
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
