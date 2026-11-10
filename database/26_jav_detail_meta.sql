-- 26_jav_detail_meta.sql
--
-- JAV 详情完整度与批量补全任务。
--
-- 背景：
--   1. 旧逻辑只要抓过详情页就把 data_records.detail_completed 置 1，
--      不检查导演/制作商/发行商/磁力是否真的拿到，导致「标记完整但缺字段」。
--   2. 榜单补全任务只抓详情页、不抓磁力，写出的记录磁力恒为空。
--
-- 本迁移只使用 CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING /
-- 确定性 UPDATE，可重复执行（D1 不支持 ALTER TABLE ... IF NOT EXISTS，
-- 因此新增状态字段放在独立表，而不是改 data_records 结构）。
--
-- missing_mask 位定义：
--   1 = 缺导演   2 = 缺制作商   4 = 缺发行商   8 = 缺磁力

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

CREATE INDEX IF NOT EXISTS idx_jav_detail_meta_due
  ON jav_detail_meta (retry_exhausted, status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_jav_detail_meta_missing
  ON jav_detail_meta (missing_mask);

CREATE TABLE IF NOT EXISTS detail_fetch_jobs (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL DEFAULT 'running', -- running | done
  batch_size        INTEGER NOT NULL DEFAULT 10,
  interval_seconds  INTEGER NOT NULL DEFAULT 60,
  total             INTEGER NOT NULL DEFAULT 0,
  processed         INTEGER NOT NULL DEFAULT 0,
  completed         INTEGER NOT NULL DEFAULT 0,
  partial           INTEGER NOT NULL DEFAULT 0,
  absent            INTEGER NOT NULL DEFAULT 0,
  transient_failed  INTEGER NOT NULL DEFAULT 0,
  skipped           INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_by        TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  finished_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_detail_fetch_jobs_status
  ON detail_fetch_jobs (status, created_at DESC);

-- 同一时间只允许一个 running 任务，避免不同管理员/重复点击叠加批次
CREATE UNIQUE INDEX IF NOT EXISTS uniq_detail_fetch_jobs_running
  ON detail_fetch_jobs (status) WHERE status = 'running';

-- ─── 回填现有 JAV 记录 ────────────────────────────────────────────────
-- 兼容 content_data 中的 director/maker/publisher 以及 publishers/directors/makers 数组。
INSERT INTO jav_detail_meta (
  record_id, status, missing_mask, attempts, transient_failures,
  next_retry_at, retry_exhausted, last_error, fetched_at, updated_at
)
SELECT
  d.id,
  CASE
    WHEN d.detail_completed = 0 THEN 'pending'
    WHEN (
      CASE WHEN COALESCE(
        NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.director') END), ''),
        NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.directors[0]') END), '')
      ) IS NULL THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(
        NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.maker') END), ''),
        NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.makers[0]') END), '')
      ) IS NULL THEN 2 ELSE 0 END
      + CASE WHEN COALESCE(
        NULLIF(TRIM(d.publisher), ''),
        NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.publisher') END), '')
      ) IS NULL THEN 4 ELSE 0 END
      + CASE WHEN EXISTS (
        SELECT 1 FROM data_record_sources s
        WHERE s.record_id = d.id AND s.source_type = 'magnet'
      ) THEN 0 ELSE 8 END
    ) = 0 THEN 'complete'
    ELSE 'partial'
  END,
  (
    CASE WHEN COALESCE(
      NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.director') END), ''),
      NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.directors[0]') END), '')
    ) IS NULL THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(
      NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.maker') END), ''),
      NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.makers[0]') END), '')
    ) IS NULL THEN 2 ELSE 0 END
    + CASE WHEN COALESCE(
      NULLIF(TRIM(d.publisher), ''),
      NULLIF(TRIM(CASE WHEN json_valid(d.content_data) THEN json_extract(d.content_data, '$.publisher') END), '')
    ) IS NULL THEN 4 ELSE 0 END
    + CASE WHEN EXISTS (
      SELECT 1 FROM data_record_sources s
      WHERE s.record_id = d.id AND s.source_type = 'magnet'
    ) THEN 0 ELSE 8 END
  ),
  0, 0, 0, 0, NULL,
  CASE WHEN d.detail_completed = 1 THEN COALESCE(d.last_updated_at, 0) ELSE NULL END,
  COALESCE(d.last_updated_at, 0)
FROM data_records d
WHERE d.record_type = 'jav' AND 1 = 1
ON CONFLICT(record_id) DO NOTHING;

-- 纠正历史「假完整」：只有四个字段齐全的记录才保留 detail_completed = 1。
UPDATE data_records
SET detail_completed = CASE
  WHEN id IN (SELECT record_id FROM jav_detail_meta WHERE missing_mask = 0) THEN 1
  ELSE 0
END
WHERE record_type = 'jav' AND 1 = 1;
