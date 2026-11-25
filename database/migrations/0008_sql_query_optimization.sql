-- 查询性能优化：搜索建议、站内热度历史、JAV 自动补全候选集。
-- 全部为幂等语句，可在已有生产库上重复执行。

-- ── 搜索建议 ─────────────────────────────────────────────
-- 原查询用 query LIKE ? [OR REPLACE(query,'-','') LIKE ?]，LIKE 无法命中普通索引，
-- 实际执行计划是按 source 扫完全部历史（含 30 天窗口外的行）再建临时 B-Tree 分组。
-- 表达式索引把「忽略大小写 + 忽略横杠」的前缀匹配收敛成索引范围扫描；
-- LIKE 仍保留在 SQL 里做精确过滤，结果语义不变。
CREATE INDEX IF NOT EXISTS idx_history_query_key
  ON user_search_history (lower(replace(query, '-', '')), source, created_at);

-- ── 站内热度 ─────────────────────────────────────────────
-- 近 30 天 JAV 搜索历史按 created_at 倒序取窗口；原计划只走 source 索引，
-- 需要对窗口内全部行建临时 B-Tree 排序。
CREATE INDEX IF NOT EXISTS idx_history_source_created
  ON user_search_history (source, created_at DESC);

-- ── JAV 自动补全 ─────────────────────────────────────────
-- 原查询以 data_records 为驱动、按 last_updated_at 排序，必须扫完整个待补全集
-- （约 1.5 万条）才能筛出几十条已到期记录。改以 jav_detail_meta 驱动后，
-- 按 (retry_exhausted, next_retry_at) 直接定位到期集合。
-- 已有的 idx_jav_detail_meta_due 中间夹了 status，next_retry_at 无法作为范围条件。
CREATE INDEX IF NOT EXISTS idx_jav_meta_due
  ON jav_detail_meta (retry_exhausted, next_retry_at);

-- 回填：自动补全改为 INNER JOIN meta 后，所有未补全的 JAV 记录都必须有 meta 行。
-- 写入链路（library-writer / ranking-import / enrichDataRecordFromDetail）都会建 meta，
-- 这里补齐历史遗留记录。missing_mask = 15 对应导演 | 制作商 | 发行商 | 磁力。
INSERT OR IGNORE INTO jav_detail_meta
  (record_id, status, missing_mask, attempts, transient_failures,
   next_retry_at, retry_exhausted, last_error, fetched_at, updated_at)
SELECT
  id, 'pending', 15, 0, 0, 0, 0, NULL, NULL,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM data_records
WHERE record_type = 'jav'
  AND detail_completed = 0
  AND code IS NOT NULL;
