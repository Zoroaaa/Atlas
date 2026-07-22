-- ===============================================
-- 反馈和公告表结构
-- 版本: 2.0
-- 说明: 包含用户反馈和网站公告表结构
-- 执行顺序: 05
-- ===============================================

-- ===============================================
-- 1. 用户反馈表结构
-- 说明: 存储用户提交的问题反馈与优化建议
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

-- ===============================================
-- 2. 网站公告表结构
-- 说明: 存储管理员发布的网站公告，首页展示
-- ===============================================

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