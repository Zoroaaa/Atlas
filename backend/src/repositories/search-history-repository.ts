/**
 * 搜索历史数据访问层
 *
 * 收口 user_search_history 的写入/删除/增强更新与「建议/热门」统计查询，
 * 使 search 路由不再直接持有 SQL。
 */

/** 新增一条搜索历史（results_count 初始为 0，命中结果后回填） */
export async function insertSearchHistory(
  db: D1Database,
  rec: {
    id: string;
    userId: string;
    query: string;
    source: string;
    keyword: string;
    createdAt: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_search_history (id, user_id, query, source, results_count, created_at, keyword)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(rec.id, rec.userId, rec.query, rec.source, rec.createdAt, rec.keyword)
    .run();
}

/** 搜索失败时删除已写入的历史记录 */
export async function deleteSearchHistory(
  db: D1Database,
  id: string,
  userId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM user_search_history WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
}

/** 回填结果数量（通用模式直接使用） */
export async function updateSearchHistoryResultsCount(
  db: D1Database,
  id: string,
  userId: string,
  count: number
): Promise<void> {
  await db
    .prepare('UPDATE user_search_history SET results_count = ? WHERE id = ? AND user_id = ?')
    .bind(count, id, userId)
    .run();
}

/**
 * 应用「历史增强」字段（由 Provider 从结果形态提取），自动附带回填 results_count
 * @param fields 形如 ['title=?', 'cover=?']
 * @param values 与 fields 顺序对应的绑定值
 */
export async function enrichSearchHistory(
  db: D1Database,
  id: string,
  userId: string,
  fields: string[],
  values: (string | number)[],
  resultsCount: number
): Promise<void> {
  const allFields = [...fields, 'results_count=?'];
  const allValues: (string | number)[] = [...values, resultsCount, id, userId];
  await db
    .prepare(`UPDATE user_search_history SET ${allFields.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...allValues)
    .run();
}

/** 全局搜索历史的「建议」前缀统计（近 30 天，按来源过滤） */
export async function querySuggestionStats(
  db: D1Database,
  opts: { since: number; prefix: string; source: string; limit: number }
): Promise<{ keyword: string; count: number }[]> {
  const rows = await db
    .prepare(
      `SELECT query as keyword, COUNT(*) as count
       FROM user_search_history
       WHERE created_at > ? AND query LIKE ? AND (source = ? OR source = 'all')
       GROUP BY query
       ORDER BY count DESC
       LIMIT ?`
    )
    .bind(opts.since, opts.prefix, opts.source, opts.limit)
    .all<{ keyword: string; count: number }>();
  return rows.results || [];
}

/** 全局搜索历史的「热门」统计（时间窗内按次数排序） */
export async function queryTrendingStats(
  db: D1Database,
  opts: { since: number; limit: number }
): Promise<{ keyword: string; count: number }[]> {
  const rows = await db
    .prepare(
      `SELECT query as keyword, COUNT(*) as count
       FROM user_search_history
       WHERE created_at > ?
       GROUP BY query
       ORDER BY count DESC
       LIMIT ?`
    )
    .bind(opts.since, opts.limit)
    .all<{ keyword: string; count: number }>();
  return rows.results || [];
}