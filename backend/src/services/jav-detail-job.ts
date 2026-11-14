/**
 * JAV 详情批量补全任务
 *
 * - 手动启动后按批次运行（默认每批 5 条、批内间隔 4 秒），由每分钟 cron 驱动；
 * - 任务状态写 D1（detail_fetch_jobs），刷新页面 / Worker 重启后继续；
 * - 源站缺失累计 3 次后不再重试；暂时失败只退避，不消耗次数；
 * - 缺导演 / 制作商 / 发行商的记录不会进入每小时自动补全，只能由本任务的
 *   手动批次补（见 MANUAL_ONLY_PREDICATE）。
 * - 无新增 cron 时，也可以由现有每小时 cron 兜底推进。
 */
import { DB_CONFIG_KEYS } from '@/constants';
import { generateId } from '@/utils';
import { ConfigService } from './config';
import { withCronLock } from './cron-lock';
import {
  DETAIL_FIELD_BITS,
  DETAIL_MAX_ATTEMPTS,
  readJavDetailMeta,
  saveJavDetailMeta,
  type JavDetailMeta,
} from './jav-detail-meta';
import { enrichDataRecordFromDetail } from './data-storage';
import { fetchJavbusDetailWithMagnets, isJavCodeLike, normalizeJavCode } from './jav-utils';

const LOCK_KEY = 'jav-detail-batch';
const LOCK_TTL_MS = 5 * 60 * 1000;
/** 每分钟 cron 每批处理的条数；接口与前端都复用这个默认值 */
export const JAV_DETAIL_DEFAULT_BATCH_SIZE = 5;
const RECORD_GAP_MS = 4000;

/**
 * 手动批次可选的筛选：只决定筛哪些记录，抓取内容不受影响。
 *
 * transient 是特殊值：选中「暂时失败」的记录（status = error），
 * 启动任务时会先把它们的退避时间清零，以便立即重试。
 */
export type JavDetailMissingFilter = 'director' | 'maker' | 'publisher' | 'magnets' | 'transient';

export function isJavDetailMissingFilter(value: unknown): value is JavDetailMissingFilter {
  return value === 'director' || value === 'maker' || value === 'publisher'
    || value === 'magnets' || value === 'transient';
}

/** 从库中读出的筛选条件：不认识的值一律当作「不限」，不让脏数据卡死任务 */
function normalizeFilter(value: unknown): JavDetailMissingFilter | null {
  return isJavDetailMissingFilter(value) ? value : null;
}

/**
 * 字段筛选谓词：只选「缺这一类」的记录。
 *
 * 从未抓过详情（没有 meta 行）的记录四个字段全都缺，四个筛选都应当命中；
 * 命中之后仍然抓取完整详情页，不是只补这一个字段。
 *
 * missing_mask = 0 且状态未完成，代表「缺哪些字段无法判定」（例如磁力接口暂时失败，
 * 不能断言源站没有磁力）。这种记录必须至少被某一类筛选选中，否则哪个按钮都补不到它。
 */
function filterPredicate(filter: JavDetailMissingFilter | null): string {
  if (!filter) return '';
  if (filter === 'transient') {
    return `AND COALESCE(m.status, 'pending') = 'error'`;
  }
  const bit = DETAIL_FIELD_BITS[filter];
  return `AND (
      m.record_id IS NULL
      OR (COALESCE(m.missing_mask, 0) & ${bit}) <> 0
      OR COALESCE(m.missing_mask, 0) = 0
    )`;
}

/**
 * 「部分成功」的记录：抓到过详情，但至少缺一个字段。
 *
 * 缺导演 / 制作商 / 发行商的记录已被移出每小时自动补全，只能由管理端手动补；
 * 缺磁力的记录虽仍在自动补全里，但重试满 3 次后也会停。
 * 手动补视为「用户现在就要补」，因此这类记录不受 30 天重试间隔与 3 次上限约束，
 * 否则会出现「自动流程不收、手动按钮也选不到」的永久卡死。
 *
 * 源站缺失（absent）不在此列：那类记录重试只会白发请求，仍按间隔与上限控制。
 */
