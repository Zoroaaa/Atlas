/**
 * JAV 详情批量补全任务
 *
 * - 手动启动后按批次运行（默认每批 10 条、批内间隔 4 秒），由每分钟 cron 驱动；
 * - 任务状态写 D1（detail_fetch_jobs），刷新页面 / Worker 重启后继续；
 * - 源站缺失累计 3 次后不再重试；暂时失败只退避，不消耗次数；
 * - 无新增 cron 时，也可以由现有每小时 cron 兜底推进。
 */
import { generateId } from '@/utils';
import { withCronLock } from './cron-lock';
import {
  DETAIL_MAX_ATTEMPTS,
  readJavDetailMeta,
  saveJavDetailMeta,
  type JavDetailMeta,
} from './jav-detail-meta';
import { enrichDataRecordFromDetail } from './data-storage';
import { fetchJavbusDetailWithMagnets, isJavCodeLike, normalizeJavCode } from './jav-utils';

const LOCK_KEY = 'jav-detail-batch';
const LOCK_TTL_MS = 5 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_INTERVAL_SECONDS = 60;
const RECORD_GAP_MS = 4000;

export interface JavDetailJobRow {
  id: string;
  status: 'running' | 'done';
  batch_size: number;
  interval_seconds: number;
  total: number;
  processed: number;
  completed: number;
  partial: number;
  absent: number;
  transient_failed: number;
  skipped: number;
  last_error: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

export interface JavDetailJobView {
  job: JavDetailJobRow | null;
  /** 全部未完成且未耗尽重试的记录数（含尚未到重试时间的） */
  pending: number;
  /** 当前已到期、可立即处理的记录数 */
  due: number;
  /** 尚未到重试时间的记录数 */
  scheduled: number;
}

export interface JavDetailStats {
  total: number;
  complete: number;
  partial: number;
  absent: number;
  error: number;
  pending: number;
  missing: Record<string, number>;
}

interface DueRecord {
  id: string;
  code: string | null;
  title: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRunningJob(db: D1Database): Promise<JavDetailJobRow | null> {
  return await db
    .prepare(
      `SELECT * FROM detail_fetch_jobs WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`
    )
    .first<JavDetailJobRow>();
}

async function getLatestJob(db: D1Database): Promise<JavDetailJobRow | null> {
  return await db
    .prepare(`SELECT * FROM detail_fetch_jobs ORDER BY created_at DESC LIMIT 1`)
    .first<JavDetailJobRow>();
}

async function countPending(db: D1Database, dueOnly: boolean): Promise<number> {
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM data_records d
       LEFT JOIN jav_detail_meta m ON m.record_id = d.id
       WHERE d.record_type = 'jav'
         AND d.status = 'active'
         AND d.detail_completed = 0
         AND d.code IS NOT NULL
         AND COALESCE(m.retry_exhausted, 0) = 0
         AND COALESCE(m.status, 'pending') <> 'complete'
         ${dueOnly ? 'AND COALESCE(m.next_retry_at, 0) <= ?' : ''}`
    )
    .bind(...(dueOnly ? [now] : []))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getJavDetailJobView(db: D1Database): Promise<JavDetailJobView> {
  const [job, pending, due] = await Promise.all([
    getLatestJob(db),
    countPending(db, false),
    countPending(db, true),
  ]);
  return { job, pending, due, scheduled: Math.max(pending - due, 0) };
}

export async function getJavDetailStats(db: D1Database): Promise<JavDetailStats> {
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM data_records WHERE record_type = 'jav'`)
    .first<{ n: number }>();

  const statusRows = await db
    .prepare(
      `SELECT m.status AS status, COUNT(*) AS n
       FROM jav_detail_meta m
       JOIN data_records d ON d.id = m.record_id
       WHERE d.record_type = 'jav'
       GROUP BY m.status`
    )
    .all<{ status: string; n: number }>();

