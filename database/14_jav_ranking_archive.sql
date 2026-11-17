-- Atlas 数据库 · JAV 榜单归档
-- 依赖：08_jav_library.sql
-- 本文件可重复执行：建表/索引使用 IF NOT EXISTS，历史回填使用 INSERT OR IGNORE。
--
-- 设计说明：
--   data_record_sources 里的 ranking 行只用于「当前榜单」读取，无法高效按
--   周期 / 分类 / 年份筛选历史。这里把每次导入拆成 snapshot + entry 两层：
--     jav_ranking_snapshots  一个榜单通道的一次快照
--     jav_ranking_entries    该快照里的名次明细（保留标题/封面/评分当时值）
--   TOP250 与年度榜只写归档表，不写 data_record_sources，避免拖慢现有榜单读取。
--
-- 历史回填说明：
--   data_record_sources 按 (record_id, source_name, source_url) upsert，只保留每部作品
--   最后一次出现的 fetchedAt。按 fetchedAt 分组回填得到的是「最后出现日期」队列，
--   不是完整的历史榜单，但可作为缺失历史的近似补档。
--   只回填今天以前的数据：当天的真实导入快照已由导入服务写入，避免同日重复。

CREATE TABLE IF NOT EXISTS jav_ranking_snapshots (
    snapshot_key TEXT PRIMARY KEY,               -- source_name + ':' + 周期 + ':' + 抓取日
    source_name  TEXT NOT NULL,                  -- 如 JavDB:有码周榜 / JavDB:TOP250全部
    list_type    TEXT NOT NULL,                  -- weekly | monthly | top250 | yearly
    section      TEXT NOT NULL,                  -- censored | uncensored | western | fc2 | all
    year         INTEGER,                        -- 年度榜年份；其他榜单为 NULL
    snapshot_at  INTEGER NOT NULL,               -- 抓取时间（毫秒）
    item_count   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jav_ranking_entries (
    id           TEXT PRIMARY KEY,               -- snapshot_key + ':' + code
    snapshot_key TEXT NOT NULL,
    record_id    TEXT,                           -- 关联 data_records.id；记录被删除后仍保留快照
    code         TEXT NOT NULL,
    title        TEXT,
    cover        TEXT,
    rank         INTEGER NOT NULL,
    score        TEXT,
    url          TEXT,
    list_type    TEXT NOT NULL,
    section      TEXT NOT NULL,
    year         INTEGER,
    source_name  TEXT NOT NULL,
    snapshot_at  INTEGER NOT NULL,
    created_at   INTEGER NOT NULL,
    UNIQUE(snapshot_key, code)
);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_snapshots_filter
    ON jav_ranking_snapshots(list_type, section, year, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_snapshots_time
    ON jav_ranking_snapshots(snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_entries_latest
    ON jav_ranking_entries(list_type, section, year, snapshot_at DESC, rank);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_entries_snapshot
    ON jav_ranking_entries(snapshot_key, rank);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_entries_code
    ON jav_ranking_entries(code);

CREATE INDEX IF NOT EXISTS idx_jav_ranking_entries_time
    ON jav_ranking_entries(snapshot_at DESC);

-- ── 历史回填：周榜/月榜（按作品最后出现的 fetchedAt 分组，只补今天以前） ──
INSERT OR IGNORE INTO jav_ranking_snapshots
    (snapshot_key, source_name, list_type, section, year, snapshot_at, item_count, created_at)
SELECT
    rs.source_name || ':' || CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER),
    rs.source_name,
    CASE json_extract(rs.source_data, '$.period')
        WHEN 'weekly' THEN 'weekly'
        WHEN 'monthly' THEN 'monthly'
        ELSE json_extract(rs.source_data, '$.period')
    END,
    COALESCE(json_extract(rs.source_data, '$.section'), 'censored'),
    NULL,
    CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER),
    COUNT(*),
    MIN(rs.created_at)
FROM data_record_sources rs
WHERE rs.source_type = 'ranking'
  AND json_valid(rs.source_data)
  AND json_extract(rs.source_data, '$.period') IN ('weekly', 'monthly')
  AND CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER)
      < CAST(strftime('%s', date('now', '+8 hours'), '-8 hours') AS INTEGER) * 1000
GROUP BY 1, 2, 3, 4, 5, 6;

INSERT OR IGNORE INTO jav_ranking_entries
    (id, snapshot_key, record_id, code, title, cover, rank, score, url,
     list_type, section, year, source_name, snapshot_at, created_at)
SELECT
    rs.source_name || ':' || CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER)
        || ':' || d.code,
    rs.source_name || ':' || CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER),
    rs.record_id,
    d.code,
    d.title,
    d.cover,
    CAST(json_extract(rs.source_data, '$.rank') AS INTEGER),
    CAST(json_extract(rs.source_data, '$.score') AS TEXT),
    json_extract(rs.source_data, '$.url'),
    CASE json_extract(rs.source_data, '$.period')
        WHEN 'weekly' THEN 'weekly'
        WHEN 'monthly' THEN 'monthly'
        ELSE json_extract(rs.source_data, '$.period')
    END,
    COALESCE(json_extract(rs.source_data, '$.section'), 'censored'),
    NULL,
    rs.source_name,
    CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER),
    rs.created_at
FROM data_record_sources rs
JOIN data_records d ON d.id = rs.record_id
WHERE rs.source_type = 'ranking'
  AND d.record_type = 'jav'
  AND d.code IS NOT NULL
  AND json_valid(rs.source_data)
  AND json_extract(rs.source_data, '$.period') IN ('weekly', 'monthly')
  AND CAST(json_extract(rs.source_data, '$.rank') AS INTEGER) > 0
  AND CAST(COALESCE(json_extract(rs.source_data, '$.fetchedAt'), rs.created_at) AS INTEGER)
      < CAST(strftime('%s', date('now', '+8 hours'), '-8 hours') AS INTEGER) * 1000;

-- ── 历史上「只有列表级信息」的 JAV 记录补缺失字段标记 ──
-- 这些记录大多来自榜单/关注/标签/实体浏览，天然没有磁力、导演、制作商、发行商。
-- 只补没有 meta 行的记录，不覆盖已有的补全状态。
INSERT OR IGNORE INTO jav_detail_meta
    (record_id, status, missing_mask, attempts, transient_failures,
     next_retry_at, retry_exhausted, last_error, fetched_at, updated_at)
SELECT id, 'pending', 15, 0, 0, 0, 0, NULL, NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM data_records
WHERE record_type = 'jav'
  AND detail_completed = 0;