const MANUAL_ONLY_PREDICATE = `m.status = 'partial'`;

/** 手动批次里「未收尾」的记录：未耗尽重试，或属于部分成功的那一类 */
const MANUAL_PENDING_PREDICATE = `(COALESCE(m.retry_exhausted, 0) = 0 OR ${MANUAL_ONLY_PREDICATE})`;

/** 手动批次里「当前可处理」的记录：已到重试时间，或属于部分成功的那一类 */
const MANUAL_DUE_PREDICATE = `(
    (COALESCE(m.retry_exhausted, 0) = 0 AND COALESCE(m.next_retry_at, 0) <= ?)
    OR ${MANUAL_ONLY_PREDICATE}
  )`;

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
  /** 只补哪一类缺失；null 表示不限 */
  filter_missing: JavDetailMissingFilter | null;
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
async function hasDueRecords(
  db: D1Database,
  filter: JavDetailMissingFilter | null
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS one
       FROM data_records d
       LEFT JOIN jav_detail_meta m ON m.record_id = d.id
       WHERE d.record_type = 'jav'
         AND d.status = 'active'
         AND d.detail_completed = 0
         AND d.code IS NOT NULL
         AND COALESCE(m.status, 'pending') <> 'complete'
         AND ${MANUAL_DUE_PREDICATE}
         ${filterPredicate(filter)}
       LIMIT 1`
    )
    .bind(Date.now())
    .first<{ one: number }>();
  return row !== null;
}

async function countPending(
  db: D1Database,
  dueOnly: boolean,
  filter: JavDetailMissingFilter | null
): Promise<number> {
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
         AND COALESCE(m.status, 'pending') <> 'complete'
         AND ${dueOnly ? MANUAL_DUE_PREDICATE : MANUAL_PENDING_PREDICATE}
         ${filterPredicate(filter)}`
    )
    .bind(...(dueOnly ? [now] : []))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 开关的「关闭」取值。
 *
 * 系统配置页写入 0/1，但配置也可能被人工改成「是/否」等中文值；
 * 旧实现只认 0/false，导致 value='否' 时分钟 cron 仍在跑。
 */
const DISABLED_CONFIG_VALUES = new Set([
  '0', 'false', 'no', 'off', 'n', '否', '关闭', '停用', 'disabled',
]);

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
    return !DISABLED_CONFIG_VALUES.has(value);
  } catch {
    return true;
  }
}

