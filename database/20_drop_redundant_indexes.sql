-- 20_drop_redundant_indexes.sql — 删除零选择性的冗余索引
--
-- 依据：2026-11-18 ANALYZE 之后的 sqlite_stat1（stat 第二列 = 每个索引值平均覆盖的行数）
--   idx_data_records_status  15224 15224  → 每个 status 值覆盖全表，完全不具备过滤能力
--   idx_data_records_detail  15224  7612  → 每个 detail_completed 值覆盖半张表
--
-- 这两个索引在 ANALYZE 之后已不被任何查询计划选中：data_records 的查询要么带
-- record_type（走 idx_data_records_type_*），要么带主键。仅有的两处
-- `WHERE status = 'hidden'`（管理端统计与清理）扫全表 1.5 万行反而比走这个索引更快。
-- 保留它们只会给每次 INSERT/UPDATE 增加一次索引维护。
--
-- 保留说明：
--   idx_sources_type 选择性同样差（32867 行/值），但 source_type = 'ranking' 的子查询仍在用；
--   要删需先合并 data-storage 里那条重复的 IN 子查询，本次不动。
--   idx_data_records_retention (detail_completed, last_updated_at) 有数据保留任务在用，保留。
--
-- 执行后请重跑 ANALYZE data_records（或等 db-maintenance 的 7 天周期）刷新统计。

DROP INDEX IF EXISTS idx_data_records_status;
DROP INDEX IF EXISTS idx_data_records_detail;
