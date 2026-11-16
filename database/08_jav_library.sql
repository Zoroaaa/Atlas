-- Atlas 数据库 · JAV Library：作品库 / 来源 / 标签词典 / 详情补全 / 实体别名
-- 依赖：01_core.sql
-- 本文件可重复执行：表/视图/索引/触发器均使用 IF NOT EXISTS，种子数据使用 INSERT OR IGNORE。

-- ──────────────────────────────────────────────
-- 表
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_records (
    id TEXT PRIMARY KEY,                        -- 记录唯一标识
    record_type TEXT NOT NULL CHECK (record_type IN ('jav','anime','movie','manga','novel','actress')),
    dedup_key TEXT NOT NULL,                    -- 去重键（如 jav:ABC-123 / anime:bgm:123）
    title TEXT NOT NULL,                        -- 标题
    cover TEXT,                                 -- 封面图URL
    code TEXT,                                  -- 番号或外部ID（原始值，便于检索）
    actors TEXT,                                -- 演员（JSON数组字符串或逗号分隔）
    duration TEXT,                              -- 时长
    release_date TEXT,                          -- 发行时间
    publisher TEXT,                             -- 发行商/制作方
    tags TEXT DEFAULT '[]',                     -- 标签（JSON数组字符串）
    rating TEXT,                                -- 评分（文本，如 "8.5 分"）
    content_data TEXT NOT NULL,                 -- 完整类型特定数据（JSON字符串）
    detail_completed INTEGER DEFAULT 0,         -- 0=仅首条元数据 1=已补充完整详情
    status TEXT DEFAULT 'active',               -- 状态（active/hidden）
    source_count INTEGER DEFAULT 0,             -- 来源链接数（冗余计数，触发器维护）
    first_seen_at INTEGER NOT NULL,             -- 首次采集时间
    last_updated_at INTEGER NOT NULL,           -- 最近更新时间
    UNIQUE(record_type, dedup_key)              -- 去重核心约束
);

