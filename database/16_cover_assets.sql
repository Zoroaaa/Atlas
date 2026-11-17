-- Atlas 数据库 · R2 封面缓存账本
-- 依赖：08_jav_library.sql（data_records）
-- 本文件可重复执行：表/索引使用 IF NOT EXISTS，配置使用 INSERT OR IGNORE。
--
-- 设计说明：
--   data_records.cover 仍是唯一业务事实，不改写。
--   cover_assets 按「归一化 URL 的 sha256」去重，记录 URL ↔ R2 对象；
--   data_record_covers 记录「这条记录处理过哪个 cover」，用于精确统计与增量回填。
--   取图链路只依赖 URL 的纯函数（见 backend/src/services/media-key.ts），不依赖这两张表。

CREATE TABLE IF NOT EXISTS cover_assets (
    url_hash        TEXT PRIMARY KEY,             -- sha256(归一化 URL)，64 位小写 hex
    url             TEXT NOT NULL,                -- 归一化后的完整地址（审计 / 重建）
    namespace       TEXT NOT NULL,                -- jav/anime/movie/manga/novel/person/misc
    object_key      TEXT NOT NULL UNIQUE,         -- covers/v1/orig/<ns>/<h2>/<hash>
    status          TEXT NOT NULL DEFAULT 'ready'
                    CHECK (status IN ('ready', 'missing', 'failed')),
    mime_type       TEXT,
    byte_size       INTEGER,
    source_host     TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    retry_exhausted INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_retry_at   INTEGER NOT NULL DEFAULT 0,
    first_seen_at   INTEGER NOT NULL,
    stored_at       INTEGER,
    updated_at      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cover_assets_retry
  ON cover_assets(status, retry_exhausted, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_cover_assets_host
  ON cover_assets(source_host);

CREATE TABLE IF NOT EXISTS data_record_covers (
    record_id  TEXT PRIMARY KEY,
    cover_url  TEXT NOT NULL,                     -- 处理时的 data_records.cover 快照
    url_hash   TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (record_id) REFERENCES data_records(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_data_record_covers_hash
  ON data_record_covers(url_hash);

-- 回填按「最近更新优先」扫描；谓词与候选查询保持一致，SQLite 才会命中该索引
CREATE INDEX IF NOT EXISTS idx_data_records_cover_updated
  ON data_records(last_updated_at DESC)
  WHERE cover IS NOT NULL AND trim(cover) <> '';

-- 封面回填开关：默认关闭，部署完成并创建 bucket 后在「封面管理」页打开
INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('cover_backfill_enabled', '0',
   '是否推进本地库封面回填到 R2。关闭后分钟 cron 跳过推进，懒加载缓存不受影响。',
   'boolean', 'features', NULL, NULL, 0, 1, 0, 12, 1794808774000, 1794808774000);

INSERT OR IGNORE INTO "system_config"
  ("key", "value", "description", "config_type", "config_group", "validation_rules",
   "options", "is_public", "is_resettable", "is_sensitive", "display_order", "created_at", "updated_at")
VALUES
  ('cover_backfill_batch_size', '20',
   '封面回填每分钟处理条数（1-100）。调高会加快迁移，但增加上游源站限流风险。',
   'integer', 'features', '{"min": 1, "max": 100}', NULL, 0, 1, 0, 13, 1794808774000, 1794808774000);
