-- 初始化搜索关键词统计表：从现有搜索历史聚合数据
-- 运行时机：部署 16_search_keyword_stats.sql 之后立即执行
-- 说明：将历史数据按 keyword 汇总到 search_keyword_stats，避免新表空数据导致建议变少

INSERT INTO search_keyword_stats (keyword, count, created_at, updated_at)
SELECT
  query as keyword,
  COUNT(*) as count,
  MIN(created_at) as created_at,
  MAX(created_at) as updated_at
FROM user_search_history
WHERE query IS NOT NULL AND TRIM(query) <> ''
GROUP BY query
ON CONFLICT(keyword) DO UPDATE SET
  count = count + EXCLUDED.count,
  updated_at = MAX(search_keyword_stats.updated_at, EXCLUDED.updated_at);