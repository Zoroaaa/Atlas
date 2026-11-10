-- 27_cron_read_reduction.sql
--
-- 降低定时任务的 D1 行读取量。
--
-- 背景：
--   data_records 只有 idx_data_records_detail(detail_completed) 这个单列索引。
--   「详情补全」相关的三条查询（每分钟批次、每小时榜单补全、管理页任务进度）
--   都带 record_type='jav' + status='active' + detail_completed=0 条件，
--   但规划器只能先用 detail_completed=0 定位，再把所有类型的未补全记录
--   （movie/anime/actress 等）逐行回表过滤并 JOIN 元数据。
--   未补全记录越多，每次统计/取批要读的行就越多，且每分钟/每小时都会重复。
--
-- 本迁移只新增两个部分索引，把扫描范围收窄，不改任何查询语义与表结构；
-- 未执行时查询仍可运行，只是继续扫描较大的集合。
--
-- 幂等：CREATE INDEX IF NOT EXISTS，可重复执行。
-- 回滚：DROP INDEX IF EXISTS idx_data_records_jav_pending;
--       DROP INDEX IF EXISTS idx_email_queue_cleanup;

CREATE INDEX IF NOT EXISTS idx_data_records_jav_pending
  ON data_records(record_type, status, detail_completed, last_updated_at)
  WHERE record_type = 'jav' AND status = 'active' AND detail_completed = 0;

-- 邮件摘要每 30 分钟清理一次历史队列：
--   DELETE FROM email_queue WHERE status != 'pending' AND created_at < ?
-- 原计划是 SCAN email_queue（整表），队列越大每次扫得越多。
-- 部分索引只包含待清理的非 pending 行，清理改为按 created_at 范围查找。
CREATE INDEX IF NOT EXISTS idx_email_queue_cleanup
  ON email_queue(created_at)
  WHERE status <> 'pending';
