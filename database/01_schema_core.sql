-- ===============================================
-- 核心表结构
-- 版本: 2.0
-- 说明: 包含用户、角色、系统配置、分析事件等核心表结构
-- 执行顺序: 01
-- ===============================================

-- ===============================================
-- 1. 角色定义表
-- ===============================================

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,                        -- 角色唯一标识
    name TEXT UNIQUE NOT NULL,                  -- 角色名称（如 admin, super_admin, user）
    display_name TEXT NOT NULL,                 -- 显示名称（如 管理员, 超级管理员, 普通用户）
    description TEXT,                           -- 角色描述
    permissions TEXT DEFAULT '[]',              -- 角色权限列表（JSON数组）
    is_system INTEGER DEFAULT 0,                -- 是否系统内置角色（不可删除）
    priority INTEGER DEFAULT 0,                 -- 角色优先级（数字越大权限越高）
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);

-- ===============================================
-- 2. 用户基础信息管理
-- ===============================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                        -- 用户唯一标识
    username TEXT UNIQUE NOT NULL,              -- 用户名（唯一）
    email TEXT UNIQUE NOT NULL,                 -- 邮箱（唯一）
    password_hash TEXT NOT NULL,                -- 密码哈希值
    role_id TEXT DEFAULT 'user',                -- 关联角色ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    permissions TEXT DEFAULT '["search","favorite","history","sync"]', -- 用户权限（JSON数组）
    settings TEXT DEFAULT '{}',                 -- 用户设置（JSON对象）
    is_active INTEGER DEFAULT 1,                -- 是否激活（1:激活 0:禁用）
    last_login INTEGER,                         -- 最后登录时间
    login_count INTEGER DEFAULT 0,              -- 登录次数统计
    email_verified INTEGER DEFAULT 0,           -- 0:未验证 1:已验证
    last_password_change INTEGER,               -- 最后密码修改时间
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
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_search_history (
    id TEXT PRIMARY KEY,                        -- 搜索记录唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    query TEXT NOT NULL,                        -- 搜索查询词（兼容性字段，与keyword相同）
    source TEXT DEFAULT 'unknown',              -- 搜索来源
    results_count INTEGER DEFAULT 0,            -- 搜索结果数量
    created_at INTEGER NOT NULL,                -- 创建时间戳
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

-- ===============================================
-- 3. 系统配置管理
-- ===============================================

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,                       -- 配置键名
    value TEXT NOT NULL,                        -- 配置值
    description TEXT,                           -- 配置描述
    config_type TEXT DEFAULT 'string',          -- 配置类型（string/integer/boolean/json/float）
    config_group TEXT DEFAULT 'other',          -- 配置分组
    validation_rules TEXT,                      -- 配置验证规则（JSON格式）
    options TEXT,                               -- 配置选项（用于下拉选择等，JSON格式）
    is_public INTEGER DEFAULT 0,                -- 是否公开（1:公开 0:私有）
    is_resettable INTEGER DEFAULT 1,            -- 是否可重置
    is_sensitive INTEGER DEFAULT 0,             -- 是否敏感配置
    display_order INTEGER DEFAULT 0,            -- 排序顺序
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);

CREATE TABLE IF NOT EXISTS config_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config_change_logs (
    id TEXT PRIMARY KEY,                        -- 日志唯一标识
    config_key TEXT NOT NULL,                   -- 配置键名
    old_value TEXT,                             -- 旧值
    new_value TEXT NOT NULL,                    -- 新值
    change_type TEXT NOT NULL,                  -- 变更类型（create/update/delete/reset）
    changed_by TEXT,                            -- 变更人用户ID
    changed_by_username TEXT,                   -- 变更人用户名
    change_reason TEXT,                         -- 变更原因
    ip_address TEXT,                            -- 变更IP地址
    user_agent TEXT,                            -- 用户代理
    created_at INTEGER NOT NULL,                -- 创建时间戳
    FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
);

-- ===============================================
-- 4. 用户行为分析
-- ===============================================

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

-- ===============================================
-- 5. 索引定义
-- ===============================================

CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_priority ON roles(priority);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON user_favorites(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_favorites_keyword ON user_favorites(keyword);
CREATE INDEX IF NOT EXISTS idx_favorites_user_url ON user_favorites(user_id, url);

CREATE INDEX IF NOT EXISTS idx_history_user_created ON user_search_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_history_query ON user_search_history(query);
CREATE INDEX IF NOT EXISTS idx_history_source ON user_search_history(source);
CREATE INDEX IF NOT EXISTS idx_history_user_keyword ON user_search_history(user_id, query);

CREATE INDEX IF NOT EXISTS idx_actions_user_created ON user_actions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_actions_action ON user_actions(action);
CREATE INDEX IF NOT EXISTS idx_actions_login ON user_actions(action, created_at);

CREATE INDEX IF NOT EXISTS idx_config_public ON system_config(is_public);
CREATE INDEX IF NOT EXISTS idx_config_group ON system_config(config_group);

CREATE INDEX IF NOT EXISTS idx_config_logs_key ON config_change_logs(config_key);
CREATE INDEX IF NOT EXISTS idx_config_logs_by ON config_change_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_config_logs_created ON config_change_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_config_logs_type ON config_change_logs(change_type);

CREATE INDEX IF NOT EXISTS idx_analytics_user_created ON analytics_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);

-- ===============================================
-- 6. 触发器定义
-- ===============================================

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
