-- ============================================================================
-- 28_query_perf_indexes.sql
-- 查询性能索引（只读审计 P0/P1 中「低风险、可立即改」的索引部分）
--
-- 说明：
--   1) 全部使用 IF NOT EXISTS，可重复执行（幂等）。
--   2) 每条索引后注明其对应的查询位置，便于后续回滚/评估。
--   3) 不改表结构、不改数据；仅新增索引。
-- ============================================================================

-- 1) 我的收藏列表 / 收藏总数
--    查询：community-repository.listFavoritePosts（收藏列表与总数）
--    WHERE user_id = ? AND like_type = 'favorite' ORDER BY created_at DESC
--    现有 idx_likes_type(like_type) 基数过低，会扫全站收藏。
CREATE INDEX IF NOT EXISTS idx_likes_user_type_created
  ON community_likes(user_id, like_type, created_at DESC);

-- 2) 管理端行为日志 / 看板「最近动态」
--    查询：admin-repository.listAdminActions / listDashboardRecentActions
--    ORDER BY created_at DESC（无 WHERE 或仅按 action 过滤）
--    现有索引均以 user_id/action 打头，无法避免整表扫描 + 临时 B 树排序。
CREATE INDEX IF NOT EXISTS idx_actions_created
  ON user_actions(created_at DESC);

-- 3) 管理端用户列表
--    查询：admin-repository.listUsers（用户列表与总数）
--    ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_users_created
  ON users(created_at DESC);

-- 4) 搜索源可用性统计
--    查询：routes/sources.ts GET /api/search-sources/stats
--    LEFT JOIN source_status_cache sc ON sc.source_id = s.id
--    WHERE ... 子查询 ORDER BY created_at DESC LIMIT 1
--    现有 idx_status_cache_source 只有 source_id，取最新一条需要临时 B 树排序。
CREATE INDEX IF NOT EXISTS idx_status_cache_source_created
  ON source_status_cache(source_id, created_at DESC);

-- 5) 社区帖子热榜
--    查询：community-repository.listPosts（sort=hot）
--    WHERE status = ? ORDER BY like_count DESC, view_count DESC, created_at DESC
CREATE INDEX IF NOT EXISTS idx_posts_status_hot
  ON community_posts(status, like_count DESC, view_count DESC, created_at DESC);

-- 6) 管理端举报列表
--    查询：admin-repository.listReports
--    WHERE status = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON community_reports(status, created_at DESC);

-- 7) 数据存储统计（来源分布）
--    查询：routes/data-storage.ts GET /api/admin/data-storage/stats
--    GROUP BY source_name ORDER BY COUNT(*) DESC
CREATE INDEX IF NOT EXISTS idx_record_sources_name
  ON data_record_sources(source_name);
