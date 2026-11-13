-- 35_jav_detail_job_batch_size_5.sql
--
-- 每分钟补全条数从 10 调整为 5。
-- 新任务由接口/常量的默认值写入 5；这里把调整前创建、仍在 running 的任务
-- 统一改成 5，避免它继续按旧批量 10 跑完整批。
-- 可重复执行：第二次执行时已无 batch_size = 10 的 running 任务。

UPDATE detail_fetch_jobs
SET batch_size = 5,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE status = 'running'
  AND batch_size = 10;
