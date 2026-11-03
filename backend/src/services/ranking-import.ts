/**
 * 榜单导入服务
 *
 * 只做两件事：
 *   1. 把榜单作品作为占位记录扩充进 data_records；
 *   2. 把名次写入 data_record_sources，供独立热门列表排序。
 *
 * 不参与推荐打分。
 */
import { generateId } from '@/utils';
import type { RankingImportPayload } from '@/types';
import { isValidCode, normalizeCode } from './jav-utils';

export interface RankingImportResult {
  created: number;
  existing: number;
  sources: number;
  skipped: number;
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

function sourceNameOf(section: 'censored' | 'uncensored'): string {
  return section === 'censored' ? 'JavDB:有码月榜' : 'JavDB:无码月榜';
}

function sourceUrlOf(section: 'censored' | 'uncensored'): string {
  return `https://javdb.com/rankings/movies?period=month&type=${section}`;
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
  const sourceName = sourceNameOf(payload.section);
  const sourceUrl = sourceUrlOf(payload.section);

  const seen = new Set<string>();
  const items: NormalizedItem[] = [];
  let skipped = 0;

  payload.items.forEach((raw, index) => {
    const code = normalizeCode(raw.code);
    if (!isValidCode(code) || seen.has(code)) {
      skipped++;
      return;
    }
    seen.add(code);
    items.push({
      code,
      rank: Math.max(1, raw.rank ?? index + 1),
      title: (raw.title || code).trim().slice(0, 300),
      cover: normalizeCover(raw.cover),
      rating: raw.score != null ? String(raw.score).slice(0, 20) : null,
      url: raw.url,
    });
  });

  if (items.length === 0) {
    return { created: 0, existing: 0, sources: 0, skipped };
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

  // 标记来源，补全时保留 JavDB 的标题/封面，只补演员/标签/发行商
  const placeholderContent = JSON.stringify({ origin: 'javdb-ranking' });

  const insertStatements = items.map((item) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO data_records
           (id, record_type, dedup_key, title, cover, code, actors, duration,
            release_date, publisher, tags, rating, content_data, detail_completed,
            status, source_count, first_seen_at, last_updated_at)
         VALUES (?, 'jav', ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', ?, ?, 0,
                 'active', 0, ?, ?)`
      )
      .bind(
        generateId(),
        `jav:${item.code}`,
        item.title,
        item.cover,
        item.code,
        item.rating,
        placeholderContent,
        now,
        now
      )
  );
  await runBatches(db, insertStatements);

  // 兼容已导入但还没补全的旧占位记录
  await db
    .prepare(
      `UPDATE data_records
       SET content_data = ?
       WHERE record_type = 'jav'
         AND detail_completed = 0
         AND dedup_key IN (${placeholders})
         AND (content_data IS NULL OR content_data = '{}')`
    )
    .bind(placeholderContent, ...dedupKeys)
    .run();

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
          sourceName,
          sourceUrl,
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
  };
}
