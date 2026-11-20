-- Atlas 数据库 · Search Sources 归属重构：系统树与用户私有树解耦
-- 依赖：01_core.sql、03_search_sources.sql
-- 执行时机：部署新后端之前手动执行；本脚本只新增字段/索引/触发器，旧后端仍可运行。
-- 说明：owner_id IS NULL 表示系统数据，非空表示用户私有数据。

-- ──────────────────────────────────────────────
-- 1. 归属字段
-- ──────────────────────────────────────────────
ALTER TABLE search_major_categories ADD COLUMN owner_id TEXT REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE search_source_categories ADD COLUMN owner_id TEXT REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE search_sources ADD COLUMN owner_id TEXT REFERENCES users (id) ON DELETE CASCADE;

-- 旧数据回填：is_system = 0 的分类/源归创建者所有；大类此前只能由管理员创建，全部保持系统归属
UPDATE search_source_categories
SET owner_id = created_by
WHERE is_system = 0 AND created_by IS NOT NULL;

UPDATE search_sources
SET owner_id = created_by
WHERE is_system = 0 AND created_by IS NOT NULL;

-- ──────────────────────────────────────────────
-- 2. 历史用户源迁移
-- 旧模型允许用户源直接挂在系统分类下；新模型要求用户源只能挂个人分类。
-- 为每个 (用户, 原系统分类) 生成一个个人分类，再把源迁过去。
-- ──────────────────────────────────────────────
INSERT OR IGNORE INTO search_source_categories (
    id, major_category_id, name, description, icon, color, display_order,
    is_system, is_active, default_searchable, default_site_type, search_priority,
    created_by, owner_id, created_at, updated_at
)
SELECT
    'uc_' || s.owner_id || '_' || c.id,
    c.major_category_id,
    '我的' || c.name,
    c.description,
    c.icon,
    c.color,
    c.display_order,
    0,
    1,
    c.default_searchable,
    c.default_site_type,
    c.search_priority,
    s.owner_id,
    s.owner_id,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM search_sources s
JOIN search_source_categories c ON s.category_id = c.id
WHERE s.owner_id IS NOT NULL
  AND c.owner_id IS NULL
GROUP BY s.owner_id, c.id;

UPDATE search_sources
SET category_id = 'uc_' || owner_id || '_' || category_id
WHERE owner_id IS NOT NULL
  AND category_id IN (SELECT id FROM search_source_categories WHERE owner_id IS NULL);

-- ──────────────────────────────────────────────
-- 3. 索引
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_major_categories_owner
  ON search_major_categories(owner_id, display_order);

CREATE INDEX IF NOT EXISTS idx_source_categories_owner
  ON search_source_categories(owner_id, major_category_id, display_order);

CREATE INDEX IF NOT EXISTS idx_search_sources_owner
  ON search_sources(owner_id, category_id, display_order);

-- ──────────────────────────────────────────────
-- 4. 缓存版本号
-- 个人树的增删改必须让搜索缓存立即失效；系统树同理。
-- ──────────────────────────────────────────────
ALTER TABLE users ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO system_config (key, value, created_at, updated_at)
VALUES ('search_sources_revision', '0', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- ──────────────────────────────────────────────
-- 5. 清理旧触发器
-- ──────────────────────────────────────────────
-- 每注册一个用户就写全量配置行，既放大写入又与「无配置行 = 启用」语义冲突
DROP TRIGGER IF EXISTS create_default_user_source_configs;

-- 分类一直是软删除，物理删除触发器永远不会命中
DROP TRIGGER IF EXISTS cascade_delete_category_sources;

-- ──────────────────────────────────────────────
-- 6. 归属一致性触发器
-- 允许：系统大类 -> 用户分类；禁止：用户大类 -> 系统分类、系统分类 -> 用户源
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