  const missingRows = await db
    .prepare(
      `SELECT m.missing_mask AS mask, COUNT(*) AS n
       FROM jav_detail_meta m
       JOIN data_records d ON d.id = m.record_id
       WHERE d.record_type = 'jav' AND m.missing_mask <> 0
       GROUP BY m.missing_mask`
    )
    .all<{ mask: number; n: number }>();

  const stats: JavDetailStats = {
    total: totalRow?.n ?? 0,
    complete: 0,
    partial: 0,
    absent: 0,
    error: 0,
    pending: 0,
    missing: { director: 0, maker: 0, publisher: 0, magnets: 0 },
  };
  for (const row of statusRows.results || []) {
    if (row.status === 'complete') stats.complete += row.n;
    else if (row.status === 'partial') stats.partial += row.n;
    else if (row.status === 'absent') stats.absent += row.n;
    else if (row.status === 'error') stats.error += row.n;
    else stats.pending += row.n;
  }
  for (const row of missingRows.results || []) {
    if (row.mask & 1) stats.missing.director += row.n;
    if (row.mask & 2) stats.missing.maker += row.n;
    if (row.mask & 4) stats.missing.publisher += row.n;
    if (row.mask & 8) stats.missing.magnets += row.n;
  }
  return stats;
}

export async function startJavDetailJob(
  db: D1Database,
  options: { batchSize?: number; intervalSeconds?: number; createdBy?: string } = {}
): Promise<JavDetailJobView> {
  const running = await getRunningJob(db);
  if (running) return getJavDetailJobView(db);

  const total = await countPending(db, false);
  if (total === 0) return getJavDetailJobView(db);

  const now = Date.now();
  const id = generateId();
  try {
    await db
      .prepare(
        `INSERT INTO detail_fetch_jobs
           (id, status, batch_size, interval_seconds, total, processed, completed,
            partial, absent, transient_failed, skipped, last_error, created_by,
            created_at, updated_at, finished_at)
         VALUES (?, 'running', ?, ?, ?, 0, 0, 0, 0, 0, 0, NULL, ?, ?, ?, NULL)`
      )
      .bind(
        id,
        options.batchSize ?? DEFAULT_BATCH_SIZE,
        options.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS,
        total,
        options.createdBy ?? null,
        now,
        now
      )
      .run();
  } catch (err) {
    // 并发点击时唯一索引会拒绝第二条，直接返回当前运行中的任务
    console.warn('[jav-detail-job] start conflict:', err);
  }
  return getJavDetailJobView(db);
}

async function selectDueRecords(db: D1Database, limit: number): Promise<DueRecord[]> {
  const rows = await db
    .prepare(
      `SELECT d.id, d.code, d.title
       FROM data_records d
       LEFT JOIN jav_detail_meta m ON m.record_id = d.id
       WHERE d.record_type = 'jav'
         AND d.status = 'active'
         AND d.detail_completed = 0
         AND d.code IS NOT NULL
         AND COALESCE(m.retry_exhausted, 0) = 0
         AND COALESCE(m.status, 'pending') <> 'complete'
         AND COALESCE(m.next_retry_at, 0) <= ?
       ORDER BY COALESCE(m.next_retry_at, 0), d.last_updated_at ASC
       LIMIT ?`
    )
    .bind(Date.now(), limit)
    .all<DueRecord>();
  return rows.results || [];
}

async function bumpJob(
  db: D1Database,
  jobId: string,
  delta: { completed?: number; partial?: number; absent?: number; transient?: number; skipped?: number },
  lastError: string | null,
  finished: boolean
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE detail_fetch_jobs
       SET processed = processed + 1,
           completed = completed + ?,
           partial = partial + ?,
           absent = absent + ?,
           transient_failed = transient_failed + ?,
           skipped = skipped + ?,
           last_error = COALESCE(?, last_error),
           updated_at = ?,
           status = ?,
           finished_at = ?
       WHERE id = ?`
    )
    .bind(
      delta.completed ?? 0,
      delta.partial ?? 0,
      delta.absent ?? 0,
      delta.transient ?? 0,
      delta.skipped ?? 0,
      lastError,
      now,
      finished ? 'done' : 'running',
      finished ? now : null,
      jobId
    )
    .run();
}

async function markInvalidCode(db: D1Database, recordId: string): Promise<JavDetailMeta> {
  const meta: Omit<JavDetailMeta, 'missingFields'> = {
    status: 'absent',
    missingMask: 0b1111,
    attempts: DETAIL_MAX_ATTEMPTS,
    transientFailures: 0,
    nextRetryAt: 0,
    retryExhausted: 1,
    lastError: 'INVALID_CODE',
    fetchedAt: Date.now(),
  };
  await saveJavDetailMeta(db, recordId, meta);
  await db
    .prepare('UPDATE data_records SET detail_completed = 0 WHERE id = ?')
    .bind(recordId)
    .run();
  return { ...meta, missingFields: ['director', 'maker', 'publisher', 'magnets'] };
}

async function processOne(db: D1Database, record: DueRecord): Promise<{ kind: 'completed' | 'partial' | 'absent' | 'transient' | 'skipped'; error: string | null }> {
  const code = normalizeJavCode(record.code || '');
  if (!isJavCodeLike(code)) {
    await markInvalidCode(db, record.id);
    return { kind: 'skipped', error: 'INVALID_CODE' };
  }

  const fetched = await fetchJavbusDetailWithMagnets(code, 15000);
  if (!fetched.ok) {
    await enrichDataRecordFromDetail(db, { recordId: record.id, code, error: fetched.error });
    const meta = await readJavDetailMeta(db, record.id);
    return {
      kind: meta.status === 'absent' ? 'absent' : 'transient',
      error: fetched.error,
    };
  }

  const { detail, magnets, magnetFetchFailed } = fetched.data;
  await enrichDataRecordFromDetail(db, { recordId: record.id, detail, magnets, magnetFetchFailed });
  const meta = await readJavDetailMeta(db, record.id);
  if (meta.status === 'complete') return { kind: 'completed', error: null };
  if (meta.status === 'absent') return { kind: 'absent', error: meta.lastError };
  if (meta.status === 'error') return { kind: 'transient', error: meta.lastError };
  return { kind: 'partial', error: null };
}

/**
 * 每分钟 cron 调用：有运行中的任务就处理一批。
 * 没抢到锁 / 没有任务 → 静默跳过。
 */
export async function runJavDetailJobBatch(db: D1Database): Promise<{ ran: boolean; processed: number }> {
  return (
    (await withCronLock(db, LOCK_KEY, LOCK_TTL_MS, async () => {
      const job = await getRunningJob(db);
      if (!job) return { ran: false, processed: 0 };

      const dueBefore = await countPending(db, true);
      if (dueBefore === 0) {
        await db
          .prepare(
            `UPDATE detail_fetch_jobs
             SET status = 'done', updated_at = ?, finished_at = ?
             WHERE id = ?`
          )
          .bind(Date.now(), Date.now(), job.id)
          .run();
        return { ran: true, processed: 0 };
      }

      const records = await selectDueRecords(db, Math.max(1, job.batch_size));
      let processed = 0;

      for (let i = 0; i < records.length; i++) {
        const result = await processOne(db, records[i]);
        processed++;

        const isLast = i === records.length - 1;
        const dueAfter = isLast ? await countPending(db, true) : 0;
        // 最后一条处理完且没有到期记录时才收尾；未到重试时间的记录留给后续任务
        const finished = isLast && dueAfter === 0;

        await bumpJob(
          db,
          job.id,
          {
            completed: result.kind === 'completed' ? 1 : 0,
            partial: result.kind === 'partial' ? 1 : 0,
            absent: result.kind === 'absent' ? 1 : 0,
            transient: result.kind === 'transient' ? 1 : 0,
            skipped: result.kind === 'skipped' ? 1 : 0,
          },
          result.error,
          finished
        );

        if (!isLast) await sleep(RECORD_GAP_MS);
      }

      return { ran: true, processed };
    })) ?? { ran: false, processed: 0 }
  );
}
