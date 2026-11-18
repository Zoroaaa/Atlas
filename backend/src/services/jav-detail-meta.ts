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

/** 四个字段全缺（尚未抓过详情） */
export const DETAIL_ALL_FIELDS_MASK =
  DETAIL_FIELD_BITS.director | DETAIL_FIELD_BITS.maker | DETAIL_FIELD_BITS.publisher | DETAIL_FIELD_BITS.magnets;

export const DETAIL_RETRY_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
export const DETAIL_MAX_ATTEMPTS = 3;
export const TRANSIENT_BASE_DELAY_MS = 10 * 60 * 1000; // 10 分钟

const DAY_MS = 24 * 60 * 60 * 1000;
/** 东八区偏移：分桶必须与页面展示的本地日期一致 */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
/** 单个自然日最多安排的 30 天重试条数，超过则顺延到后一天 */
export const DETAIL_RETRY_DAILY_CAP = 60;
/** 单次查询覆盖的天数：一次取整段占用，避免逐日 COUNT */
const SCAN_CHUNK_DAYS = 90;
/** 顺延兜底上限（60 条/天 × 10 年），正常量级不会触达 */
const MAX_DEFER_DAYS = 3650;

// ── 重试排期 ─────────────────────────────────────────────

/**
 * 计算 30 天重试时间，并按「东八区自然日」对同日重试做错峰。
 *
 * 同一自然日最多安排 DETAIL_RETRY_DAILY_CAP 条，排满后继续向后找第一个未满的
 * 自然日，不会在顺延上限用尽后把剩余记录全堆到同一天。
 * 分桶按东八区而不是 UTC：页面按本地日期展示，用 UTC 日会让同一个本地日
 * 由两个 UTC 桶拼成，看上去超过每日上限。
 */
export async function nextStaggeredRetryAt(db: D1Database, now = Date.now()): Promise<number> {
  const base = now + DETAIL_RETRY_DELAY_MS;
  const localBase = base + CST_OFFSET_MS;
  const localDayStart = Math.floor(localBase / DAY_MS) * DAY_MS;
  const offsetInDay = localBase - localDayStart;
  // 东八区 0 点对应的 UTC 时间戳
  const firstDayStart = localDayStart - CST_OFFSET_MS;

  for (let chunkStart = 0; chunkStart < MAX_DEFER_DAYS; chunkStart += SCAN_CHUNK_DAYS) {
    const rangeDays = Math.min(SCAN_CHUNK_DAYS, MAX_DEFER_DAYS - chunkStart);
    const rangeStart = firstDayStart + chunkStart * DAY_MS;
    const rangeEnd = rangeStart + rangeDays * DAY_MS;

    const rows = await db
      .prepare(
        `SELECT CAST((next_retry_at - ?) / ? AS INTEGER) AS day_index, COUNT(*) AS n
         FROM jav_detail_meta
         WHERE next_retry_at >= ? AND next_retry_at < ?
         GROUP BY day_index`
      )
      .bind(rangeStart, DAY_MS, rangeStart, rangeEnd)
      .all<{ day_index: number; n: number }>();

    const used = new Map<number, number>();
    for (const row of rows.results || []) {
      used.set(Number(row.day_index), Number(row.n));
    }
    for (let offset = 0; offset < rangeDays; offset++) {
      if ((used.get(offset) ?? 0) < DETAIL_RETRY_DAILY_CAP) {
        return rangeStart + offset * DAY_MS + offsetInDay;
      }
    }
  }

  // 兜底：10 年内每天排满的情况实际不存在，仍顺序给到下一个自然日而不是堆回同一天
  return firstDayStart + MAX_DEFER_DAYS * DAY_MS + offsetInDay;
}

// ── 数据结构 ─────────────────────────────────────────────

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

/** 缺失位掩码 → 字段名列表，供前端直接展示缺哪些。 */
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

// ── 读写 ─────────────────────────────────────────────────

/** 读取单条记录的详情元数据；无记录时返回 pending 空值。 */
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

/**
 * 为「只有列表级信息」的记录补一条待补全元数据。
 *
 * 榜单 / 关注 / 标签 / 实体浏览写入的作品天然只有番号、标题、封面，
 * 没有磁力、导演、制作商、发行商。这里显式写入 missing_mask，
 * 管理页才能打出「详情不完整 · 缺磁力/导演/制作商/发行商」标签；
 * 已有 meta 行（包括已补全）绝不覆盖。
 */
