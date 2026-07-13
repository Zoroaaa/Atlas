-- 性能优化索引：解决高读取行数问题
-- 创建时间：2026-07-11
-- 问题：搜索建议和分析事件查询全表扫描导致80万+读取行数

-- 1. 搜索历史表：为时间范围+关键词查询创建复合索引
-- 用途：/api/search/suggestions 查询只需扫描近期数据而非全表
CREATE INDEX IF NOT EXISTS idx_history_created_query ON user_search_history(created_at, query);

-- 2. 分析事件表：为时间范围查询创建索引
-- 用途：所有分析统计查询添加时间过滤后可走此索引
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);

-- 3. 分析事件表：时间+用户复合索引（已有idx_analytics_user_created，补充纯时间索引）
-- 用途：用户维度统计时使用
-- 已存在：idx_analytics_user_created(user_id, created_at)，无需重复创建

-- 说明：
-- - idx_history_created_query 让 WHERE created_at > ? AND query LIKE ? 走索引
-- - idx_analytics_created 让 WHERE created_at > ? 走索引，避免全表扫描