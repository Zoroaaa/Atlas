-- ===============================================
-- 网站公告表结构
-- 版本: 1.0
-- 说明: 存储管理员发布的网站公告，首页展示
-- 执行顺序: 14
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

CREATE INDEX IF NOT EXISTS idx_site_announcements_active ON site_announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_site_announcements_pinned ON site_announcements(is_pinned);
CREATE INDEX IF NOT EXISTS idx_site_announcements_created_at ON site_announcements(created_at);