export async function getJavDetailJobView(db: D1Database): Promise<JavDetailJobView> {
  const now = Date.now();
  const [job, enabled] = await Promise.all([getLatestJob(db), isJavDetailJobEnabled(db)]);
  // 运行中的任务自带筛选条件：pending/due 必须与它实际会处理的候选集一致，
  // 否则面板显示「还有 500 条」，任务却只认 20 条，进度条永远到不了头。
  const filter = job?.status === 'running' ? normalizeFilter(job.filter_missing) : null;
  // pending 与 due 用一次扫描同时算出来：管理页运行时每 15 秒轮询一次，
  // 拆成两条 COUNT 会让候选集被完整扫描两遍。
  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN ${MANUAL_DUE_PREDICATE} THEN 1 ELSE 0 END) AS due
       FROM data_records d
       LEFT JOIN jav_detail_meta m ON m.record_id = d.id
       WHERE d.record_type = 'jav'
         AND d.status = 'active'
         AND d.detail_completed = 0
         AND d.code IS NOT NULL
         AND COALESCE(m.status, 'pending') <> 'complete'
         AND ${MANUAL_PENDING_PREDICATE}
         ${filterPredicate(filter)}`
    )
    .bind(now)
    .first<{ n: number; due: number | null }>();
  const pending = counts?.n ?? 0;
  const due = counts?.due ?? 0;
  return { job, pending, due, scheduled: Math.max(pending - due, 0), enabled };
}

/**
 * 轻量进度：只读任务行与开关，各 1 条语句。
 *
 * 面板运行中每 15 秒轮询一次；完整视图里的字段统计与失败列表是
 * 「打开页面 / 任务结束」才需要的数据，放在轮询路径上等于每秒重复扫表。
 */
export async function getJavDetailJobProgress(db: D1Database): Promise<{
  job: JavDetailJobRow | null;
  enabled: boolean;
}> {
  const [job, enabled] = await Promise.all([getLatestJob(db), isJavDetailJobEnabled(db)]);
  return { job, enabled };
}

export async function getJavDetailStats(db: D1Database): Promise<JavDetailStats> {
  const [totalRow, agg] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS n FROM data_records WHERE record_type = 'jav'`)
      .first<{ n: number }>(),
    // jav_detail_meta 只存 JAV 记录：原查询 JOIN data_records 只为过滤 record_type，
    // 等于每行再回表一次。这里去掉 JOIN，并把「按状态」与「按缺失位」两次
    // GROUP BY 合并成一次扫描（SUM(CASE) 单趟算出全部计数）。
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS complete,
           SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial,
           SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error,
           SUM(CASE WHEN status NOT IN ('complete', 'partial', 'absent', 'error') THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN (missing_mask & 1) <> 0 THEN 1 ELSE 0 END) AS m_director,
           SUM(CASE WHEN (missing_mask & 2) <> 0 THEN 1 ELSE 0 END) AS m_maker,
           SUM(CASE WHEN (missing_mask & 4) <> 0 THEN 1 ELSE 0 END) AS m_publisher,
           SUM(CASE WHEN (missing_mask & 8) <> 0 THEN 1 ELSE 0 END) AS m_magnets
         FROM jav_detail_meta`
      )
      .first<{
        complete: number | null;
        partial: number | null;
        absent: number | null;
        error: number | null;
        pending: number | null;
        m_director: number | null;
        m_maker: number | null;
        m_publisher: number | null;
        m_magnets: number | null;
      }>(),
  ]);

  return {
    total: totalRow?.n ?? 0,
    complete: agg?.complete ?? 0,
    partial: agg?.partial ?? 0,
    absent: agg?.absent ?? 0,
    error: agg?.error ?? 0,
    pending: agg?.pending ?? 0,
    missing: {
      director: agg?.m_director ?? 0,
      maker: agg?.m_maker ?? 0,
      publisher: agg?.m_publisher ?? 0,
      magnets: agg?.m_magnets ?? 0,
    },
  };
}

export async function startJavDetailJob(
  db: D1Database,
  options: { batchSize?: number; createdBy?: string; missing?: JavDetailMissingFilter | null } = {}
): Promise<JavDetailJobView> {
  const running = await getRunningJob(db);
  if (running) return getJavDetailJobView(db);

  // 筛选条件必须落库：任务由每分钟 cron 分多次推进，只在启动请求里带一次，
  // 后续 tick 无从得知「这次只补哪一类」，筛选形同虚设。
  const filter = normalizeFilter(options.missing);
  // 「重试暂时失败」是用户主动点击：清掉退避时间，让它们立刻进入候选集
  if (filter === 'transient') {
    await db
      .prepare(`UPDATE jav_detail_meta SET next_retry_at = 0 WHERE status = 'error'`)
      .run();
  }
  const total = await countPending(db, false, filter);
  if (total === 0) return getJavDetailJobView(db);

  const now = Date.now();
  const id = generateId();
  try {
    await db
      .prepare(
        `INSERT INTO detail_fetch_jobs
           (id, status, batch_size, total, processed, completed,
            partial, absent, transient_failed, skipped, last_error, created_by,
            filter_missing, created_at, updated_at, finished_at)
         VALUES (?, 'running', ?, ?, 0, 0, 0, 0, 0, 0, NULL, ?, ?, ?, ?, NULL)`
      )
      .bind(
        id,
        options.batchSize ?? JAV_DETAIL_DEFAULT_BATCH_SIZE,
        total,
        options.createdBy ?? null,
        filter,
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

async function selectDueRecords(
  db: D1Database,
  limit: number,
  filter: JavDetailMissingFilter | null
): Promise<DueRecord[]> {
  const rows = await db
    .prepare(
      `SELECT d.id, d.code, d.title
       FROM data_records d
       LEFT JOIN jav_detail_meta m ON m.record_id = d.id
       WHERE d.record_type = 'jav'
         AND d.status = 'active'
         AND d.detail_completed = 0
         AND d.code IS NOT NULL
         AND COALESCE(m.status, 'pending') <> 'complete'
         AND ${MANUAL_DUE_PREDICATE}
         ${filterPredicate(filter)}
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
 * 管理端「单条数据补详情」：立即抓取指定记录，不等待批次。
 *
 * 走与批量任务完全相同的抓取与落库路径，保证 missing_mask / attempts /
 * transient_failures / next_retry_at 语义一致。
 */
