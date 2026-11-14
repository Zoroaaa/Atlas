-- 36_query_perf_indexes_phase2.sql
--
-- 第二轮查询性能索引（来自生产 D1「过去 24 小时读取行数排行」审计）。
--
-- 背景：24 小时约 41.6M 行读取，其中多数来自
--   - 管理面板轮询里的全表聚合；
--   - 几个「过滤列没有索引」的查询，单次扫描 4k~67k 行。
-- 本脚本只补索引，不改表结构、不改查询语义。
--
-- 幂等：全部 CREATE INDEX IF NOT EXISTS，可重复执行。
-- 回滚：文件末尾的 DROP 语句，仅删索引，不影响数据。
--
-- 已在生产导出中核对：09/11/22/24/26/27/28/32/33 号脚本的索引均已存在，
-- 本脚本补的是这些脚本之后新增查询所需的索引。

-- 1) 批量补全面板的「最近失败记录」
--    查询：routes/data-storage.ts GET /detail-jobs/current
--          WHERE (last_error IS NOT NULL OR status IN ('partial','absent','error'))
--          ORDER BY m.updated_at DESC LIMIT 20
--    现状：jav_detail_meta 没有 updated_at 索引 → 每次全表扫描 + 临时排序
--          （实测 9.5k 行/次，24h 5.2M）。
CREATE INDEX IF NOT EXISTS idx_jav_meta_recent
  ON jav_detail_meta(updated_at DESC);

-- 2) 30 天重试错峰配额
--    查询：services/jav-detail-meta.ts nextStaggeredRetryAt
--          SELECT COUNT(*) FROM jav_detail_meta
--          WHERE next_retry_at >= ? AND next_retry_at < ?
--    现状：现有 idx_jav_detail_meta_due 以 retry_exhausted/status 打头，
--          用不上这段范围过滤 → 每写一条元数据就全表扫描一次
--          （实测 4.1k 行/次，24h 1.55M）。
CREATE INDEX IF NOT EXISTS idx_jav_meta_retry
  ON jav_detail_meta(next_retry_at);

-- 3) 榜单快照
--    查询：repositories/recommendation-repository.ts getRankingRows
--          WHERE rs.source_type = 'ranking'
--    现状：data_record_sources 只有 (record_id)/(source_name) 索引
--          → 每次全表扫描 65k 行（24h 1.31M，p50 558ms）。
CREATE INDEX IF NOT EXISTS idx_sources_type
  ON data_record_sources(source_type);

-- 4) 入库去重按来源链接回查
--    查询：services/library-record.ts findExistingRecord
--          WHERE s.source_url = ?
--    现状：无索引 → 全表扫描 67k 行（24h 1.55M，p99 204ms）。
--          只索引非空值，避免空串/ NULL 占用空间。
CREATE INDEX IF NOT EXISTS idx_sources_url
  ON data_record_sources(source_url)
  WHERE source_url IS NOT NULL;

-- 5) 推荐信号：某用户是否已有该来源的记录 / 按用户+来源取历史
--    查询：repositories/recommendation-repository.ts（user_id = ? AND source = 'jav_sources'）
--          repositories/genre-repository.ts 同类
--    现状：现有 (user_id, created_at) 无法过滤 source → 每次扫该用户全部历史
--          （24h 0.19M）。
CREATE INDEX IF NOT EXISTS idx_history_user_source
  ON user_search_history(user_id, source);

-- 6) 记录列表 / 趋势的时间轴
--    查询：routes/data-storage.ts listRecords（ORDER BY first_seen_at DESC）
--          GET /stats 的新增时间窗（WHERE first_seen_at > ?）
--    现状：现有 (record_type, first_seen_at) 以 record_type 打头，
--          不带类型过滤时用不上 → 全表扫描 + 排序。
CREATE INDEX IF NOT EXISTS idx_data_records_first_seen
  ON data_records(first_seen_at DESC);

-- 7) 入库去重按标题回查
--    查询：services/library-record.ts findExistingRecord
--          WHERE title = ? AND record_type = ?
--    现状：无索引 → 每次扫描 4k 行（24h 0.14M）。
CREATE INDEX IF NOT EXISTS idx_data_records_type_title
  ON data_records(record_type, title);

-- 回滚（按需逐条执行）：
-- DROP INDEX IF EXISTS idx_jav_meta_recent;
-- DROP INDEX IF EXISTS idx_jav_meta_retry;
-- DROP INDEX IF EXISTS idx_sources_type;
-- DROP INDEX IF EXISTS idx_sources_url;
-- DROP INDEX IF EXISTS idx_history_user_source;
-- DROP INDEX IF EXISTS idx_data_records_first_seen;
-- DROP INDEX IF EXISTS idx_data_records_type_title;
