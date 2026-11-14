/**
 * 榜单导入服务
 *
 * 做三件事：
 *   1. 把周榜/月榜作品作为占位记录扩充进 data_records（只新增，已存在则完全跳过）；
 *   2. 把名次写入 data_record_sources（按 period + section 分来源，历史保留）；
 *   3. 返回各通道导入计数，供 workflow 判断。
 *
 * JavDB 只负责「库里没有时创建」：已存在记录（尤其已被 JavBus 详情补全过）
 * 的任何字段都不允许被榜单数据覆盖，因此冲突时直接 DO NOTHING。
 * 番号匹配以规范化 code 为准，经典番号额外兼容无横杠写法（jav:WAAA-624 / jav:WAAA624）。
 *
 * 不参与推荐打分。
 */
import { generateId } from '@/utils';
import { JAV_RANKING } from '@/constants';
import type { RankingImportPayload } from '@/types';
import { compactJavCode, inspectJavCode } from '@codeseek/shared/utils';

// D1 单条 SQL 最多 100 个绑定变量；每次 IN 查询最多 50 个 key，留足余量
const LOOKUP_CHUNK_SIZE = 50;

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

function chunk<T>(list: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

/** 按 key 分块查询已有记录，避免单条 SQL 绑定变量超过 D1 上限 */
async function loadRecordIdsByKey(
  db: D1Database,
  keys: string[]
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  for (const slice of chunk(keys, LOOKUP_CHUNK_SIZE)) {
    const placeholders = slice.map(() => '?').join(',');
    const rows = await db
      .prepare(
        `SELECT id, dedup_key FROM data_records
         WHERE record_type = 'jav' AND dedup_key IN (${placeholders})`
      )
      .bind(...slice)
      .all<{ id: string; dedup_key: string }>();
    for (const row of rows.results || []) {
      idByKey.set(row.dedup_key, row.id);
    }
  }
  return idByKey;
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

  // 番号匹配以规范化 code 为准；经典番号额外兼容无横杠写法
  const keysOf = (code: string): string[] => {
    const compact = compactJavCode(code);
    return compact === code ? [`jav:${code}`] : [`jav:${code}`, `jav:${compact}`];
  };
  const lookupKeys = Array.from(new Set(items.flatMap((item) => keysOf(item.code))));

  const idByKey = await loadRecordIdsByKey(db, lookupKeys);
  const existingIdOf = (code: string): string | undefined =>
    keysOf(code).map((key) => idByKey.get(key)).find((id): id is string => Boolean(id));

  const existingCount = items.filter((item) => existingIdOf(item.code)).length;

  // 只插入库里没有的作品；已存在的一律 DO NOTHING，JavDB 数据不得覆盖任何已有字段
  const insertStatements = items
    .filter((item) => !existingIdOf(item.code))
    .map((item) =>
      db
        .prepare(
          `INSERT INTO data_records
             (id, record_type, dedup_key, title, cover, code, actors, duration,
              release_date, publisher, tags, rating, content_data, detail_completed,
              status, source_count, first_seen_at, last_updated_at)
           VALUES (?, 'jav', ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', ?, '{}', 0,
                   'active', 0, ?, ?)
           ON CONFLICT(record_type, dedup_key) DO NOTHING`
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

  // 新增后再统一取一次记录 ID，供写入本期榜单名次（命中旧写法也在其中）
  const recordIdByKey = await loadRecordIdsByKey(db, lookupKeys);
  const recordIdOf = (code: string): string | undefined =>
    keysOf(code).map((key) => recordIdByKey.get(key)).find((id): id is string => Boolean(id));

  const createdCount = Math.max(0, items.length - existingCount);

  const sourceStatements: D1PreparedStatement[] = [];
  for (const item of items) {
    const recordId = recordIdOf(item.code);
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
