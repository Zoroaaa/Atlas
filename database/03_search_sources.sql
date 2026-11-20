-- Atlas 数据库 · Search Sources：搜索大类 / 分类 / 搜索源 / 用户源配置 / 状态缓存
-- 依赖：01_core.sql
-- 本文件可重复执行：表/视图/索引/触发器均使用 IF NOT EXISTS，种子数据使用 INSERT OR IGNORE。

-- ──────────────────────────────────────────────
-- 表
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_major_categories (
    id TEXT PRIMARY KEY,                        -- 大类唯一标识
    name TEXT NOT NULL,                         -- 大类名称
    description TEXT,                           -- 大类描述
    icon TEXT DEFAULT '🌟',                     -- 大类图标
    color TEXT DEFAULT '#6b7280',               -- 大类颜色
    display_order INTEGER DEFAULT 999,          -- 显示顺序
    is_system INTEGER DEFAULT 0,                -- 是否系统大类(1:系统 0:自定义)
    is_active INTEGER DEFAULT 1,                -- 是否激活(1:激活 0:禁用)
    created_at INTEGER NOT NULL,                -- 创建时间戳
    updated_at INTEGER NOT NULL                 -- 更新时间戳
);

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

CREATE TABLE IF NOT EXISTS search_sources (
    id TEXT PRIMARY KEY,                        -- 搜索源唯一标识
    category_id TEXT NOT NULL,                  -- 关联分类ID
    name TEXT NOT NULL,                         -- 搜索源名称
    subtitle TEXT,                              -- 搜索源副标题
    description TEXT,                           -- 搜索源描述
    icon TEXT DEFAULT '🔍',                     -- 搜索源图标
    url_template TEXT NOT NULL,                 -- URL模板
    homepage_url TEXT,                          -- 主页URL
    site_type TEXT DEFAULT 'search',            -- 网站类型(跟随分类的default_site_type，不可独立修改)
    searchable INTEGER DEFAULT 1,               -- 是否参与搜索(1:参与 0:不参与)，需与分类default_searchable同时为1才生效
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

-- ──────────────────────────────────────────────
-- 索引
-- ──────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_status_cache_source_created
  ON source_status_cache(source_id, created_at DESC);

-- ──────────────────────────────────────────────
-- 触发器
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- 种子数据
-- ──────────────────────────────────────────────
INSERT OR IGNORE INTO "search_major_categories" ("id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "created_at", "updated_at") VALUES ('jav_sources', '🔍 JAV搜索', 'JAV番号、在线播放、磁力资源等', '🔍', '#3b82f6', 1, 1, 1, 1781162174000, 1781162174000);

INSERT OR IGNORE INTO "search_major_categories" ("id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "created_at", "updated_at") VALUES ('anime_sources', '🎌 动漫搜索', '动漫、番剧、漫画相关搜索源', '🎌', '#8b82f6', 2, 1, 1, 1781162202000, 1781162202000);

INSERT OR IGNORE INTO "search_major_categories" ("id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "created_at", "updated_at") VALUES ('movie_sources', '🎥 影视搜索', '电影、电视剧、综艺节目相关搜索源', '🎥', '#3b82f6', 3, 1, 1, 1781162202000, 1781162202000);

INSERT OR IGNORE INTO "search_major_categories" ("id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "created_at", "updated_at") VALUES ('manga_sources', '📖 漫画搜索', '漫画、条漫相关搜索源', '📖', '#a855f7', 4, 1, 1, 1784253148000, 1784253148000);

INSERT OR IGNORE INTO "search_major_categories" ("id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "created_at", "updated_at") VALUES ('novel_sources', '📚 小说搜索', '小说、电子书搜索源（Anna''s Archive + 奇书网）', '📚', '#10b981', 5, 1, 1, 1786419800000, 1786419800000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('database', 'jav_sources', '📚 番号资料站', '提供详细的番号信息、封面和演员资料', '📚', '#3b82f6', 1, 1, 1, 1, 'search', 1, NULL, 1781162175000, 1781162175000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('streaming', 'jav_sources', '🎥 在线播放平台', '提供在线观看和下载服务', '🎥', '#10b981', 2, 1, 1, 1, 'search', 2, NULL, 1781162175000, 1781162175000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('torrent', 'jav_sources', '🧲 磁力搜索', '提供磁力链接和种子文件', '🧲', '#f59e0b', 3, 1, 1, 0, 'browse', 10, NULL, 1781162175000, 1781162175000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('community', 'jav_sources', '💬 社区论坛', '用户交流讨论和资源分享', '💬', '#8b5cf6', 4, 1, 1, 0, 'browse', 10, NULL, 1781162175000, 1781162175000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('others', 'jav_sources', '🌟 其他资源', '其他类型的搜索资源', '🌟', '#6b7280', 99, 1, 1, 0, 'browse', 10, NULL, 1781162175000, 1781162175000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('anime_database', 'anime_sources', '📚 番剧资料站', 'Bangumi、MAL等动漫资料站点', '📚', '#8b5cf6', 1, 1, 1, 1, 'search', 1, NULL, 1781162202000, 1781162202000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('anime_torrent', 'anime_sources', '🧲 动漫种子', 'Nyaa、Mikan等动漫磁力资源站', '🧲', '#a855f7', 2, 1, 1, 1, 'search', 2, NULL, 1781162202000, 1781162202000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('anime_streaming', 'anime_sources', '📺 在线观看', '各种动漫在线观看平台', '📺', '#ec4899', 3, 1, 1, 1, 'search', 3, NULL, 1781162202000, 1781162202000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('anime_manga', 'anime_sources', '📖 漫画资源', '在线漫画阅读和下载站点', '📖', '#f43f5e', 4, 1, 1, 1, 'search', 4, NULL, 1781162202000, 1781162202000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('movie_database', 'movie_sources', '📚 影视资料站', 'TMDB、豆瓣、IMDb等影视资料库', '📚', '#3b82f6', 1, 1, 1, 1, 'search', 1, NULL, 1781162203000, 1781162203000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('movie_torrent', 'movie_sources', '🧲 影视磁力', '各类电影电视剧磁力资源站', '🧲', '#2563eb', 2, 1, 1, 1, 'search', 2, NULL, 1781162203000, 1781162203000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('movie_streaming', 'movie_sources', '📺 在线观看', '在线影视播放平台', '📺', '#0891b2', 3, 1, 1, 1, 'search', 3, NULL, 1781162203000, 1781162203000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('manga_database', 'manga_sources', '📚 漫画资料站', '漫画数据库和资料站', '📚', '#a855f7', 1, 1, 1, 1, 'search', 5, NULL, 1784253149000, 1784253149000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('manga_resources', 'manga_sources', '📖 漫画资源', '在线漫画阅读站点', '📖', '#a855f7', 2, 1, 1, 1, 'search', 5, NULL, 1784253149000, 1784253149000);

INSERT OR IGNORE INTO "search_source_categories" ("id", "major_category_id", "name", "description", "icon", "color", "display_order", "is_system", "is_active", "default_searchable", "default_site_type", "search_priority", "created_by", "created_at", "updated_at") VALUES ('novel_database', 'novel_sources', '📚 电子书库', 'Anna''s Archive + 奇书网 电子书搜索引擎', '📚', '#10b981', 1, 1, 1, 1, 'search', 1, NULL, 1786419801000, 1786419801000);