CREATE TABLE IF NOT EXISTS data_record_sources (
    id TEXT PRIMARY KEY,                        -- 来源记录唯一标识
    record_id TEXT NOT NULL,                    -- 关联 data_records.id
    source_name TEXT NOT NULL,                  -- 来源名称（JavBus/Bangumi/TMDB 等）
    source_type TEXT,                           -- 类型（detail/magnet/stream/info）
    source_url TEXT,                            -- 来源URL
    source_data TEXT DEFAULT '{}',              -- 来源特定数据（JSON，如磁力的 size/date/isHD）
    created_at INTEGER NOT NULL,                -- 创建时间
    UNIQUE(record_id, source_name, source_url), -- 同源同URL不重复
    FOREIGN KEY (record_id) REFERENCES data_records (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jav_genres (
    -- 稳定主键：section + name_key，避免同名标签跨 section 冲突
    id            TEXT PRIMARY KEY,
    -- 归一化名（valueKey：小写 + 去空白），跨 section 唯一：同名标签只保留一条
    name_key      TEXT NOT NULL UNIQUE,
    -- 展示名，取自站点锚文本
    name          TEXT NOT NULL,
    -- URL slug，如 4g / hd
    genre_key     TEXT NOT NULL,
    -- 'censored' | 'uncensored'
    section       TEXT NOT NULL,
    -- 完整 URL，由 section + genre_key 在服务端拼接（不接受前端传 URL）
    url           TEXT NOT NULL,
    -- 技术/发行属性标签由同步时用 isTechnicalTag 直接算好，查询零成本
    is_technical  INTEGER NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jav_genre_pages (
    name_key      TEXT PRIMARY KEY,
    -- 从分页窗口学到过 / 成功抓到过的最大页码
    max_page_seen INTEGER NOT NULL DEFAULT 1,
    -- >0 表示已确认末页；0 表示未知
    last_page     INTEGER NOT NULL DEFAULT 0,
    -- 上次扩张探测的页码
    last_page_p   INTEGER NOT NULL DEFAULT 0,
    probed_at     INTEGER NOT NULL DEFAULT 0,
    updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jav_detail_meta (
  record_id           TEXT PRIMARY KEY,
  -- pending: 从未成功抓取 / complete: 四个字段齐全 / partial: 抓到了但缺字段
  -- absent: 源站确认没有该番号或确实没有这些字段 / error: 暂时失败（网络/拦截）
  status              TEXT NOT NULL DEFAULT 'pending',
  missing_mask        INTEGER NOT NULL DEFAULT 0,
  -- 只统计「源站缺失」次数；超时、网络、拦截走 transient_failures，不消耗重试次数
  attempts            INTEGER NOT NULL DEFAULT 0,
  transient_failures  INTEGER NOT NULL DEFAULT 0,
  next_retry_at       INTEGER NOT NULL DEFAULT 0,
  retry_exhausted     INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  fetched_at          INTEGER,
  updated_at          INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (record_id) REFERENCES data_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "detail_fetch_jobs" (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL DEFAULT 'running', -- running | done
  batch_size        INTEGER NOT NULL DEFAULT 10,
  total             INTEGER NOT NULL DEFAULT 0,
  processed         INTEGER NOT NULL DEFAULT 0,
  completed         INTEGER NOT NULL DEFAULT 0,
  partial           INTEGER NOT NULL DEFAULT 0,
  absent            INTEGER NOT NULL DEFAULT 0,
  transient_failed  INTEGER NOT NULL DEFAULT 0,
  skipped           INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_by        TEXT,
  -- 只补哪一类缺失：magnets | director | maker | publisher；NULL 表示不限
  filter_missing    TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  finished_at       INTEGER
);

CREATE TABLE IF NOT EXISTS entity_aliases (
    id            TEXT PRIMARY KEY,
    -- 实体类型：work（作品）/ person（人物）/ tag（标签）
    entity_type   TEXT NOT NULL,
    -- 全局唯一实体 id，如 tmdb:movie:278、bangumi:253、wikidata:Q123
    canonical_id  TEXT NOT NULL,
    -- 别名语言：zh / zh-TW / ja / en / romaji / pinyin
    lang          TEXT NOT NULL,
    -- 展示用原文
    alias         TEXT NOT NULL,
    -- 查询键：NFKC + 小写 + 去空白/标点
    alias_key     TEXT NOT NULL,
    -- 数据来源：manual / tmdb / wikidata / wikipedia / bangumi / mangadex / ai
    source        TEXT NOT NULL,
    -- 置信度 0~1：人工 1.0、元数据 0.9、AI 候选校验通过 0.5
    confidence    REAL NOT NULL DEFAULT 1.0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    UNIQUE(entity_type, canonical_id, lang, alias_key)
);

-- ──────────────────────────────────────────────
-- 索引
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_data_records_type_seen ON data_records(record_type, first_seen_at);

CREATE INDEX IF NOT EXISTS idx_data_records_status ON data_records(status);

CREATE INDEX IF NOT EXISTS idx_data_records_detail ON data_records(detail_completed);

CREATE INDEX IF NOT EXISTS idx_data_records_code ON data_records(code) WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_record_sources_record ON data_record_sources(record_id);

CREATE INDEX IF NOT EXISTS idx_jav_genres_usable
  ON jav_genres(section, is_technical, sort_order);

CREATE INDEX IF NOT EXISTS idx_jav_genres_key
  ON jav_genres(name_key);

CREATE INDEX IF NOT EXISTS idx_data_records_retention
    ON data_records(detail_completed, last_updated_at);

CREATE INDEX IF NOT EXISTS idx_jav_detail_meta_due
  ON jav_detail_meta (retry_exhausted, status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_jav_detail_meta_missing
  ON jav_detail_meta (missing_mask);

CREATE INDEX IF NOT EXISTS idx_data_records_jav_pending
  ON data_records(record_type, status, detail_completed, last_updated_at)
  WHERE record_type = 'jav' AND status = 'active' AND detail_completed = 0;

CREATE INDEX IF NOT EXISTS idx_record_sources_name
  ON data_record_sources(source_name);

CREATE INDEX IF NOT EXISTS idx_detail_fetch_jobs_status
  ON detail_fetch_jobs (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_detail_fetch_jobs_running
  ON detail_fetch_jobs (status) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_entity_aliases_lookup
  ON entity_aliases(entity_type, alias_key);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical
  ON entity_aliases(entity_type, canonical_id);

CREATE INDEX IF NOT EXISTS idx_data_records_type_code
  ON data_records (record_type, code);

CREATE INDEX IF NOT EXISTS idx_jav_meta_recent
  ON jav_detail_meta(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_jav_meta_retry
  ON jav_detail_meta(next_retry_at);

CREATE INDEX IF NOT EXISTS idx_sources_type
  ON data_record_sources(source_type);

CREATE INDEX IF NOT EXISTS idx_sources_url
  ON data_record_sources(source_url)
  WHERE source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_records_first_seen
  ON data_records(first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_records_type_title
  ON data_records(record_type, title);

-- ──────────────────────────────────────────────
-- 触发器
-- ──────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS update_source_count_after_insert
AFTER INSERT ON data_record_sources
BEGIN
    UPDATE data_records SET source_count = source_count + 1 WHERE id = NEW.record_id;
END;

CREATE TRIGGER IF NOT EXISTS update_source_count_after_delete
AFTER DELETE ON data_record_sources
BEGIN
    UPDATE data_records SET source_count = source_count - 1 WHERE id = OLD.record_id;
END;
