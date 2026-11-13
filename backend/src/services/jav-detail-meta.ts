/**
 * JAV 详情完整度与重试元数据
 *
 * 设计要点：
 * - 完整性不再用「是否抓过详情」判断，而是检查四个关键字段：
 *   导演 / 制作商 / 发行商 / 磁力。
 * - 暂时失败（超时、网络、HTTP 限制、解析异常）只累计 transient_failures，
 *   不消耗 attempts；源站确认缺失/番号不存在才累计 attempts。
 * - attempts 达到 3 次后置 retry_exhausted，后续批次不再重试。
 */
import type { MagnetItem } from './jav-utils';

export const DETAIL_FIELD_BITS = {
  director: 1,
  maker: 2,
  publisher: 4,
  magnets: 8,
} as const;

export type JavDetailField = keyof typeof DETAIL_FIELD_BITS;
export type JavDetailStatus = 'pending' | 'complete' | 'partial' | 'absent' | 'error';

export const DETAIL_RETRY_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
export const DETAIL_MAX_ATTEMPTS = 3;
export const TRANSIENT_BASE_DELAY_MS = 10 * 60 * 1000; // 10 分钟

export interface JavDetailMeta {
  status: JavDetailStatus;
  missingMask: number;
  missingFields: JavDetailField[];
  attempts: number;
  transientFailures: number;
  nextRetryAt: number;
  retryExhausted: number;
  lastError: string | null;
  fetchedAt: number | null;
}

export interface JavDetailLike {
  director?: string;
  maker?: string;
  publisher?: string;
  directors?: string[];
  makers?: string[];
  publishers?: string[];
}

export function missingFieldsFromMask(mask: number): JavDetailField[] {
  return (Object.keys(DETAIL_FIELD_BITS) as JavDetailField[]).filter(
    (field) => (mask & DETAIL_FIELD_BITS[field]) !== 0
  );
}

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function hasMulti(values: string[] | undefined, single: string | undefined): boolean {
  return (values?.some((v) => v.trim() !== '') ?? false) || hasValue(single);
}

/** 计算缺失位掩码；magnetCount 应传入库中真实磁力来源数 */
export function computeMissingMask(detail: JavDetailLike, magnetCount: number): number {
  let mask = 0;
  if (!hasMulti(detail.directors, detail.director)) mask |= DETAIL_FIELD_BITS.director;
  if (!hasMulti(detail.makers, detail.maker)) mask |= DETAIL_FIELD_BITS.maker;
  if (!hasMulti(detail.publishers, detail.publisher)) mask |= DETAIL_FIELD_BITS.publisher;
  if (magnetCount <= 0) mask |= DETAIL_FIELD_BITS.magnets;
  return mask;
}

/** 暂时失败的指数退避：10 分钟 → 20 → 40 ... 上限 6 小时 */
export function transientRetryDelay(failures: number): number {
  const exp = Math.min(Math.max(failures - 1, 0), 6);
  return Math.min(6 * 60 * 60 * 1000, TRANSIENT_BASE_DELAY_MS * 2 ** exp);
}

const EMPTY_META: JavDetailMeta = {
  status: 'pending',
  missingMask: 0,
  missingFields: [],
  attempts: 0,
  transientFailures: 0,
  nextRetryAt: 0,
  retryExhausted: 0,
  lastError: null,
  fetchedAt: null,
};

interface JavDetailMetaRow {
  status: string;
  missing_mask: number;
  attempts: number;
  transient_failures: number;
  next_retry_at: number;
  retry_exhausted: number;
  last_error: string | null;
  fetched_at: number | null;
}

function rowToMeta(row: JavDetailMetaRow): JavDetailMeta {
  const status = (['pending', 'complete', 'partial', 'absent', 'error'] as const).includes(
    row.status as JavDetailStatus
  )
    ? (row.status as JavDetailStatus)
    : 'pending';
  return {
    status,
    missingMask: row.missing_mask ?? 0,
    missingFields: missingFieldsFromMask(row.missing_mask ?? 0),
    attempts: row.attempts ?? 0,
    transientFailures: row.transient_failures ?? 0,
    nextRetryAt: row.next_retry_at ?? 0,
    retryExhausted: row.retry_exhausted ?? 0,
    lastError: row.last_error ?? null,
    fetchedAt: row.fetched_at ?? null,
  };
}

