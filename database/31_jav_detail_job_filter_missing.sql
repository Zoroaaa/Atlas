-- 31_jav_detail_job_filter_missing.sql
--
-- 给 detail_fetch_jobs 增加 filter_missing：本次任务只补「缺哪一类字段」的记录。
--
-- 为什么需要：
--   面板上的四个入口（磁力缺失 / 缺导演 / 缺制作商 / 缺发行商）只决定
--   「筛哪些记录」，抓取仍然是完整详情（字段全写）。
--   任务是由每分钟 cron 分批推进的，筛选条件必须随任务落库，
--   否则下一个 tick 就丢了条件，会退化成补全所有记录。
--
-- 取值：magnets | director | maker | publisher | NULL（NULL = 不限，全部待补记录）
--
-- 为什么重建表：
--   D1 / SQLite 不支持 ALTER TABLE ... ADD COLUMN IF NOT EXISTS，
--   沿用 30 号脚本的做法：建新表 → 拷贝 → 删旧表 → 改名，可重复执行。
--
-- 前置：需先执行 30_jav_detail_job_drop_interval.sql（表结构为最新）。
-- 影响：正在运行的任务原样保留（status/progress 不变），新增列默认 NULL。

DROP TABLE IF EXISTS detail_fetch_jobs_new;

CREATE TABLE detail_fetch_jobs_new (
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

INSERT INTO detail_fetch_jobs_new (
  id, status, batch_size, total, processed, completed, partial, absent,
  transient_failed, skipped, last_error, created_by, filter_missing,
  created_at, updated_at, finished_at
)
SELECT
  id, status, batch_size, total, processed, completed, partial, absent,
  transient_failed, skipped, last_error, created_by, NULL,
  created_at, updated_at, finished_at
FROM detail_fetch_jobs;

DROP TABLE detail_fetch_jobs;

ALTER TABLE detail_fetch_jobs_new RENAME TO detail_fetch_jobs;

CREATE INDEX IF NOT EXISTS idx_detail_fetch_jobs_status
  ON detail_fetch_jobs (status, created_at DESC);

-- 同一时间只允许一个 running 任务
CREATE UNIQUE INDEX IF NOT EXISTS uniq_detail_fetch_jobs_running
  ON detail_fetch_jobs (status) WHERE status = 'running';
