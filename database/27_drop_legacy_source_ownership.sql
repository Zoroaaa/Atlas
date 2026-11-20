-- Atlas 数据库 · Search Sources 归属清理：移除旧 is_system / created_by 字段
-- 依赖：26_source_ownership.sql 已执行，且新后端/前端已稳定运行。
-- 执行时机：线上验证通过后手动执行；只执行一次。
-- 注意：D1 不允许 SQL BEGIN/COMMIT，本脚本按「先建新表、复制、按子表优先删除旧表、再重命名」顺序执行；
--       执行前必须备份 D1，中途失败时不要重复执行，先按 Git 历史回滚到清理前状态再处理。

-- ──────────────────────────────────────────────
-- 1. 新建终态表（不含 is_system / created_by）
-- ──────────────────────────────────────────────
CREATE TABLE search_major_categories_final (
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

CREATE TABLE search_source_categories_final (
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
    FOREIGN KEY (major_category_id) REFERENCES search_major_categories_final (id) ON DELETE CASCADE
);

CREATE TABLE search_sources_final (
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
    FOREIGN KEY (category_id) REFERENCES search_source_categories_final (id) ON DELETE CASCADE
);

CREATE TABLE user_search_source_configs_final (
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
    FOREIGN KEY (source_id) REFERENCES search_sources_final (id) ON DELETE CASCADE
);

-- ──────────────────────────────────────────────
-- 2. 复制数据（显式列名，避免依赖旧表列顺序）
-- ──────────────────────────────────────────────
INSERT INTO search_major_categories_final (
    id, name, description, icon, color, display_order, is_active, owner_id, created_at, updated_at
)
SELECT
    id, name, description, icon, color, display_order, is_active, owner_id, created_at, updated_at
FROM search_major_categories;

INSERT INTO search_source_categories_final (
    id, major_category_id, name, description, icon, color, display_order,
    is_active, default_searchable, default_site_type, search_priority,
    owner_id, created_at, updated_at
)
SELECT
    id, major_category_id, name, description, icon, color, display_order,
    is_active, default_searchable, default_site_type, search_priority,
    owner_id, created_at, updated_at
FROM search_source_categories;

INSERT INTO search_sources_final (
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_active, display_order,
    usage_count, last_used_at, owner_id, created_at, updated_at
)
SELECT
    id, category_id, name, subtitle, description, icon, url_template, homepage_url,
    site_type, searchable, search_priority, is_active, display_order,
    usage_count, last_used_at, owner_id, created_at, updated_at
FROM search_sources;

INSERT INTO user_search_source_configs_final (
    id, user_id, source_id, is_enabled, custom_priority,
    custom_name, custom_subtitle, custom_icon, notes, created_at, updated_at
)
SELECT
    id, user_id, source_id, is_enabled, custom_priority,
    custom_name, custom_subtitle, custom_icon, notes, created_at, updated_at
FROM user_search_source_configs;

-- ──────────────────────────────────────────────
-- 3. 删除旧表（子表优先，避免外键引用失败）
-- ──────────────────────────────────────────────
-- 该触发器挂在 user_search_history 上但引用 search_sources；表重建期间必须先移除
DROP TRIGGER IF EXISTS update_source_usage_stats;

DROP TABLE user_search_source_configs;

DROP TABLE search_sources;

DROP TABLE search_source_categories;

DROP TABLE search_major_categories;

-- ──────────────────────────────────────────────
-- 4. 重命名终态表（SQLite 会同步更新其他表的外键引用）
-- ──────────────────────────────────────────────
ALTER TABLE search_major_categories_final RENAME TO search_major_categories;

ALTER TABLE search_source_categories_final RENAME TO search_source_categories;

ALTER TABLE search_sources_final RENAME TO search_sources;

ALTER TABLE user_search_source_configs_final RENAME TO user_search_source_configs;

-- ──────────────────────────────────────────────
-- 5. 重建索引
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_major_categories_order
    ON search_major_categories(display_order, is_active);

CREATE INDEX IF NOT EXISTS idx_major_categories_owner
    ON search_major_categories(owner_id, display_order);

CREATE INDEX IF NOT EXISTS idx_source_categories_major
    ON search_source_categories(major_category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_source_categories_owner
    ON search_source_categories(owner_id, major_category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_search_sources_category
    ON search_sources(category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_search_sources_searchable
    ON search_sources(searchable, search_priority);

CREATE INDEX IF NOT EXISTS idx_search_sources_site_type
    ON search_sources(site_type);

CREATE INDEX IF NOT EXISTS idx_search_sources_usage
    ON search_sources(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_search_sources_owner
    ON search_sources(owner_id, category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_user_source_configs_user
    ON user_search_source_configs(user_id, is_enabled);

CREATE INDEX IF NOT EXISTS idx_user_source_configs_source
    ON user_search_source_configs(source_id);

-- ──────────────────────────────────────────────
-- 6. 重建时间戳触发器
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

-- ──────────────────────────────────────────────
-- 7. 重建归属一致性触发器（与 26 保持一致）
-- ──────────────────────────────────────────────
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
