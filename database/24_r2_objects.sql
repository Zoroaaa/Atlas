-- Atlas 数据库 · R2 对象快照（第二真相源）
-- 依赖：16_cover_assets.sql（cover_assets / data_record_covers）
-- 本文件可重复执行：表/索引使用 IF NOT EXISTS，配置使用 INSERT OR IGNORE。
--
-- 设计说明：
--   为什么需要这张表：代理接口 /api/jav/proxy-image 命中和回源时只写 R2，
--   不写 cover_assets（账本只由回填器维护）。用户浏览收藏、历史、社区帖、
--   榜单、女优作品、即将发售的封面都会进 R2，账本完全不知情，于是
--   「封面管理」的记录数与 R2 实际对象数永远对不上。
--
--   这里把 R2 的真实对象独立登记成第二真相源：r2_objects 只由扫描器写，
--   cover_assets 只由回填器写，对账时用 url_hash 关联查询，互不改写。
--   不在扫描时反填 cover_assets —— R2 不回存原始 URL（customMetadata 只有
--   srcHost / storedAt），反填行的 url 只能是空串，审计与重建能力会永久失效。

CREATE TABLE IF NOT EXISTS r2_objects (
    -- 主键用完整 key 而不是 url_hash：异常/历史格式的 key 也必须能被登记、
    -- 能被回收，否则就是「发现不了也删不掉」这个原始问题换个形式复现
    object_key      TEXT PRIMARY KEY,
    -- key 尾段反解出的 sha256；反解失败（历史/异常格式）为 NULL，不参与账本对账
    url_hash        TEXT,
    namespace       TEXT NOT NULL,
    byte_size       INTEGER NOT NULL DEFAULT 0,
    -- 取 R2 对象的 uploaded，不是首次发现时间。回收「N 天前」只认这个字段
    uploaded_at     INTEGER NOT NULL,
    first_seen_at   INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL,
    -- 连续未扫到的轮数。达到 2 才落 deleted_at：单次 list 抖动或分页边界
    -- 不该被当成「对象已消失」，否则会牵连后面的修账逻辑一起误判
    missing_rounds  INTEGER NOT NULL DEFAULT 0,
    -- 已从 R2 消失（外部删除或本系统回收）的物化标记。
    -- 统计与列表统一用 `deleted_at IS NULL` 过滤，才能命中下面的部分索引
    deleted_at      INTEGER,
    -- 本系统批量回收的时间；下次扫描重新见到该 key 时清空
    reclaimed_at    INTEGER,
    -- 回收后又被访问重建的对象打上保护期，避免反复删同一张热图。
    -- 代理命中后由 CDN 直出，Worker 再也看不到该 key，无法直接观测访问热度，
    -- 只能靠「被删了又回来」这一个信号区分热图与死图
    protect_until   INTEGER
);

-- 普通索引而不是唯一索引：异常 key 可能反解出同一个 hash，
-- 唯一约束会让整批 upsert 失败，得不偿失
CREATE INDEX IF NOT EXISTS idx_r2_objects_hash
  ON r2_objects(url_hash);

-- 对象浏览与按类别统计；谓词必须写成 deleted_at IS NULL 才命中部分索引
CREATE INDEX IF NOT EXISTS idx_r2_objects_ns_uploaded
  ON r2_objects(namespace, uploaded_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_r2_objects_uploaded
  ON r2_objects(uploaded_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS r2_scan_state (
    -- 单行状态机：CHECK 保证只有一行，避免多实例各写一条游标
    id               TEXT PRIMARY KEY CHECK (id = 'current'),
    status           TEXT NOT NULL DEFAULT 'idle'
                     CHECK (status IN ('idle', 'running', 'completed', 'failed')),
    -- 轮次 id，仅用于日志与排障
    scan_id          TEXT,
    -- R2 list 的 opaque cursor；NULL 表示从本轮开头扫
    cursor           TEXT,
    pages_done       INTEGER NOT NULL DEFAULT 0,
    objects_seen     INTEGER NOT NULL DEFAULT 0,
    -- 反解失败、只登记不关联账本的 key 数
    skipped_keys     INTEGER NOT NULL DEFAULT 0,
    -- 0 表示本轮已扫到底
    is_truncated     INTEGER NOT NULL DEFAULT 1,
    started_at       INTEGER,
    completed_at     INTEGER,
    -- 下次允许开新一轮的时间；手动「立即扫描」把它置 0
    next_scan_at     INTEGER NOT NULL DEFAULT 0,
    trigger          TEXT NOT NULL DEFAULT 'cron'
                     CHECK (trigger IN ('cron', 'manual')),
    -- 统计缓存版本号：完成一轮、执行回收后 +1。
    -- cron 没有 request origin，无法构造合法缓存 key 去 delete 边缘缓存，
    -- 把版本号放进 key 就能让旧条目自然过期
    stats_version    INTEGER NOT NULL DEFAULT 0,
    last_error       TEXT,
    updated_at       INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO r2_scan_state (id, status, updated_at, next_scan_at)
VALUES ('current', 'idle', 0, 0);

-- ── 扫描与回收配置 ───────────────────────────────────────
INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('r2_scan_enabled', '1',
   '是否允许定时扫描 R2 封面对象。关闭后看板数字停在上一轮，不影响取图。',
   'boolean', 'features', NULL, NULL, 0, 1, 0, 14, 1794808774000, 1794808774000);

INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('r2_scan_pages_per_tick', '2',
   '每分钟扫描几页 R2 对象（1 页 = 1000 个）。调高会加快一轮完成，但增加单次 CPU 占用。',
   'integer', 'features', '{"min": 1, "max": 5}', NULL, 0, 1, 0, 15, 1794808774000, 1794808774000);

INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('r2_reclaim_enabled', '1',
   '是否允许每日自动回收超期懒加载封面。关闭后只保留看板的手动回收。',
   'boolean', 'features', NULL, NULL, 0, 1, 0, 16, 1794808774000, 1794808774000);

INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('r2_reclaim_days', '90',
   '自动回收的天数阈值：无账本、无记录引用且超过该天数的封面对象会被删除（30-3650）。',
   'integer', 'features', '{"min": 30, "max": 3650}', NULL, 0, 1, 0, 17, 1794808774000, 1794808774000);