export async function markJavDetailPending(
  db: D1Database,
  recordIds: string[],
  mask: number = DETAIL_ALL_FIELDS_MASK
): Promise<void> {
  const ids = Array.from(new Set(recordIds.filter(Boolean)));
  if (ids.length === 0) return;

  const now = Date.now();
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50);
    const placeholders = slice.map(() => '?').join(',');
    // 只给「尚未补全」的记录补标记：历史 detail_completed=1 但没有 meta 行的记录
    // 不能因为缺 meta 就被误判成详情不完整。
    await db
      .prepare(
        `INSERT OR IGNORE INTO jav_detail_meta
           (record_id, status, missing_mask, attempts, transient_failures,
            next_retry_at, retry_exhausted, last_error, fetched_at, updated_at)
         SELECT id, 'pending', ?, 0, 0, 0, 0, NULL, NULL, ?
         FROM data_records
         WHERE id IN (${placeholders})
           AND record_type = 'jav'
           AND detail_completed = 0`
      )
      .bind(mask, now, ...slice)
      .run();
  }
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

/** 写入详情元数据（按 record_id upsert），不包含派生的 missingFields。 */
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

/**
 * 记录是否已有磁力来源。
 *
 * 只是判断「有没有」，不需要总数：命中第一条即可返回。
 * 原写法用 COUNT(*)，在批量补全里等于每条记录都去把来源表翻一遍（N+1），
 * 已改为由调用方直接传入刚写入的磁力数量，只有数量为 0 时才走这里探测。
 */
export async function hasJavMagnets(db: D1Database, recordId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS one FROM data_record_sources
       WHERE record_id = ? AND source_type = 'magnet'
       LIMIT 1`
    )
    .bind(recordId)
    .first<{ one: number }>();
  return row !== null;
}

// ── 结果落库 ─────────────────────────────────────────────

/**
 * 成功拿到详情后统一落完整度：
 * - 四个字段齐全 → complete + detail_completed=1
 * - 缺磁力（含同时缺其它字段）→ partial，attempts+1，30 天后再试；累计 3 次后不再重试
 * - 仅缺导演 / 制作商 / 发行商 → partial，但属于「只能手动补」，不写重试时间、不计次
 * - 磁力接口暂时失败 → error（不消耗 attempts，10 分钟后重试）
 */
export async function applyJavDetailSuccess(
  db: D1Database,
  recordId: string,
  detail: JavDetailLike,
  options: {
    magnetFetchFailed?: boolean;
    previous?: JavDetailMeta;
    /** 调用方刚写入的磁力数量；>0 时无需再查库 */
    magnetCount?: number;
  } = {}
): Promise<JavDetailMeta> {
  const previous = options.previous ?? (await readJavDetailMeta(db, recordId));
  // 只有数量为 0（可能库存有旧磁力）时才做一次存在性探测，不再逐条 COUNT
  const magnetCount =
    options.magnetCount && options.magnetCount > 0
      ? options.magnetCount
      : (await hasJavMagnets(db, recordId))
        ? 1
        : 0;
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
      lastError: 'MAGNET_FETCH_FAILED',
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

  // 只有缺磁力的记录会进入每小时自动补全（候选集见 ranking-enrichment）。
  // 仅缺导演 / 制作商 / 发行商属于「只能手动补」的范围：不写 30 天重试时间、
  // 不消耗自动重试次数，否则管理页会显示「等待重试」，但自动任务永远不会选中。
  if ((mask & DETAIL_FIELD_BITS.magnets) === 0) {
    const meta: JavDetailMeta = {
      status: 'partial',
      missingMask: mask,
      missingFields: missingFieldsFromMask(mask),
      attempts: previous.attempts,
      transientFailures: previous.transientFailures,
      nextRetryAt: 0,
      retryExhausted: previous.retryExhausted,
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

  const attempts = previous.attempts + 1;
  const exhausted = attempts >= DETAIL_MAX_ATTEMPTS ? 1 : 0;
  const meta: JavDetailMeta = {
    status: 'partial',
    missingMask: mask,
    missingFields: missingFieldsFromMask(mask),
    attempts,
    transientFailures: previous.transientFailures,
    nextRetryAt: exhausted ? 0 : await nextStaggeredRetryAt(db),
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
  // 源站确认缺号：四个字段一律视为缺失，等下次命中后重新判定
  const meta: JavDetailMeta = {
    status: 'absent',
    missingMask: 0b1111,
    missingFields: missingFieldsFromMask(0b1111),
    attempts,
    transientFailures: prev.transientFailures,
    nextRetryAt: exhausted ? 0 : await nextStaggeredRetryAt(db),
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
