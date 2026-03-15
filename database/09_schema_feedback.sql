-- ===============================================
-- 用户反馈表结构
-- 版本: 2.0
-- 说明: 存储用户提交的问题反馈与优化建议
-- 执行顺序: 09
-- ===============================================

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

CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(type);
