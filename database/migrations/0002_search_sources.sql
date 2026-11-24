-- Atlas 数据库迁移 0002 · Search Sources：大类 / 分类 / 搜索源 / 用户源配置 / 状态缓存
--
-- 由历史脚本 03、26、27 合并为终态结构：owner_id 归属模型，已移除 is_system / created_by。
-- 全部对象使用 IF NOT EXISTS，可在已有生产库上直接执行；种子数据在 database/seeds/。

-- ── 表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "search_major_categories" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '🌟',
    color TEXT DEFAULT '#6b7280',
    display_order INTEGER DEFAULT 999,
    is_active INTEGER DEFAULT 1,
    owner_id TEXT REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "search_source_categories" (
    id TEXT PRIMARY KEY,
    major_category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '📁',
    color TEXT DEFAULT '#3b82f6',
    display_order INTEGER DEFAULT 999,
    is_active INTEGER DEFAULT 1,
    default_searchable INTEGER DEFAULT 1,
    default_site_type TEXT DEFAULT 'search',
    search_priority INTEGER DEFAULT 5,
    owner_id TEXT REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (major_category_id) REFERENCES "search_major_categories" (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "search_sources" (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    icon TEXT DEFAULT '🔍',
    url_template TEXT NOT NULL,
    homepage_url TEXT,
    site_type TEXT DEFAULT 'search',
    searchable INTEGER DEFAULT 1,
    search_priority INTEGER DEFAULT 5,
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 999,
    usage_count INTEGER DEFAULT 0,
    last_used_at INTEGER,
    owner_id TEXT REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES "search_source_categories" (id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS "user_search_source_configs" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    is_enabled INTEGER DEFAULT 1,
    custom_priority INTEGER,
    custom_name TEXT,
    custom_subtitle TEXT,
    custom_icon TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(user_id, source_id),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES "search_sources" (id) ON DELETE CASCADE
);

-- ── 索引 ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_major_categories_order
    ON search_major_categories(display_order, is_active);

CREATE INDEX IF NOT EXISTS idx_major_categories_owner
    ON search_major_categories(owner_id, display_order);

CREATE INDEX IF NOT EXISTS idx_search_sources_category
    ON search_sources(category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_search_sources_owner
    ON search_sources(owner_id, category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_search_sources_searchable
    ON search_sources(searchable, search_priority);

CREATE INDEX IF NOT EXISTS idx_search_sources_site_type
    ON search_sources(site_type);

CREATE INDEX IF NOT EXISTS idx_search_sources_usage
    ON search_sources(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_source_categories_major
    ON search_source_categories(major_category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_source_categories_owner
    ON search_source_categories(owner_id, major_category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_status_cache_expires ON source_status_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_status_cache_source ON source_status_cache(source_id);

CREATE INDEX IF NOT EXISTS idx_status_cache_source_created
  ON source_status_cache(source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_cache_source_keyword ON source_status_cache(source_id, keyword_hash);

CREATE INDEX IF NOT EXISTS idx_user_source_configs_source
    ON user_search_source_configs(source_id);

CREATE INDEX IF NOT EXISTS idx_user_source_configs_user
    ON user_search_source_configs(user_id, is_enabled);

-- ── 触发器 ────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS cleanup_expired_status_cache
    AFTER INSERT ON source_status_cache
    FOR EACH ROW
    BEGIN
        DELETE FROM source_status_cache WHERE expires_at < strftime('%s', 'now') * 1000;
    END;

CREATE TRIGGER IF NOT EXISTS enforce_category_owner_insert
BEFORE INSERT ON search_source_categories
FOR EACH ROW
WHEN (
    (NEW.owner_id IS NULL AND (SELECT owner_id FROM search_major_categories WHERE id = NEW.major_category_id) IS NOT NULL)
    OR (
        NEW.owner_id IS NOT NULL
        AND (SELECT owner_id FROM search_major_categories WHERE id = NEW.major_category_id) IS NOT NULL
        AND (SELECT owner_id FROM search_major_categories WHERE id = NEW.major_category_id) <> NEW.owner_id
    )
)
BEGIN
    SELECT RAISE(ABORT, 'category owner mismatch');
END;

CREATE TRIGGER IF NOT EXISTS enforce_category_owner_update
BEFORE UPDATE OF owner_id, major_category_id ON search_source_categories
FOR EACH ROW
WHEN (
    (NEW.owner_id IS NULL AND (SELECT owner_id FROM search_major_categories WHERE id = NEW.major_category_id) IS NOT NULL)
    OR (
        NEW.owner_id IS NOT NULL
        AND (SELECT owner_id FROM search_major_categories WHERE id = NEW.major_category_id) IS NOT NULL
        AND (SELECT owner_id FROM search_major_categories WHERE id = NEW.major_category_id) <> NEW.owner_id
    )
)
BEGIN
    SELECT RAISE(ABORT, 'category owner mismatch');
END;

CREATE TRIGGER IF NOT EXISTS enforce_source_owner_insert
BEFORE INSERT ON search_sources
FOR EACH ROW
WHEN (
    (NEW.owner_id IS NULL AND (SELECT owner_id FROM search_source_categories WHERE id = NEW.category_id) IS NOT NULL)
    OR (
        NEW.owner_id IS NOT NULL
        AND (
            (SELECT owner_id FROM search_source_categories WHERE id = NEW.category_id) IS NULL
            OR (SELECT owner_id FROM search_source_categories WHERE id = NEW.category_id) <> NEW.owner_id
        )
    )
)
BEGIN
    SELECT RAISE(ABORT, 'source owner mismatch');
END;

CREATE TRIGGER IF NOT EXISTS enforce_source_owner_update
BEFORE UPDATE OF owner_id, category_id ON search_sources
FOR EACH ROW
WHEN (
    (NEW.owner_id IS NULL AND (SELECT owner_id FROM search_source_categories WHERE id = NEW.category_id) IS NOT NULL)
    OR (
        NEW.owner_id IS NOT NULL
        AND (
            (SELECT owner_id FROM search_source_categories WHERE id = NEW.category_id) IS NULL
            OR (SELECT owner_id FROM search_source_categories WHERE id = NEW.category_id) <> NEW.owner_id
        )
    )
)
BEGIN
    SELECT RAISE(ABORT, 'source owner mismatch');
END;

CREATE TRIGGER IF NOT EXISTS update_major_categories_timestamp
    AFTER UPDATE ON search_major_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_major_categories SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_search_sources_timestamp
    AFTER UPDATE ON search_sources
    FOR EACH ROW
    BEGIN
        UPDATE search_sources SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_source_categories_timestamp
    AFTER UPDATE ON search_source_categories
    FOR EACH ROW
    BEGIN
        UPDATE search_source_categories SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
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

CREATE TRIGGER IF NOT EXISTS update_user_source_configs_timestamp
    AFTER UPDATE ON user_search_source_configs
    FOR EACH ROW
    BEGIN
        UPDATE user_search_source_configs SET updated_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
    END;

