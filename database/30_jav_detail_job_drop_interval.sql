-- 30_jav_detail_job_drop_interval.sql
--
-- 删除 detail_fetch_jobs.interval_seconds。
--
-- 为什么删：
--   该列只有写入、从未被任何代码读取。
--   真实节流来自「每分钟 cron 一次 + 批内每条间隔 4 秒」，
--   保留一个写着 60、却完全不起作用的配置项，只会让人误以为可以调整推进频率。
--
-- 为什么重建表：
--   D1 / SQLite 不支持 ALTER TABLE ... DROP COLUMN IF EXISTS，
--   用「建新表 → 拷贝 → 删旧表 → 改名」实现，且可重复执行：
--   每次执行先丢弃临时表，再按当前数据重建，重复执行结果一致。
--
-- 前置：需先执行 26_jav_detail_meta.sql（detail_fetch_jobs 已存在）。
-- 影响：正在运行的任务记录原样保留（status/progress 不变），只是少一列。

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
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  finished_at       INTEGER
);

INSERT INTO detail_fetch_jobs_new (
  id, status, batch_size, total, processed, completed, partial, absent,
  transient_failed, skipped, last_error, created_by, created_at, updated_at, finished_at
)
SELECT
  id, status, batch_size, total, processed, completed, partial, absent,
  transient_failed, skipped, last_error, created_by, created_at, updated_at, finished_at
FROM detail_fetch_jobs;

DROP TABLE detail_fetch_jobs;

ALTER TABLE detail_fetch_jobs_new RENAME TO detail_fetch_jobs;

CREATE INDEX IF NOT EXISTS idx_detail_fetch_jobs_status
  ON detail_fetch_jobs (status, created_at DESC);

-- 同一时间只允许一个 running 任务
CREATE UNIQUE INDEX IF NOT EXISTS uniq_detail_fetch_jobs_running
  ON detail_fetch_jobs (status) WHERE status = 'running';
