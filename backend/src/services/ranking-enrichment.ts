/**
 * 榜单占位作品补全
 *
 * 榜单只给番号/标题/封面，没有演员、标签、发行商。
 * 每小时限量抓 JavBus 详情，补齐这些字段后作品才能参与推荐打分。
 */
import { RECOMMEND } from '@/constants';
import { enrichDataRecordFromDetail } from './data-storage';
import {
  getHtml,
  isJavCodeLike,
  normalizeJavCode,
  parseJavDetail,
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

function parseState(contentData: string | null): Record<string, unknown> {
  if (!contentData) return {};
  try {
    const parsed = JSON.parse(contentData);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function markFailure(db: D1Database, record: PendingRecord): Promise<void> {
  const state = parseState(record.content_data);
  const attempts = (Number(state.enrichAttempts) || 0) + 1;
  state.enrichAttempts = attempts;
  if (attempts >= RECOMMEND.ENRICH_MAX_FAILURES) {
    state.enrichFailed = true;
  }

  await db
    .prepare(
      `UPDATE data_records
       SET content_data = ?, last_updated_at = ?
       WHERE id = ?`
    )
    .bind(JSON.stringify(state), Date.now(), record.id)
    .run();
}

async function enrichOne(
  db: D1Database,
  record: PendingRecord,
  timeoutMs: number
): Promise<'completed' | 'failed'> {
  const url = `https://www.javbus.com/${record.code}`;

  try {
    const html = await getHtml(url, timeoutMs);
    if (!html || html.length < 500) {
      await markFailure(db, record);
      return 'failed';
    }

    const detail = parseJavDetail(html, record.code, url);
    if (detail.actresses.length === 0 && detail.tags.length === 0) {
      await markFailure(db, record);
      return 'failed';
    }

    await enrichDataRecordFromDetail(db, { detail });
    return 'completed';
  } catch (err) {
    console.error(`[ranking-enrichment] ${record.code} failed:`, err);
    await markFailure(db, record);
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

  const rows = await db
    .prepare(
      `SELECT id, code, content_data
       FROM data_records
       WHERE record_type = 'jav'
         AND status = 'active'
         AND detail_completed = 0
         AND code IS NOT NULL
       ORDER BY last_updated_at ASC
       LIMIT ?`
    )
    .bind(limit * 4)
    .all<PendingRecord>();

  const pending: PendingRecord[] = [];
  for (const row of rows.results || []) {
    const code = normalizeJavCode(row.code || '');
    if (!isJavCodeLike(code)) continue;

    const state = parseState(row.content_data);
    if (Number(state.enrichAttempts) >= RECOMMEND.ENRICH_MAX_FAILURES) {
      continue;
    }

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
