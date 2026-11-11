/**
 * JAV 详情批量补全任务
 *
 * - 手动启动后按批次运行（默认每批 10 条、批内间隔 4 秒），由每分钟 cron 驱动；
 * - 任务状态写 D1（detail_fetch_jobs），刷新页面 / Worker 重启后继续；
 * - 源站缺失累计 3 次后不再重试；暂时失败只退避，不消耗次数；
 * - 无新增 cron 时，也可以由现有每小时 cron 兜底推进。
 */
import { DB_CONFIG_KEYS } from '@/constants';
import { generateId } from '@/utils';
import { ConfigService } from './config';
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
const RECORD_GAP_MS = 4000;

export interface JavDetailJobRow {
  id: string;
  status: 'running' | 'done';
  batch_size: number;
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
  /** 运行时开关：false 时分钟 cron 会跳过，不会推进任务 */
  enabled: boolean;
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

/**
 * 是否存在「已到期可处理」的记录。
 *
 * COUNT(*) 必须扫完整个候选集才能得到数字；这里只判断存在性，
 * 命中第一条即返回，任务运行中的收尾判断用它替代一次全量统计。
 */
async function hasDueRecords(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS one
       FROM data_records d
       LEFT JOIN jav_detail_meta m ON m.record_id = d.id
       WHERE d.record_type = 'jav'
         AND d.status = 'active'
         AND d.detail_completed = 0
         AND d.code IS NOT NULL
         AND COALESCE(m.retry_exhausted, 0) = 0
         AND COALESCE(m.status, 'pending') <> 'complete'
         AND COALESCE(m.next_retry_at, 0) <= ?
       LIMIT 1`
    )
    .bind(Date.now())
    .first<{ one: number }>();
  return row !== null;
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

/**
 * 运行时开关：system_config.jav_detail_job_enabled。
 *
 * fail-open —— 键缺失、值无法识别、查询出错都按「启用」处理，
 * 避免因为配置表异常把补全任务永久卡死。
 */
export async function isJavDetailJobEnabled(db: D1Database): Promise<boolean> {
  try {
    const row = await db
      .prepare('SELECT value FROM system_config WHERE key = ?')
      .bind(DB_CONFIG_KEYS.JAV_DETAIL_JOB_ENABLED)
      .first<{ value: string | null }>();
    if (!row) return true;
    const value = String(row.value ?? '').trim().toLowerCase();
    return value !== '0' && value !== 'false';
  } catch {
    return true;
  }
}

export async function getJavDetailJobView(db: D1Database): Promise<JavDetailJobView> {
  const now = Date.now();
  // pending 与 due 用一次扫描同时算出来：管理页运行时每 15 秒轮询一次，
  // 拆成两条 COUNT 会让候选集被完整扫描两遍。
  const [job, counts, enabled] = await Promise.all([
    getLatestJob(db),
    db
      .prepare(
        `SELECT COUNT(*) AS n,
                SUM(CASE WHEN COALESCE(m.next_retry_at, 0) <= ? THEN 1 ELSE 0 END) AS due
         FROM data_records d
         LEFT JOIN jav_detail_meta m ON m.record_id = d.id
         WHERE d.record_type = 'jav'
           AND d.status = 'active'
           AND d.detail_completed = 0
           AND d.code IS NOT NULL
           AND COALESCE(m.retry_exhausted, 0) = 0
           AND COALESCE(m.status, 'pending') <> 'complete'`
      )
      .bind(now)
      .first<{ n: number; due: number | null }>(),
    isJavDetailJobEnabled(db),
  ]);
  const pending = counts?.n ?? 0;
  const due = counts?.due ?? 0;
  return { job, pending, due, scheduled: Math.max(pending - due, 0), enabled };
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
  options: { batchSize?: number; createdBy?: string } = {}
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
           (id, status, batch_size, total, processed, completed,
            partial, absent, transient_failed, skipped, last_error, created_by,
            created_at, updated_at, finished_at)
         VALUES (?, 'running', ?, ?, 0, 0, 0, 0, 0, 0, NULL, ?, ?, ?, NULL)`
      )
      .bind(
        id,
        options.batchSize ?? DEFAULT_BATCH_SIZE,
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

/**
 * 立即停止：把运行中的任务标记为 done。
 *
 * 批次处理每处理一条前会重新读状态，因此停止在一条记录内生效（≤1 个抓取周期）；
 * 已有进度（processed/completed）保留，重新启动会新建任务继续补全剩余记录。
 */
export async function stopJavDetailJob(db: D1Database): Promise<JavDetailJobView> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE detail_fetch_jobs
       SET status = 'done', updated_at = ?, finished_at = ?
       WHERE status = 'running'`
    )
    .bind(now, now)
    .run();
  return getJavDetailJobView(db);
}

/**
 * 暂停 / 继续：只切 system_config.jav_detail_job_enabled，不改任务状态。
 *
 * 与「停止」是两件事：
 *   - 暂停：任务保持 running，进度保留，分钟 cron 跳过，继续后从同一任务接着跑；
 *   - 停止：任务变 done，进程结束。
 * 开关与系统配置页是同一行数据，不另立一套状态。
 */
export async function setJavDetailJobPaused(
  db: D1Database,
  paused: boolean
): Promise<JavDetailJobView> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO system_config
         (key, value, description, config_type, config_group, is_public, is_sensitive, created_at, updated_at)
       VALUES (?, ?, ?, 'boolean', 'features', 0, 0, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(
      DB_CONFIG_KEYS.JAV_DETAIL_JOB_ENABLED,
      paused ? '0' : '1',
      'JAV 详情补全任务总开关：关闭后分钟 cron 跳过推进，任务进度保留',
      now,
      now
    )
    .run();
  // 配置服务有 60 秒缓存：直接写库后清掉，避免系统配置页显示旧值
  ConfigService.clearCache();
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
           -- 只有收尾时才允许把状态写成 done；未收尾时保持原状态。
           -- 这里绝不能写 'running'：停止/门控可能在批次进行中把任务改成 done，
           -- 无条件回写 running 会把停止操作覆盖掉，任务随后继续推进。
           status = CASE WHEN ? THEN 'done' ELSE status END,
           finished_at = CASE WHEN ? THEN ? ELSE finished_at END
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
      finished ? 1 : 0,
      finished ? 1 : 0,
      now,
      jobId
    )
    .run();
}

/**
 * 批次内续跑判断：每条记录处理前重新读一次任务状态与开关。
 *
 * 一个批次是逐条处理的（条间 4 秒），期间用户可能点「停止」或「暂停」。
 * 只在 tick 入口判断一次的话，停止/暂停要等整批跑完才生效，
 * 用户看到的就是「点了没用」。
 */
async function shouldContinueBatch(db: D1Database, jobId: string): Promise<boolean> {
  const [row, enabled] = await Promise.all([
    db
      .prepare('SELECT status FROM detail_fetch_jobs WHERE id = ?')
      .bind(jobId)
      .first<{ status: string }>(),
    isJavDetailJobEnabled(db),
  ]);
  return row?.status === 'running' && enabled;
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
 * 每分钟 cron 调用：有运行中的任务且开关启用时处理一批。
 *
 * 空转门控：一条语句同时判断「有运行中的任务」与「开关未被关闭」，
 * 都满足才继续——不抢 cron 锁、不做候选集统计。
 * 空闲时每 tick 只有 1 条语句、约 1 行读取；
 * 任务被标记 done 或开关被关闭后，下一 tick 即落入该分支。
 */
export async function runJavDetailJobBatch(db: D1Database): Promise<{ ran: boolean; processed: number }> {
  let running: { one: number } | null;
  try {
    running = await db
      .prepare(
        `SELECT 1 AS one
         FROM detail_fetch_jobs j
         WHERE j.status = 'running'
           AND NOT EXISTS (
             SELECT 1 FROM system_config
             WHERE key = ? AND LOWER(TRIM(value)) IN ('0', 'false')
           )
         LIMIT 1`
      )
      .bind(DB_CONFIG_KEYS.JAV_DETAIL_JOB_ENABLED)
      .first<{ one: number }>();
  } catch {
    // 门控语句失败：可能是迁移 26 未执行（表不存在），也可能是迁移 29 未执行
    // 导致配置表不可用。前者直接退出，后者按 fail-open 重新判断，避免开关缺失卡死任务。
    try {
      running = await db
        .prepare(`SELECT 1 AS one FROM detail_fetch_jobs WHERE status = 'running' LIMIT 1`)
        .first<{ one: number }>();
    } catch {
      return { ran: false, processed: 0 };
    }
  }
  if (!running) return { ran: false, processed: 0 };

  return (
    (await withCronLock(db, LOCK_KEY, LOCK_TTL_MS, async () => {
      const job = await getRunningJob(db);
      if (!job) return { ran: false, processed: 0 };

      const records = await selectDueRecords(db, Math.max(1, job.batch_size));
      if (records.length === 0) {
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

      let processed = 0;

      for (let i = 0; i < records.length; i++) {
        // 处理第二条起先确认任务仍在跑：期间可能已被停止或开关已关闭
        if (i > 0 && !(await shouldContinueBatch(db, job.id))) break;

        const result = await processOne(db, records[i]);
        processed++;

        const isLast = i === records.length - 1;
        const dueAfter = isLast ? await hasDueRecords(db) : false;
        // 最后一条处理完且没有到期记录时才收尾；未到重试时间的记录留给后续任务
        const finished = isLast && !dueAfter;

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
