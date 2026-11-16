-- Atlas 数据库 · Core：角色 / 用户 / 会话 / 收藏 / 搜索历史 / 行为日志
-- 依赖：无，最先执行
-- 本文件可重复执行：表/视图/索引/触发器均使用 IF NOT EXISTS，种子数据使用 INSERT OR IGNORE。

-- ──────────────────────────────────────────────
-- 表
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,                        -- 角色唯一标识
    name TEXT UNIQUE NOT NULL,                  -- 角色名称（如 admin, super_admin, user）
    display_name TEXT NOT NULL,                 -- 显示名称（如 管理员, 超级管理员, 普通用户）
    description TEXT,                           -- 角色描述
    is_system INTEGER DEFAULT 0,                -- 是否系统内置角色（不可删除）
    priority INTEGER DEFAULT 0,                 -- 角色优先级（数字越大权限越高）
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                        -- 用户唯一标识
    username TEXT UNIQUE NOT NULL,              -- 用户名（唯一）
    email TEXT UNIQUE NOT NULL,                 -- 邮箱（唯一）
    password_hash TEXT NOT NULL,                -- 密码哈希值
    role_id TEXT DEFAULT 'user',                -- 关联角色ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    settings TEXT DEFAULT '{}',                 -- 用户设置（JSON对象）
    is_active INTEGER DEFAULT 1,                -- 是否激活（1:激活 0:禁用）
    last_login INTEGER,                         -- 最后登录时间
    login_count INTEGER DEFAULT 0,              -- 登录次数统计
    email_verified INTEGER DEFAULT 0,           -- 0:未验证 1:已验证
    last_password_change INTEGER,               -- 最后密码修改时间
    search_tier INTEGER DEFAULT 1,              -- 搜索限流档位（只升不降）
    tier_updated_at INTEGER,                    -- 档位最近评估时间戳（毫秒）
    -- GitHub OAuth 扩展字段
    github_id TEXT,                             -- GitHub用户ID
    github_username TEXT,                       -- GitHub用户名（用于展示）
    -- Google OAuth 扩展字段
    google_id TEXT,                             -- Google用户唯一ID（sub）
    google_username TEXT,                       -- Google用户展示名
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE SET DEFAULT
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,                        -- 会话唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    token_hash TEXT NOT NULL,                   -- 会话token哈希值
    expires_at INTEGER NOT NULL,                -- 过期时间戳
    created_at INTEGER NOT NULL,                -- 创建时间戳
    last_activity INTEGER NOT NULL,             -- 最后活动时间
    ip_address TEXT,                            -- 登录IP地址
    user_agent TEXT,                            -- 用户代理信息
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_favorites (
    id TEXT PRIMARY KEY,                        -- 收藏记录唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    title TEXT NOT NULL,                        -- 收藏项标题
    subtitle TEXT,                              -- 收藏项副标题
    url TEXT NOT NULL,                          -- 收藏项URL
    icon TEXT,                                  -- 收藏项图标
    keyword TEXT,                               -- 关联关键词
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    -- JAV 元数据扩展字段
    code TEXT,                                  -- 番号
    cover TEXT,                                 -- 封面图URL
    actors TEXT,                                -- 演员（JSON数组或逗号分隔）
    duration TEXT,                              -- 时长
    tags TEXT,                                  -- 类别标签（JSON数组或逗号分隔）
    release_date TEXT,                          -- 发行时间
    publisher TEXT,                             -- 发行商
    magnet_link TEXT,                           -- 磁力链接
    -- 状态字段
    status TEXT NOT NULL DEFAULT 'want',        -- 状态: want | have | watching
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_search_history (
    id TEXT PRIMARY KEY,                        -- 搜索记录唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    query TEXT NOT NULL,                        -- 搜索查询词（兼容性字段，与keyword相同）
    source TEXT DEFAULT 'unknown',              -- 搜索来源
    results_count INTEGER DEFAULT 0,            -- 搜索结果数量
    created_at INTEGER NOT NULL,                -- 创建时间戳
    -- 详细信息扩展字段
    title TEXT,                                 -- 标题
    subtitle TEXT,                              -- 副标题
    code TEXT,                                  -- 番号
    actors TEXT,                                -- 演员
    duration TEXT,                              -- 时长
    tags TEXT,                                  -- 标签
    release_date TEXT,                          -- 发行时间
    publisher TEXT,                             -- 发行商
    keyword TEXT,                               -- 搜索关键词（@deprecated 使用 query 字段）
    updated_at INTEGER,                         -- 更新时间戳
    -- 封面字段
    cover TEXT,                                 -- 封面图URL
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_actions (
    id TEXT PRIMARY KEY,                        -- 行为记录唯一标识
    user_id TEXT,                               -- 关联用户ID（可为空，记录匿名行为）
    action TEXT NOT NULL,                       -- 行为类型
    data TEXT DEFAULT '{}',                     -- 行为数据（JSON格式）
    ip_address TEXT,                            -- 用户IP地址
    user_agent TEXT,                            -- 用户代理信息
    created_at INTEGER NOT NULL,                -- 创建时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,                        -- 事件唯一标识
    user_id TEXT,                               -- 关联用户ID（可为空，记录匿名事件）
    session_id TEXT,                            -- 会话ID
    event_type TEXT NOT NULL,                   -- 事件类型
    event_data TEXT DEFAULT '{}',               -- 事件数据（JSON格式）
    ip_address TEXT,                            -- 用户IP地址
    user_agent TEXT,                            -- 用户代理信息
    referer TEXT,                               -- 来源页面
    created_at INTEGER NOT NULL,                -- 事件发生时间戳
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- ──────────────────────────────────────────────
-- 索引
-- ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

CREATE INDEX IF NOT EXISTS idx_roles_priority ON roles(priority);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);

CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON user_favorites(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_favorites_keyword ON user_favorites(keyword);

CREATE INDEX IF NOT EXISTS idx_favorites_user_url ON user_favorites(user_id, url);

CREATE INDEX IF NOT EXISTS idx_favorites_code ON user_favorites(code);

CREATE INDEX IF NOT EXISTS idx_user_favorites_status ON user_favorites(user_id, status);

CREATE INDEX IF NOT EXISTS idx_history_user_created ON user_search_history(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_history_query ON user_search_history(query);

CREATE INDEX IF NOT EXISTS idx_history_source ON user_search_history(source);

CREATE INDEX IF NOT EXISTS idx_history_user_keyword ON user_search_history(user_id, query);

CREATE INDEX IF NOT EXISTS idx_history_code ON user_search_history(code);

CREATE INDEX IF NOT EXISTS idx_history_created_query ON user_search_history(created_at, query);

CREATE INDEX IF NOT EXISTS idx_history_cover ON user_search_history(cover) WHERE cover IS NOT NULL AND cover != '';

CREATE INDEX IF NOT EXISTS idx_actions_user_created ON user_actions(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_actions_action ON user_actions(action);

CREATE INDEX IF NOT EXISTS idx_actions_login ON user_actions(action, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_user_created ON analytics_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);

CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);

CREATE INDEX IF NOT EXISTS idx_actions_created
  ON user_actions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_created
  ON users(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_user_source
  ON user_search_history(user_id, source);

-- ──────────────────────────────────────────────
-- 触发器
-- ──────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS update_roles_timestamp
    AFTER UPDATE ON roles
    FOR EACH ROW
    BEGIN
        UPDATE roles SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_users_timestamp
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
        UPDATE users SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_favorites_timestamp
    AFTER UPDATE ON user_favorites
    FOR EACH ROW
    BEGIN
        UPDATE user_favorites SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS cleanup_expired_sessions
    AFTER INSERT ON user_sessions
    FOR EACH ROW
    BEGIN
        DELETE FROM user_sessions WHERE expires_at < strftime('%s', 'now') * 1000;
    END;

-- ──────────────────────────────────────────────
-- 种子数据
-- ──────────────────────────────────────────────
INSERT OR IGNORE INTO "roles" ("id", "name", "display_name", "description", "is_system", "priority", "created_at", "updated_at") VALUES ('super_admin', 'super_admin', '超级管理员', '拥有系统最高权限，可以管理所有用户和系统配置', 1, 100, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "roles" ("id", "name", "display_name", "description", "is_system", "priority", "created_at", "updated_at") VALUES ('admin', 'admin', '管理员', '可以管理用户、查看统计数据、处理举报等', 1, 50, 1794808772000, 1794808772000);

INSERT OR IGNORE INTO "roles" ("id", "name", "display_name", "description", "is_system", "priority", "created_at", "updated_at") VALUES ('user', 'user', '普通用户', '普通注册用户，拥有基本的搜索和收藏功能', 1, 10, 1794808772000, 1794808772000);