export async function fetchJavDetailForRecord(
  db: D1Database,
  recordId: string
): Promise<{ ok: boolean; error: string | null; meta: JavDetailMeta }> {
  const record = await db
    .prepare('SELECT id, record_type, code FROM data_records WHERE id = ?')
    .bind(recordId)
    .first<{ id: string; record_type: string; code: string | null }>();

  if (!record || record.record_type !== 'jav') {
    return { ok: false, error: 'NOT_JAV', meta: await readJavDetailMeta(db, recordId) };
  }

  const code = normalizeJavCode(record.code || '');
  if (!isJavCodeLike(code)) {
    await markInvalidCode(db, recordId);
    return { ok: false, error: 'INVALID_CODE', meta: await readJavDetailMeta(db, recordId) };
  }

  const fetched = await fetchJavbusDetailWithMagnets(code, 20000);
  if (!fetched.ok) {
    await enrichDataRecordFromDetail(db, { recordId, code, error: fetched.error });
    return { ok: false, error: fetched.error, meta: await readJavDetailMeta(db, recordId) };
  }

  const { detail, magnets, magnetFetchFailed } = fetched.data;
  await enrichDataRecordFromDetail(db, { recordId, code, detail, magnets, magnetFetchFailed });
  const meta = await readJavDetailMeta(db, recordId);
  return { ok: meta.status !== 'error', error: meta.lastError, meta };
}

/**
 * 每分钟 cron 调用：有运行中的任务且开关启用时处理一批。
 *
 * 空转门控分两步：
 *   1. 先看是否存在 running 任务（无则 1 条语句直接返回，最省）；
 *   2. 再用 isJavDetailJobEnabled 判断开关——它与暂停/继续、批次内续跑共用
 *      同一套取值解析（0/false/否/no/off 等），避免 Go 与 SQL 各认一套值。
 * 开关关闭时在抢 cron 锁、统计候选集之前就返回，不产生任何抓取请求；
 * 任务行保持 running，重新打开后从同一任务继续。
 */
export async function runJavDetailJobBatch(db: D1Database): Promise<{ ran: boolean; processed: number }> {
  let running: { one: number } | null;
  try {
    running = await db
      .prepare(`SELECT 1 AS one FROM detail_fetch_jobs WHERE status = 'running' LIMIT 1`)
      .first<{ one: number }>();
  } catch {
    // 迁移 26 未执行（表不存在）时直接退出
    return { ran: false, processed: 0 };
  }
  if (!running) return { ran: false, processed: 0 };

  // 开关关闭：完全短路，不抢锁、不统计候选集、不发任何源站请求
  if (!(await isJavDetailJobEnabled(db))) return { ran: false, processed: 0 };

  return (
    (await withCronLock(db, LOCK_KEY, LOCK_TTL_MS, async () => {
      const job = await getRunningJob(db);
      if (!job) return { ran: false, processed: 0 };

      // 筛选条件来自任务行：每个 tick 都按同一条件取候选集
      const filter = normalizeFilter(job.filter_missing);
      const records = await selectDueRecords(db, Math.max(1, job.batch_size), filter);
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
        const dueAfter = isLast ? await hasDueRecords(db, filter) : false;
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
