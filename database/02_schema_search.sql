-- ===============================================
-- 搜索相关表结构
-- 版本: 2.0
-- 说明: 包含搜索源大类、分类、搜索源、用户配置、状态缓存等表结构
-- 执行顺序: 02
-- ===============================================

-- ===============================================
-- 1. 搜索源大类管理
-- ===============================================

CREATE TABLE IF NOT EXISTS search_major_categories (
    id TEXT PRIMARY KEY,                        -- 大类唯一标识
    name TEXT NOT NULL,                         -- 大类名称
    description TEXT,                           -- 大类描述
    icon TEXT DEFAULT '🌟',                     -- 大类图标
    color TEXT DEFAULT '#6b7280',               -- 大类颜色
    requires_keyword INTEGER DEFAULT 1,         -- 是否需要关键词(1:需要 0:不需要)
    display_order INTEGER DEFAULT 999,          -- 显示顺序
    is_system INTEGER DEFAULT 0,                -- 是否系统大类(1:系统 0:自定义)
    is_active INTEGER DEFAULT 1,                -- 是否激活(1:激活 0:禁用)
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);

-- ===============================================
-- 2. 搜索源分类管理
-- ===============================================

CREATE TABLE IF NOT EXISTS search_source_categories (
    id TEXT PRIMARY KEY,                        -- 分类唯一标识
    major_category_id TEXT NOT NULL,            -- 关联大类ID
    name TEXT NOT NULL,                         -- 分类名称
    description TEXT,                           -- 分类描述
    icon TEXT DEFAULT '📁',                     -- 分类图标
    color TEXT DEFAULT '#3b82f6',               -- 分类颜色
    display_order INTEGER DEFAULT 999,          -- 显示顺序
    is_system INTEGER DEFAULT 0,                -- 是否系统分类(1:系统 0:自定义)
    is_active INTEGER DEFAULT 1,                -- 是否激活(1:激活 0:禁用)
    default_searchable INTEGER DEFAULT 1,       -- 该分类下的源默认是否可搜索
    default_site_type TEXT DEFAULT 'search',    -- 默认网站类型(search/browse/reference)
    search_priority INTEGER DEFAULT 5,          -- 搜索优先级(1-10)
    created_by TEXT,                            -- 创建者ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (major_category_id) REFERENCES search_major_categories (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);

-- ===============================================
-- 3. 搜索源管理
-- ===============================================

CREATE TABLE IF NOT EXISTS search_sources (
    id TEXT PRIMARY KEY,                        -- 搜索源唯一标识
    category_id TEXT NOT NULL,                  -- 关联分类ID
    name TEXT NOT NULL,                         -- 搜索源名称
    subtitle TEXT,                              -- 搜索源副标题
    description TEXT,                           -- 搜索源描述
    icon TEXT DEFAULT '🔍',                     -- 搜索源图标
    url_template TEXT NOT NULL,                 -- URL模板
    homepage_url TEXT,                          -- 主页URL
    site_type TEXT DEFAULT 'search',            -- 网站类型(search/browse/reference)
    searchable INTEGER DEFAULT 1,               -- 是否参与搜索(1:参与 0:不参与)
    requires_keyword INTEGER DEFAULT 1,         -- 是否需要关键词(1:需要 0:不需要)
    search_priority INTEGER DEFAULT 5,          -- 搜索优先级(1-10)
    is_system INTEGER DEFAULT 0,                -- 是否系统搜索源(1:系统 0:自定义)
    is_active INTEGER DEFAULT 1,                -- 是否激活(1:激活 0:禁用)
    display_order INTEGER DEFAULT 999,          -- 显示顺序
    usage_count INTEGER DEFAULT 0,              -- 使用次数
    last_used_at INTEGER,                       -- 最后使用时间
    created_by TEXT,                            -- 创建者ID
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    FOREIGN KEY (category_id) REFERENCES search_source_categories (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);

-- ===============================================
-- 4. 用户搜索源配置表
-- ===============================================

CREATE TABLE IF NOT EXISTS user_search_source_configs (
    id TEXT PRIMARY KEY,                        -- 配置唯一标识
    user_id TEXT NOT NULL,                      -- 关联用户ID
    source_id TEXT NOT NULL,                    -- 关联搜索源ID
    is_enabled INTEGER DEFAULT 1,               -- 是否启用(1:启用 0:禁用)
    custom_priority INTEGER,                    -- 自定义优先级
    custom_name TEXT,                           -- 自定义名称
    custom_subtitle TEXT,                       -- 自定义副标题
    custom_icon TEXT,                           -- 自定义图标
    notes TEXT,                                 -- 用户备注
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL,                -- 更新时间戳
    UNIQUE(user_id, source_id),                 -- 用户+搜索源唯一
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES search_sources (id) ON DELETE CASCADE
);

-- ===============================================
-- 5. 搜索源状态检查缓存
-- ===============================================

CREATE TABLE IF NOT EXISTS source_status_cache (
    id TEXT PRIMARY KEY,                        -- 状态缓存唯一标识
    source_id TEXT NOT NULL,                    -- 搜索源ID
    keyword TEXT NOT NULL,                      -- 检查关键词
    keyword_hash TEXT NOT NULL,                 -- 关键词哈希值
    status TEXT NOT NULL DEFAULT 'unknown',     -- 状态（unknown/available/unavailable）
    available INTEGER DEFAULT 0,                -- 是否可用（1:可用 0:不可用）
    content_match INTEGER DEFAULT 0,            -- 内容匹配度
    response_time INTEGER DEFAULT 0,            -- 响应时间（毫秒）
    quality_score INTEGER DEFAULT 0,            -- 质量评分
    match_details TEXT DEFAULT '{}',            -- 匹配详情（JSON格式）
    page_info TEXT DEFAULT '{}',                -- 页面信息（JSON格式）
    check_error TEXT,                           -- 检查错误信息
    expires_at INTEGER NOT NULL,                -- 缓存过期时间
    created_at INTEGER NOT NULL,                -- 创建时间戳
    last_accessed INTEGER NOT NULL,             -- 最后访问时间
    access_count INTEGER DEFAULT 0              -- 访问次数统计
);

-- ===============================================
-- 6. 索引定义
-- ===============================================

CREATE INDEX IF NOT EXISTS idx_major_categories_order ON search_major_categories(display_order, is_active);
CREATE INDEX IF NOT EXISTS idx_major_categories_system ON search_major_categories(is_system, is_active);

CREATE INDEX IF NOT EXISTS idx_source_categories_major ON search_source_categories(major_category_id, display_order);
CREATE INDEX IF NOT EXISTS idx_source_categories_system ON search_source_categories(is_system, is_active);
CREATE INDEX IF NOT EXISTS idx_source_categories_created_by ON search_source_categories(created_by);

CREATE INDEX IF NOT EXISTS idx_search_sources_category ON search_sources(category_id, display_order);
CREATE INDEX IF NOT EXISTS idx_search_sources_system ON search_sources(is_system, is_active);
CREATE INDEX IF NOT EXISTS idx_search_sources_searchable ON search_sources(searchable, search_priority);
CREATE INDEX IF NOT EXISTS idx_search_sources_site_type ON search_sources(site_type);
CREATE INDEX IF NOT EXISTS idx_search_sources_created_by ON search_sources(created_by);
CREATE INDEX IF NOT EXISTS idx_search_sources_usage ON search_sources(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_user_source_configs_user ON user_search_source_configs(user_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_user_source_configs_source ON user_search_source_configs(source_id);

CREATE INDEX IF NOT EXISTS idx_status_cache_source_keyword ON source_status_cache(source_id, keyword_hash);
CREATE INDEX IF NOT EXISTS idx_status_cache_expires ON source_status_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_status_cache_source ON source_status_cache(source_id);

-- ===============================================
-- 7. 触发器定义
-- ===============================================

CREATE TRIGGER IF NOT EXISTS update_major_categories_timestamp 
    AFTER UPDATE ON search_major_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_major_categories SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_source_categories_timestamp 
    AFTER UPDATE ON search_source_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_source_categories SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_search_sources_timestamp 
    AFTER UPDATE ON search_sources
    FOR EACH ROW
    BEGIN
        UPDATE search_sources SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_user_source_configs_timestamp 
    AFTER UPDATE ON user_search_source_configs
    FOR EACH ROW
    BEGIN
        UPDATE user_search_source_configs SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS cleanup_expired_status_cache
    AFTER INSERT ON source_status_cache
    FOR EACH ROW
    BEGIN
        DELETE FROM source_status_cache WHERE expires_at < strftime('%s', 'now') * 1000;
    END;

CREATE TRIGGER IF NOT EXISTS cascade_delete_category_sources
    AFTER DELETE ON search_source_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_sources 
        SET category_id = 'others', updated_at = strftime('%s', 'now') * 1000
        WHERE category_id = OLD.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_source_usage_stats
    AFTER INSERT ON user_search_history
    FOR EACH ROW
    WHEN NEW.source IS NOT NULL
    BEGIN
        UPDATE search_sources 
        SET usage_count = usage_count + 1, 
            last_used_at = strftime('%s', 'now') * 1000,
            updated_at = strftime('%s', 'now') * 1000
        WHERE id = NEW.source;
    END;

CREATE TRIGGER IF NOT EXISTS create_default_user_source_configs
    AFTER INSERT ON users
    FOR EACH ROW
    BEGIN
        INSERT INTO user_search_source_configs (
            id, user_id, source_id, is_enabled, created_at, updated_at
        )
        SELECT 
            NEW.id || '_' || ss.id,
            NEW.id,
            ss.id,
            CASE 
                WHEN ss.id IN ('javbus', 'javdb', 'javlibrary', 'btsow') THEN 1
                WHEN ss.searchable = 1 AND ss.site_type = 'search' THEN 1
                WHEN ss.site_type = 'browse' THEN 0
                ELSE 0
            END,
            strftime('%s', 'now') * 1000,
            strftime('%s', 'now') * 1000
        FROM search_sources ss
        WHERE ss.is_system = 1 AND ss.is_active = 1;
    END;
