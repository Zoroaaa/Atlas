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

  // 以 jav_detail_meta 为驱动：按到期时间直接定位候选，命中 partial 索引
  // idx_jav_meta_auto_due（只收可自动补全的记录）。
  // 原写法以 data_records 为驱动、按 last_updated_at 排序，必须扫完整个待补全集
  // （其中大量记录的重试时间在 30 天后）才能筛出到期记录。
  // 约束：所有 detail_completed=0 的 JAV 记录都必须有 meta 行，写入链路
  // （markJavDetailPending / saveJavDetailMeta）负责保证，迁移 0008 已回填历史数据。
  const rows = await db
    .prepare(
      `SELECT d.id, d.code, d.content_data
       FROM jav_detail_meta m
       INNER JOIN data_records d ON d.id = m.record_id
       WHERE m.retry_exhausted = 0
         -- status <> 'complete' 与下面的 partial 条件必须与 partial 索引的
         -- WHERE 完全一致，否则索引不会被命中（complete 行的 next_retry_at 也是 0）。
         AND m.status <> 'complete'
         AND m.next_retry_at <= ?
         -- 只缺导演/制作商/发行商（磁力齐全）的记录不再自动重补：
         -- 这三项只能由管理端 JAV 详情批量补全面板手动触发。
         -- 在候选集里排除，而不是抓完之后过滤，避免白白请求源站。
         AND (
           m.status <> 'partial'
           OR (m.missing_mask & ${DETAIL_FIELD_BITS.magnets}) <> 0
         )
         AND d.record_type = 'jav'
         AND d.status = 'active'
         AND d.detail_completed = 0
         AND d.code IS NOT NULL
       ORDER BY m.next_retry_at ASC
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
