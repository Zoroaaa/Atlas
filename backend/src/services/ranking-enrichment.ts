/**
 * 榜单占位作品补全
 *
 * 榜单只给番号/标题/封面，没有演员、标签、发行商。
 * 每小时限量抓 JavBus 详情（含磁力），补齐这些字段后作品才能参与推荐打分。
 *
 * 注意：磁力与详情必须一起抓。历史上这里只抓详情页，导致记录被标记为
 * detail_completed=1 但磁力为空；现在统一走 fetchJavbusDetailWithMagnets。
 */
import { RECOMMEND } from '@/constants';
import { enrichDataRecordFromDetail } from './data-storage';
import { DETAIL_FIELD_BITS } from './jav-detail-meta';
import {
  fetchJavbusDetailWithMagnets,
  isJavCodeLike,
  normalizeJavCode,
} from './jav-utils';

interface PendingRecord {
  id: string;
  code: string;
  content_data: string | null;
}

interface EnrichOptions {
  limit?: number;
  concurrency?: number;
  timeoutMs?: number;
  budgetMs?: number;
}

export interface EnrichResult {
  processed: number;
  completed: number;
  failed: number;
}

async function enrichOne(
  db: D1Database,
  record: PendingRecord,
  timeoutMs: number
): Promise<'completed' | 'failed'> {
  try {
    const fetched = await fetchJavbusDetailWithMagnets(record.code, timeoutMs);
    if (!fetched.ok) {
      await enrichDataRecordFromDetail(db, { code: record.code, error: fetched.error });
      return 'failed';
    }

    const { detail, magnets, magnetFetchFailed } = fetched.data;
    const looksEmpty =
      detail.actresses.length === 0 &&
      detail.tags.length === 0 &&
      magnets.length === 0 &&
      detail.title.trim() === record.code;
    if (looksEmpty) {
      // 页面像占位/验证页，按暂时失败处理，不消耗源站缺失次数
      await enrichDataRecordFromDetail(db, { code: record.code, error: 'PARSE_ERROR' });
      return 'failed';
    }

    await enrichDataRecordFromDetail(db, { detail, magnets, magnetFetchFailed });
    return 'completed';
  } catch (err) {
    console.error(`[ranking-enrichment] ${record.code} failed:`, err);
    await enrichDataRecordFromDetail(db, { code: record.code, error: 'NETWORK_ERROR' });
    return 'failed';
  }
}

export async function enrichPendingJavRecords(
  db: D1Database,
  options: EnrichOptions = {}
): Promise<EnrichResult> {
  const limit = options.limit ?? RECOMMEND.ENRICH_BATCH;
  const concurrency = options.concurrency ?? RECOMMEND.ENRICH_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? RECOMMEND.ENRICH_TIMEOUT_MS;
  const budgetMs = options.budgetMs ?? RECOMMEND.ENRICH_TIME_BUDGET_MS;
  const now = Date.now();

  const rows = await db
    .prepare(
      `SELECT d.id, d.code, d.content_data
       FROM data_records d
       LEFT JOIN jav_detail_meta m ON m.record_id = d.id
       WHERE d.record_type = 'jav'
         AND d.status = 'active'
         AND d.detail_completed = 0
         AND d.code IS NOT NULL
         AND COALESCE(m.retry_exhausted, 0) = 0
         AND COALESCE(m.next_retry_at, 0) <= ?
         -- 只缺导演/制作商/发行商（磁力齐全）的记录不再自动重补：
         -- 这三项只能由管理端 JAV 详情批量补全面板手动触发。
         -- 在候选集里排除，而不是抓完之后过滤，避免白白请求源站。
         AND (
           COALESCE(m.status, 'pending') <> 'partial'
           OR (COALESCE(m.missing_mask, 0) & ${DETAIL_FIELD_BITS.magnets}) <> 0
         )
       ORDER BY COALESCE(m.next_retry_at, 0), d.last_updated_at ASC
       LIMIT ?`
    )
    .bind(now, limit * 4)
    .all<PendingRecord>();

  const pending: PendingRecord[] = [];
  for (const row of rows.results || []) {
    const code = normalizeJavCode(row.code || '');
    if (!isJavCodeLike(code)) continue;

    pending.push({ ...row, code });
    if (pending.length >= limit) break;
  }

  if (pending.length === 0) {
    return { processed: 0, completed: 0, failed: 0 };
  }

  const deadline = Date.now() + budgetMs;
  let cursor = 0;
  let processed = 0;
  let completed = 0;
  let failed = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, pending.length) },
    async () => {
      while (Date.now() < deadline) {
        const index = cursor++;
        if (index >= pending.length) return;

        processed++;
        const result = await enrichOne(db, pending[index], timeoutMs);
        if (result === 'completed') completed++;
        else failed++;
      }
    }
  );

  await Promise.allSettled(workers);

  return { processed, completed, failed };
}
