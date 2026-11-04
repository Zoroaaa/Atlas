/**
 * 榜单导入服务
 *
 * 做三件事：
 *   1. 把周榜/月榜作品作为占位记录扩充进 data_records（已存在则更新元数据，不删除）；
 *   2. 把名次写入 data_record_sources（按 period + section 分来源，历史保留）；
 *   3. 返回各通道导入计数，供 workflow 判断。
 *
 * 不参与推荐打分。
 */
import { generateId } from '@/utils';
import { JAV_RANKING } from '@/constants';
import type { RankingImportPayload } from '@/types';
import { inspectJavCode } from '@codeseek/shared/utils';

export interface RankingImportResult {
  created: number;
  existing: number;
  sources: number;
  skipped: number;
  period: 'weekly' | 'monthly';
  section: 'censored' | 'uncensored';
  rejected?: 'TOO_FEW_ITEMS';
}

interface NormalizedItem {
  code: string;
  rank: number;
  title: string;
  cover: string | null;
  rating: string | null;
  url?: string;
}

function normalizeCover(raw?: string): string | null {
  if (!raw) return null;
  const cover = raw.trim();
  if (!cover) return null;
  if (cover.startsWith('//')) return `https:${cover}`;
  if (cover.startsWith('/')) return `https://javdb.com${cover}`;
  return cover;
}

const SOURCE_BY_KEY = {
  'censored:weekly': JAV_RANKING.SOURCE.CENSORED_WEEKLY,
  'uncensored:weekly': JAV_RANKING.SOURCE.UNCENSORED_WEEKLY,
  'censored:monthly': JAV_RANKING.SOURCE.CENSORED_MONTHLY,
  'uncensored:monthly': JAV_RANKING.SOURCE.UNCENSORED_MONTHLY,
} as const;

function sourceOf(
  section: 'censored' | 'uncensored',
  period: 'weekly' | 'monthly'
) {
  return SOURCE_BY_KEY[`${section}:${period}`];
}

async function runBatches(
  db: D1Database,
  statements: D1PreparedStatement[],
  size = 50
): Promise<void> {
  for (let i = 0; i < statements.length; i += size) {
    await db.batch(statements.slice(i, i + size));
  }
}

export async function importRankingSnapshot(
  db: D1Database,
  payload: RankingImportPayload
): Promise<RankingImportResult> {
  const now = Date.now();
  const fetchedAt = payload.fetchedAt ?? now;
  const source = sourceOf(payload.section, payload.period);

  const seen = new Set<string>();
  const items: NormalizedItem[] = [];
  let skipped = 0;

  payload.items.forEach((raw, index) => {
    const info = inspectJavCode(raw.code);
    if (!info.recognized || seen.has(info.code)) {
      skipped++;
      return;
    }
    seen.add(info.code);
    items.push({
      code: info.code,
      rank: Math.max(1, raw.rank ?? index + 1),
      title: (raw.title || info.code).trim().slice(0, 300),
      cover: normalizeCover(raw.cover),
      rating: raw.score != null ? String(raw.score).slice(0, 20) : null,
      url: raw.url,
    });
  });

  if (items.length === 0) {
    return {
      created: 0,
      existing: 0,
      sources: 0,
      skipped,
      period: payload.period,
      section: payload.section,
    };
  }

  if (items.length < JAV_RANKING.MIN_IMPORT_ITEMS) {
    return {
      created: 0,
      existing: 0,
      sources: 0,
      skipped,
      period: payload.period,
      section: payload.section,
      rejected: 'TOO_FEW_ITEMS',
    };
  }

  const dedupKeys = items.map((item) => `jav:${item.code}`);
  const placeholders = dedupKeys.map(() => '?').join(',');
  const preExistingRows = await db
    .prepare(
      `SELECT dedup_key FROM data_records
       WHERE record_type = 'jav' AND dedup_key IN (${placeholders})`
    )
    .bind(...dedupKeys)
    .all<{ dedup_key: string }>();
  const existingCount = preExistingRows.results?.length || 0;

  const insertStatements = items.map((item) =>
    db
      .prepare(
        `INSERT INTO data_records
           (id, record_type, dedup_key, title, cover, code, actors, duration,
            release_date, publisher, tags, rating, content_data, detail_completed,
            status, source_count, first_seen_at, last_updated_at)
         VALUES (?, 'jav', ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', ?, '{}', 0,
                 'active', 0, ?, ?)
         ON CONFLICT(record_type, dedup_key) DO UPDATE SET
           title = CASE WHEN data_records.detail_completed = 0 THEN excluded.title ELSE data_records.title END,
           cover = CASE WHEN data_records.detail_completed = 0 THEN COALESCE(excluded.cover, data_records.cover) ELSE data_records.cover END,
           rating = COALESCE(data_records.rating, excluded.rating)`
      )
      .bind(
        generateId(),
        `jav:${item.code}`,
        item.title,
        item.cover,
        item.code,
        item.rating,
        now,
        now
      )
  );
  await runBatches(db, insertStatements);

  const existingRows = await db
    .prepare(
      `SELECT id, dedup_key FROM data_records
       WHERE record_type = 'jav' AND dedup_key IN (${placeholders})`
    )
    .bind(...dedupKeys)
    .all<{ id: string; dedup_key: string }>();

  const idByDedupKey = new Map(
    (existingRows.results || []).map((row) => [row.dedup_key, row.id])
  );
  const createdCount = Math.max(0, items.length - existingCount);

  const sourceStatements: D1PreparedStatement[] = [];
  for (const item of items) {
    const recordId = idByDedupKey.get(`jav:${item.code}`);
    if (!recordId) continue;

    const sourceData = JSON.stringify({
      rank: item.rank,
      score: item.rating,
      section: payload.section,
      period: payload.period,
      fetchedAt,
      ...(item.url ? { url: item.url } : {}),
    });

    sourceStatements.push(
      db
        .prepare(
          `INSERT INTO data_record_sources
             (id, record_id, source_name, source_type, source_url, source_data, created_at)
           VALUES (?, ?, ?, 'ranking', ?, ?, ?)
           ON CONFLICT(record_id, source_name, source_url)
           DO UPDATE SET source_data = excluded.source_data`
        )
        .bind(
          generateId(),
          recordId,
          source.name,
          source.url,
          sourceData,
          now
        )
    );
  }
  await runBatches(db, sourceStatements);

  return {
    created: createdCount,
    existing: existingCount,
    sources: sourceStatements.length,
    skipped,
    period: payload.period,
    section: payload.section,
  };
}
