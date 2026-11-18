-- 19_analyze.sql — 重建查询优化器统计信息（sqlite_stat1）
--
-- 为什么需要：D1 不会自动 ANALYZE。没有 sqlite_stat1 时，SQLite 对所有等值条件
-- 都按默认常数（约 10 行）估算，于是把「低选择性列」当成高选择性，选错索引：
--   · data_record_sources WHERE record_id = ? AND source_type = 'magnet'
--     会走 idx_sources_type，扫全部 20 万条磁力行（实测 672ms）
--   · data_records WHERE id IN (...) AND detail_completed = 0
--     会走 idx_data_records_detail，扫全部 pending 记录
--   · data_records WHERE record_type = 'jav' AND status = 'active' AND code IN (...)
--     会走 idx_data_records_status，扫全部 active 记录
-- 执行本脚本后，这三类查询分别改走主键 / record_id 复合定位，单次降到亚毫秒。
--
-- 会过期：data_records 规模翻倍或大批量导入后需要重跑；只重写 sqlite_stat1，
-- 不动业务数据，可以重复执行。
--
-- 执行方式：控制台逐条执行。整份一次性提交可能触发 D1 单语句超时。

ANALYZE data_records;
ANALYZE data_record_sources;
ANALYZE data_record_covers;
ANALYZE jav_detail_meta;
ANALYZE cover_assets;
ANALYZE user_search_history;
-- 17 万行的用户源配置表（用户 × 源 的笛卡尔积），按 user_id 查，缺统计时会误判
ANALYZE user_search_source_configs;
ANALYZE user_actions;
