/**
 * 数据生命周期清理
 *
 * 背景：rate_limits、community_post_views、data_records 三张表只增不减。
 * 其中 rate_limits 与 community_post_views 是纯派生数据（可重建/可再生成），
 * data_records 里只有「未补全详情且无来源」的记录属于可再生元数据，
 * 已补全详情的记录是用户资料库/推荐的唯一数据源，不能按时间清理。
 *
 * D1 单库单线程，批量删除必须限制单次行数，避免一条 SQL 长时间持锁。
 */

/** 浏览量去重窗口只有 24h，保留 30 天足够覆盖任何去重场景 */
const POST_VIEW_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** 仅首条元数据、从未补全、无来源的记录：半年无人再搜即可丢弃 */
const INCOMPLETE_RECORD_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

/** 单批删除行数，避免 D1 长事务 */
const CLEANUP_BATCH_SIZE = 1000;
/** 单次 cron 最多处理批数，把查询次数控制在每次调用预算内 */
const CLEANUP_MAX_BATCHES = 3;

export interface RetentionResult {
  rateLimits: number;
  postViews: number;
  dataRecords: number;
}

/**
 * 用子查询 + LIMIT 分批删除（D1 不支持 DELETE ... LIMIT 语法）。
 * @returns 实际删除行数
 */
async function deleteInBatches(
  db: D1Database,
  table: string,
  condition: string,
  params: (string | number)[],
  maxBatches: number = CLEANUP_MAX_BATCHES,
): Promise<number> {
  let deleted = 0;

  for (let i = 0; i < maxBatches; i++) {
    const result = await db
      .prepare(
        `DELETE FROM ${table} WHERE rowid IN (
           SELECT rowid FROM ${table} WHERE ${condition} LIMIT ?
         )`,
      )
      .bind(...params, CLEANUP_BATCH_SIZE)
      .run();

    const changes = result.meta?.changes ?? 0;
    deleted += changes;
    if (changes < CLEANUP_BATCH_SIZE) break;
  }

  return deleted;
}

export async function runDataRetention(db: D1Database): Promise<RetentionResult> {
  const now = Date.now();

  const rateLimits = await deleteInBatches(db, 'rate_limits', 'reset_at < ?', [now]);
  const postViews = await deleteInBatches(db, 'community_post_views', 'last_viewed_at < ?', [
    now - POST_VIEW_RETENTION_MS,
  ]);
  // 只清理从未补全详情且没有来源链接的记录；已补全记录是资料库/推荐的唯一数据源
  const dataRecords = await deleteInBatches(
    db,
    'data_records',
    'detail_completed = 0 AND source_count = 0 AND last_updated_at < ?',
    [now - INCOMPLETE_RECORD_RETENTION_MS],
  );

  return { rateLimits, postViews, dataRecords };
}
