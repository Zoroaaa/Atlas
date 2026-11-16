-- Atlas 数据库 · System：反馈 / 站点公告 / 系统错误 / 定时任务锁
-- 依赖：01_core.sql
-- 本文件可重复执行：表/视图/索引/触发器均使用 IF NOT EXISTS，种子数据使用 INSERT OR IGNORE。

-- ──────────────────────────────────────────────
-- 表
-- ──────────────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS cron_locks (
    key TEXT PRIMARY KEY,                       -- 任务标识，如 follow.check
    locked_until INTEGER NOT NULL,              -- 租约到期时间戳（毫秒）
    owner TEXT NOT NULL,                        -- 持有者 id（本次执行随机生成）
    updated_at INTEGER NOT NULL
);

-- ──────────────────────────────────────────────
-- 索引
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(status);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON user_feedback(created_at);

CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(type);

CREATE INDEX IF NOT EXISTS idx_site_announcements_active ON site_announcements(is_active);

CREATE INDEX IF NOT EXISTS idx_site_announcements_pinned ON site_announcements(is_pinned);

CREATE INDEX IF NOT EXISTS idx_site_announcements_created_at ON site_announcements(created_at);

CREATE INDEX IF NOT EXISTS idx_system_errors_fingerprint ON system_errors(fingerprint);

CREATE INDEX IF NOT EXISTS idx_system_errors_created_at ON system_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_errors_source ON system_errors(source);

CREATE INDEX IF NOT EXISTS idx_system_errors_user_id ON system_errors(user_id);
