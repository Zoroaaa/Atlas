-- ============================================================================
-- 22_indexes_data_retention.sql
--
-- 数据生命周期清理所需索引。
--
-- 背景：每小时 cron 新增了分批清理（backend/src/services/data-retention.ts）：
--   - rate_limits：按 reset_at 清理过期窗口（04 已有 idx_rate_limits_reset，无需新建）
--   - community_post_views：按 last_viewed_at 清理 30 天前的去重记录（19 只有 post_id 索引）
--   - data_records：按 detail_completed + last_updated_at 清理 180 天前的未补全记录
--     仅清理 detail_completed = 0 且 source_count = 0 的记录，
--     已补全详情的是资料库/推荐唯一数据源，不参与清理。
--
-- 幂等：全部 CREATE INDEX IF NOT EXISTS，可在全新库与已升级库重复执行。
-- 回滚：DROP INDEX IF EXISTS idx_post_views_last_viewed;
--       DROP INDEX IF EXISTS idx_data_records_retention;
--       仅删除索引，不影响数据；不建索引清理仍可运行，只是扫描变慢。
-- ============================================================================

-- 社区帖子浏览去重：按时间清理
CREATE INDEX IF NOT EXISTS idx_post_views_last_viewed
    ON community_post_views(last_viewed_at);

-- 数据记录保留策略：detail_completed + last_updated_at 组合过滤
CREATE INDEX IF NOT EXISTS idx_data_records_retention
    ON data_records(detail_completed, last_updated_at);
