/**
 * D1 运维任务：定期刷新查询优化器统计（ANALYZE）。
 *
 * 为什么需要：D1 不会自动 ANALYZE。sqlite_stat1 缺失时，SQLite 对所有等值条件
 * 都按默认常数（约 10 行）估算，会把低选择性列当成高选择性，从而选错索引。
 * 统计信息还会随数据增长失真，所以需要周期性重跑，而不是只依赖一次性手工执行。
 *
 * 这里只做运维语句，不承载业务读写。
 */
import type { D1Database } from '@cloudflare/workers-types';

/** 上次执行时间，存在 system_config 里跨实例共享；Worker 内存态在冷启动后会丢 */
const LAST_ANALYZE_KEY = 'db_analyze_at';
/** 7 天一轮：ANALYZE 要扫全表并写 sqlite_stat1，频率再高只是白烧写入额度 */
const ANALYZE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * 逐表执行，避免单条 `ANALYZE`（全库）在 341MB 的库上触发 D1 语句超时。
 * 只覆盖当前有慢查询的表；新增热点表时同步加到这里和 19_analyze.sql。
 */
const ANALYZE_TABLES = [
  'data_records',
  'data_record_sources',
  'data_record_covers',
  'jav_detail_meta',
  'cover_assets',
  'user_search_history',
  'user_search_source_configs',
  'user_actions',
];

export interface AnalyzeRunResult {
  ran: boolean;
  tables: number;
  /** 走降级路径时记录原因，便于从 cron 日志发现 D1 拒绝 ANALYZE */
  fallback?: string;
}

/**
 * 到周期才执行，未到期直接返回。失败不抛出：统计刷新失败不应影响同批次的
 * 业务任务，但要记 fallback 让 cron 日志能定位。
 */
export async function runPeriodicAnalyze(db: D1Database): Promise<AnalyzeRunResult> {
  const now = Date.now();
  const row = await db
    .prepare('SELECT value FROM system_config WHERE key = ?')
    .bind(LAST_ANALYZE_KEY)
    .first<{ value: string | null }>();

  const last = Number(row?.value ?? 0);
  if (Number.isFinite(last) && last > 0 && now - last < ANALYZE_INTERVAL_MS) {
    return { ran: false, tables: 0 };
  }

  let tables = 0;
  let fallback: string | undefined;
  try {
    for (const table of ANALYZE_TABLES) {
      await db.prepare(`ANALYZE ${table}`).run();
      tables += 1;
    }
  } catch (err) {
    // 若 D1 对 ANALYZE 的 prepared statement 有限制，退回官方文档支持的 PRAGMA optimize
    fallback = err instanceof Error ? err.message : String(err);
    try {
      await db.prepare('PRAGMA optimize').run();
    } catch (fallbackErr) {
      console.error('[db-maintenance] analyze fallback failed:', fallbackErr);
    }
  }

  // 成功与降级都记录时间：否则失败时每小时重试一次，白白占写额度
  await db
    .prepare(
      `INSERT INTO system_config
         (key, value, description, config_type, config_group, is_public, is_sensitive, created_at, updated_at)
       VALUES (?, ?, ?, 'integer', 'system', 0, 0, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(
      LAST_ANALYZE_KEY,
      String(now),
      '最近一次 ANALYZE 刷新查询优化器统计的时间',
      now,
      now,
    )
    .run();

  return { ran: true, tables, fallback };
}