export async function readJavDetailMeta(db: D1Database, recordId: string): Promise<JavDetailMeta> {
  const row = await db
    .prepare(
      `SELECT status, missing_mask, attempts, transient_failures, next_retry_at,
              retry_exhausted, last_error, fetched_at
       FROM jav_detail_meta WHERE record_id = ?`
    )
    .bind(recordId)
    .first<JavDetailMetaRow>();
  return row ? rowToMeta(row) : { ...EMPTY_META };
}

/** 批量读取，管理页列表用；避免 N+1 查询 */
export async function readJavDetailMetaMap(
  db: D1Database,
  recordIds: string[]
): Promise<Map<string, JavDetailMeta>> {
  const result = new Map<string, JavDetailMeta>();
  if (recordIds.length === 0) return result;

  const placeholders = recordIds.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT record_id, status, missing_mask, attempts, transient_failures, next_retry_at,
              retry_exhausted, last_error, fetched_at
       FROM jav_detail_meta WHERE record_id IN (${placeholders})`
    )
    .bind(...recordIds)
    .all<JavDetailMetaRow & { record_id: string }>();

  for (const row of rows.results || []) {
    result.set(row.record_id, rowToMeta(row));
  }
  return result;
}

export async function saveJavDetailMeta(
  db: D1Database,
  recordId: string,
  meta: Omit<JavDetailMeta, 'missingFields'>
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO jav_detail_meta
         (record_id, status, missing_mask, attempts, transient_failures,
          next_retry_at, retry_exhausted, last_error, fetched_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(record_id) DO UPDATE SET
         status = excluded.status,
         missing_mask = excluded.missing_mask,
         attempts = excluded.attempts,
         transient_failures = excluded.transient_failures,
         next_retry_at = excluded.next_retry_at,
         retry_exhausted = excluded.retry_exhausted,
         last_error = excluded.last_error,
         fetched_at = excluded.fetched_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      recordId,
      meta.status,
      meta.missingMask,
      meta.attempts,
      meta.transientFailures,
      meta.nextRetryAt,
      meta.retryExhausted,
      meta.lastError,
      meta.fetchedAt,
      now
    )
    .run();
}

/**
 * 管理端「重置源站缺失次数」。
 *
 * 清零 attempts / transient_failures，清掉 retry_exhausted 与 next_retry_at，
 * 让该条记录立即重新进入自动补全与手动批次的候选集。
 * 保留 missing_mask：管理页仍可用「缺磁力」等筛选找到它，直到下一次抓取重新判定。
 */
export async function resetJavDetailRetry(
  db: D1Database,
  recordId: string
): Promise<JavDetailMeta> {
  const previous = await readJavDetailMeta(db, recordId);
  const status: JavDetailStatus = previous.status === 'complete' ? 'complete' : 'pending';
  const meta: JavDetailMeta = {
    status,
    missingMask: previous.missingMask,
    missingFields: previous.missingFields,
    attempts: 0,
    transientFailures: 0,
    nextRetryAt: 0,
    retryExhausted: 0,
    lastError: null,
    fetchedAt: previous.fetchedAt,
  };
  await saveJavDetailMeta(db, recordId, meta);
  await db
    .prepare('UPDATE data_records SET detail_completed = ? WHERE id = ?')
    .bind(status === 'complete' ? 1 : 0, recordId)
    .run();
  return meta;
}

export async function countJavMagnets(db: D1Database, recordId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM data_record_sources
       WHERE record_id = ? AND source_type = 'magnet'`
    )
    .bind(recordId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 成功拿到详情后统一落完整度：
 * - 四个字段齐全 → complete + detail_completed=1
 * - 缺字段 → partial，attempts+1，30 天后再试；累计 3 次后不再重试
 * - 磁力接口暂时失败 → error（不消耗 attempts，10 分钟后重试）
 */
export async function applyJavDetailSuccess(
  db: D1Database,
  recordId: string,
  detail: JavDetailLike,
  options: { magnetFetchFailed?: boolean; previous?: JavDetailMeta } = {}
): Promise<JavDetailMeta> {
  const previous = options.previous ?? (await readJavDetailMeta(db, recordId));
  const magnetCount = await countJavMagnets(db, recordId);
  let mask = computeMissingMask(detail, magnetCount);

  // 磁力请求失败时不能断言「源站没有磁力」，先不把磁力计入缺失，
  // 但整体状态必须是 error，避免误判为 complete。
  if (options.magnetFetchFailed) {
    mask &= ~DETAIL_FIELD_BITS.magnets;
    const transientFailures = previous.transientFailures + 1;
    const meta: JavDetailMeta = {
      status: 'error',
      missingMask: mask,
      missingFields: missingFieldsFromMask(mask),
      attempts: previous.attempts,
      transientFailures,
      nextRetryAt: Date.now() + transientRetryDelay(transientFailures),
      retryExhausted: previous.retryExhausted,
      lastError: '磁力接口暂时不可用',
      fetchedAt: Date.now(),
    };
    await saveJavDetailMeta(db, recordId, meta);
    await db
      .prepare('UPDATE data_records SET detail_completed = 0 WHERE id = ?')
      .bind(recordId)
      .run();
    return meta;
  }

  if (mask === 0) {
    const meta: JavDetailMeta = {
      status: 'complete',
      missingMask: 0,
      missingFields: [],
      attempts: 0,
      transientFailures: 0,
      nextRetryAt: 0,
      retryExhausted: 0,
      lastError: null,
      fetchedAt: Date.now(),
    };
    await saveJavDetailMeta(db, recordId, meta);
    await db
      .prepare('UPDATE data_records SET detail_completed = 1 WHERE id = ?')
      .bind(recordId)
      .run();
    return meta;
  }

  const attempts = previous.attempts + 1;
  const exhausted = attempts >= DETAIL_MAX_ATTEMPTS ? 1 : 0;
  const meta: JavDetailMeta = {
    status: 'partial',
    missingMask: mask,
    missingFields: missingFieldsFromMask(mask),
    attempts,
    transientFailures: previous.transientFailures,
    nextRetryAt: exhausted ? 0 : Date.now() + DETAIL_RETRY_DELAY_MS,
    retryExhausted: exhausted,
    lastError: null,
    fetchedAt: Date.now(),
  };
  await saveJavDetailMeta(db, recordId, meta);
  await db
    .prepare('UPDATE data_records SET detail_completed = 0 WHERE id = ?')
    .bind(recordId)
    .run();
  return meta;
}

/** 暂时失败：不消耗 attempts，按指数退避重试 */
export async function applyJavDetailTransientFailure(
  db: D1Database,
  recordId: string,
  error: string,
  previous?: JavDetailMeta
): Promise<JavDetailMeta> {
  const prev = previous ?? (await readJavDetailMeta(db, recordId));
  const transientFailures = prev.transientFailures + 1;
  const meta: JavDetailMeta = {
    status: 'error',
    missingMask: prev.missingMask,
    missingFields: prev.missingFields,
    attempts: prev.attempts,
    transientFailures,
    nextRetryAt: Date.now() + transientRetryDelay(transientFailures),
    retryExhausted: prev.retryExhausted,
    lastError: error,
    fetchedAt: prev.fetchedAt,
  };
  await saveJavDetailMeta(db, recordId, meta);
  await db
    .prepare('UPDATE data_records SET detail_completed = 0 WHERE id = ?')
    .bind(recordId)
    .run();
  return meta;
}

/** 源站确认没有该番号：按「源站缺失」累计 attempts，30 天后重试 */
export async function applyJavDetailAbsent(
  db: D1Database,
  recordId: string,
  error: string,
  previous?: JavDetailMeta
): Promise<JavDetailMeta> {
  const prev = previous ?? (await readJavDetailMeta(db, recordId));
  const attempts = prev.attempts + 1;
  const exhausted = attempts >= DETAIL_MAX_ATTEMPTS ? 1 : 0;
  const meta: JavDetailMeta = {
    status: 'absent',
    missingMask: 0b1111,
    missingFields: missingFieldsFromMask(0b1111),
    attempts,
    transientFailures: prev.transientFailures,
    nextRetryAt: exhausted ? 0 : Date.now() + DETAIL_RETRY_DELAY_MS,
    retryExhausted: exhausted,
    lastError: error,
    fetchedAt: Date.now(),
  };
  await saveJavDetailMeta(db, recordId, meta);
  await db
    .prepare('UPDATE data_records SET detail_completed = 0 WHERE id = ?')
    .bind(recordId)
    .run();
  return meta;
}

/** 磁力数组 → 来源条数（用于在没有入库场景下计算 mask） */
export function magnetCountOf(magnets: MagnetItem[] | undefined): number {
  return magnets?.filter((m) => typeof m.magnet === 'string' && m.magnet.startsWith('magnet:')).length ?? 0;
}
