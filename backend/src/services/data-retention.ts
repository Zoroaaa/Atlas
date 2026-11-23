/**
 * 数据生命周期清理
 *
 * 背景：多张日志/派生表只增不减。这里维护统一的清理目标清单，
 * 定时任务只跑可安全自动清理的目标；管理后台可预览并手动清理全部目标。
 *
 * D1 单库单线程，批量删除必须限制单次行数，避免一条 SQL 长时间持锁。
 */

/** 浏览量去重窗口只有 24h，保留 30 天足够覆盖任何去重场景 */
const POST_VIEW_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** 仅首条元数据、从未补全、无来源的记录：半年无人再搜即可丢弃 */
const INCOMPLETE_RECORD_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

/** 单批删除行数，避免 D1 长事务 */
const CLEANUP_BATCH_SIZE = 1000;
/** 定时任务单次最多处理批数，把查询次数控制在每次调用预算内 */
const CLEANUP_MAX_BATCHES = 3;
/** 管理后台手动执行同样限制批数：一次最多删 3000 行/目标，避免免费版查询配额被单次点击打满 */
const MANUAL_MAX_BATCHES = 3;

export interface RetentionResult {
  rateLimits: number;
  postViews: number;
  dataRecords: number;
  systemErrors: number;
  analyticsEvents: number;
  emailQueue: number;
  emailLog: number;
  cronLocks: number;
}

/**
 * 管理后台可预览/执行的清理目标。
 *
 * table/condition 是代码内常量，不接受用户输入，直接拼进 SQL 是安全的；
 * params 只负责按保留期生成绑定参数。
 */
export interface CleanupTarget {
  key: string;
  table: string;
  condition: string;
  retentionDays: number;
  /** auto = 定时任务会执行；manual = 仅管理后台手动执行 */
  mode: 'auto' | 'manual';
  params: (now: number, days: number) => (string | number)[];
}

export const CLEANUP_TARGETS: readonly CleanupTarget[] = [
  {
    key: 'rate_limits',
    table: 'rate_limits',
    condition: 'reset_at < ?',
    retentionDays: 0,
    mode: 'auto',
    params: (now) => [now],
  },
  {
    key: 'source_status_cache',
    table: 'source_status_cache',
    condition: 'created_at < ?',
    retentionDays: 7,
    mode: 'auto',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'community_post_views',
    table: 'community_post_views',
    condition: 'last_viewed_at < ?',
    retentionDays: 30,
    mode: 'auto',
    params: (now) => [now - POST_VIEW_RETENTION_MS],
  },
  {
    key: 'data_records',
    table: 'data_records',
    condition: 'detail_completed = 0 AND source_count = 0 AND last_updated_at < ?',
    retentionDays: 180,
    mode: 'auto',
    params: (now) => [now - INCOMPLETE_RECORD_RETENTION_MS],
  },
  {
    key: 'oauth_login_codes',
    table: 'oauth_login_codes',
    condition: 'expires_at < ?',
    retentionDays: 0,
    mode: 'auto',
    params: (now) => [now],
  },
  {
    key: 'cron_locks',
    table: 'cron_locks',
    condition: 'locked_until < ?',
    retentionDays: 0,
    mode: 'auto',
    params: (now) => [now],
  },
  {
    key: 'email_queue',
    table: 'email_queue',
    condition: "status != 'pending' AND created_at < ?",
    retentionDays: 30,
    mode: 'auto',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'email_log',
    table: 'email_log',
    condition: 'sent_at < ?',
    retentionDays: 30,
    mode: 'auto',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'system_errors',
    table: 'system_errors',
    condition: 'created_at < ?',
    retentionDays: 90,
    mode: 'auto',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'analytics_events',
    table: 'analytics_events',
    condition: 'created_at < ?',
    retentionDays: 90,
    mode: 'auto',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'user_actions',
    table: 'user_actions',
    condition: 'created_at < ?',
    retentionDays: 90,
    mode: 'manual',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'password_reset_logs',
    table: 'password_reset_logs',
    condition: 'created_at < ?',
    retentionDays: 30,
    mode: 'manual',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'user_security_events',
    table: 'user_security_events',
    condition: 'created_at < ?',
    retentionDays: 90,
    mode: 'manual',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'notifications_read',
    table: 'notifications',
    condition: 'read_at IS NOT NULL AND created_at < ?',
    retentionDays: 90,
    mode: 'manual',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'email_send_logs',
    table: 'email_send_logs',
    condition: 'created_at < ?',
    retentionDays: 90,
    mode: 'manual',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
  {
    key: 'config_change_logs',
    table: 'config_change_logs',
    condition: 'created_at < ?',
    retentionDays: 180,
    mode: 'manual',
    params: (now, days) => [now - days * 24 * 60 * 60 * 1000],
  },
];

/** 合并动态保留期（配置项）后的清理目标清单 */
export function getCleanupTargets(overrides: Record<string, number> = {}): CleanupTarget[] {
  return CLEANUP_TARGETS.map((target) => ({
    ...target,
    retentionDays: overrides[target.key] ?? target.retentionDays,
  }));
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

/** 统计单个目标当前可清理行数 */
export async function countCleanupTarget(
  db: D1Database,
  target: CleanupTarget,
  now = Date.now(),
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS total FROM ${target.table} WHERE ${target.condition}`)
    .bind(...target.params(now, target.retentionDays))
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 执行单个清理目标，返回实际删除行数 */
export async function runCleanupTarget(
  db: D1Database,
  target: CleanupTarget,
  now = Date.now(),
): Promise<number> {
  return deleteInBatches(
    db,
    target.table,
    target.condition,
    target.params(now, target.retentionDays),
    MANUAL_MAX_BATCHES,
  );
}

/** 定时任务：只跑可安全自动清理的目标 */
export async function runDataRetention(db: D1Database): Promise<RetentionResult> {
  const now = Date.now();
  const targets = getCleanupTargets();
  const byKey = new Map(targets.map((target) => [target.key, target]));

  const run = async (key: string): Promise<number> => {
    const target = byKey.get(key);
    if (!target) return 0;
    return deleteInBatches(db, target.table, target.condition, target.params(now, target.retentionDays));
  };

  return {
    rateLimits: await run('rate_limits'),
    postViews: await run('community_post_views'),
    dataRecords: await run('data_records'),
    systemErrors: await run('system_errors'),
    analyticsEvents: await run('analytics_events'),
    emailQueue: await run('email_queue'),
    emailLog: await run('email_log'),
    cronLocks: await run('cron_locks'),
  };
}
