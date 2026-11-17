/**
 * 榜单导入服务
 *
 * 做四件事：
 *   1. 把周榜/月榜/TOP250 作品作为占位记录扩充进 data_records（只新增，已存在则完全跳过）；
 *   2. 周榜/月榜把名次写入 data_record_sources（现有「最近热播」面板读取）；
 *   3. 所有榜单把每次导入写成 jav_ranking_snapshots + jav_ranking_entries 归档，
 *      供管理端查看历史名次。四种榜单统一按「周期 + 东八区抓取日」每天保留一期，
 *      同一天重跑只覆盖当天快照；
 *   4. 为新入库的占位记录补 jav_detail_meta（标记详情不完整、缺哪些字段）。
 *
 * 更新策略（2026-11 起）：JavDB 只负责「库里没有时创建」。
 * 已存在记录（尤其已被 JavBus 详情补全过）的任何字段都不允许被榜单数据覆盖，
 * 因此冲突时直接 DO NOTHING；重复导入只追加/刷新名次快照，不更新作品数据。
 *
 * 番号匹配以规范化 code 为准，经典番号额外兼容无横杠写法（jav:WAAA-624 / jav:WAAA624）。
 *
 * 不参与推荐打分。
 */
import { generateId } from '@/utils';
import { normalizeJavdbCover } from '@/services/javdb-cover';
import {
  JAV_RANKING,
  JAV_TOP250,
  javTop250SourceName,
  javTop250YearSourceName,
  type JavTop250SectionKey,
} from '@/constants';
import type {
  RankingImportPayload,
  RankingImportPeriod,
  RankingImportSection,
} from '@/types';
import { compactJavCode, inspectJavCode } from '@codeseek/shared/utils';
import { markJavDetailPending } from './jav-detail-meta';

// D1 单条 SQL 最多 100 个绑定变量；每次 IN 查询最多 50 个 key，留足余量
const LOOKUP_CHUNK_SIZE = 50;

export interface RankingImportResult {
  created: number;
  existing: number;
  sources: number;
  archived: number;
  skipped: number;
  period: RankingImportPeriod;
  section: RankingImportSection;
  year?: number;
  snapshotAt?: number;
  sourceName?: string;
  rejected?: 'TOO_FEW_ITEMS' | 'INVALID_CHANNEL';
}

interface NormalizedItem {
  code: string;
  rank: number;
  title: string;
  cover: string | null;
  rating: string | null;
  url?: string;
}

const SOURCE_BY_KEY: Record<string, { name: string; url: string }> = {
  'censored:weekly': JAV_RANKING.SOURCE.CENSORED_WEEKLY,
  'uncensored:weekly': JAV_RANKING.SOURCE.UNCENSORED_WEEKLY,
  'censored:monthly': JAV_RANKING.SOURCE.CENSORED_MONTHLY,
  'uncensored:monthly': JAV_RANKING.SOURCE.UNCENSORED_MONTHLY,
};

function isTop250Section(section: RankingImportSection): section is JavTop250SectionKey {
  return JAV_TOP250.SECTIONS.some((item) => item.key === section);
}

/**
 * 通道校验与来源名称。
 * 返回 null 表示通道组合非法（例如周榜传了 TOP250 的「欧美」分类）。
 */
function resolveChannel(payload: RankingImportPayload): { name: string; url: string } | null {
  const { period, section, year } = payload;

  if (period === 'weekly' || period === 'monthly') {
    if (section !== 'censored' && section !== 'uncensored') return null;
    return SOURCE_BY_KEY[`${section}:${period}`] ?? null;
  }

  if (period === 'top250') {
    if (!isTop250Section(section)) return null;
    const sourceName = javTop250SourceName(section);
    const meta = JAV_TOP250.SECTIONS.find((item) => item.key === section);
    return {
      name: sourceName,
      url: `https://javdb.com/rankings/top250?type=${meta?.apiValue ?? 'all'}`,
    };
  }

  // yearly：TOP250 年度榜，只有「全部」分类
  if (section !== 'all' || !Number.isInteger(year)) return null;
  if (year! < JAV_TOP250.YEAR_START || year! > JAV_TOP250.YEAR_END) return null;
  return {
    name: javTop250YearSourceName(year!),
    url: `https://javdb.com/rankings/top250?year=${year}`,
  };
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

const CST_OFFSET_MS = 8 * 3600_000;

/**
 * 快照键：四种榜单统一按「周期 + 东八区抓取日」，每天保留一期。
 * - weekly：ISO 周 + 抓取日
 * - monthly / top250：自然月 + 抓取日
 * - yearly：年份 + 抓取日
 */
export function cycleKeyOf(period: RankingImportPeriod, ts: number, year?: number): string {
  const cst = new Date(ts + CST_OFFSET_MS);
  const yearValue = cst.getUTCFullYear();
  const month = String(cst.getUTCMonth() + 1).padStart(2, '0');
  const dayKey = `${yearValue}-${month}-${String(cst.getUTCDate()).padStart(2, '0')}`;
  if (period === 'yearly' && Number.isInteger(year)) return `year:${Number(year)}:${dayKey}`;

  if (period === 'weekly') {
    const day = cst.getUTCDay() || 7;
    const thursday = new Date(Date.UTC(yearValue, cst.getUTCMonth(), cst.getUTCDate() + 4 - day));
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `week:${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}:${dayKey}`;
  }
  return `month:${yearValue}-${month}:${dayKey}`;
}

/**
 * 快照去重窗口起点：东八区当天 0 点。
 * 所有榜单同一通道同一天重跑只覆盖当天快照，前几天的历史保留。
 */
export function snapshotWindowStartMs(ts: number): number {
  const cst = new Date(ts + CST_OFFSET_MS);
  return Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate()) - CST_OFFSET_MS;
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
  const channel = resolveChannel(payload);

  if (!channel) {
    return {
      created: 0,
      existing: 0,
      sources: 0,
      archived: 0,
      skipped: 0,
      period: payload.period,
      section: payload.section,
      year: payload.year,
      rejected: 'INVALID_CHANNEL',
    };
  }

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
      cover: normalizeJavdbCover(raw.cover),
      rating: raw.score != null ? String(raw.score).slice(0, 20) : null,
      url: raw.url,
    });
  });

  const minItems = payload.period === 'top250' || payload.period === 'yearly'
    ? JAV_TOP250.MIN_IMPORT_ITEMS
    : JAV_RANKING.MIN_IMPORT_ITEMS;

  if (items.length === 0 || items.length < minItems) {
    return {
      created: 0,
      existing: 0,
      sources: 0,
      archived: 0,
      skipped,
      period: payload.period,
      section: payload.section,
      year: payload.year,
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

  // 新增后再统一取一次记录 ID，供写入来源与归档（命中旧写法也在其中）
  const recordIdByKey = await loadRecordIdsByKey(db, lookupKeys);
  const recordIdOf = (code: string): string | undefined =>
    keysOf(code).map((key) => recordIdByKey.get(key)).find((id): id is string => Boolean(id));

  const createdCount = Math.max(0, items.length - existingCount);

  // ── 来源记录 ──
  // 周榜/月榜用 source_type='ranking'（现有「最近热播」面板读取）；
  // TOP250/年度榜用 'info'，只做本地库来源与名次存证，避免拖慢榜单面板。
  const isWeeklyMonthly = payload.period === 'weekly' || payload.period === 'monthly';
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
      ...(payload.year ? { year: payload.year } : {}),
      ...(item.url ? { url: item.url } : {}),
    });

    sourceStatements.push(
      db
        .prepare(
          `INSERT INTO data_record_sources
             (id, record_id, source_name, source_type, source_url, source_data, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(record_id, source_name, source_url)
           DO UPDATE SET source_data = excluded.source_data`
        )
        .bind(
          generateId(),
          recordId,
          channel.name,
          isWeeklyMonthly ? 'ranking' : 'info',
          channel.url,
          sourceData,
          now
        )
    );
  }
  await runBatches(db, sourceStatements);

  // ── 归档：snapshot + entries（所有榜单通道） ──
  // 所有榜单按天保留，同一天重跑替换当天快照。
  const snapshotKey = `${channel.name}:${cycleKeyOf(payload.period, fetchedAt, payload.year)}`;
  const replaceWindowStart = snapshotWindowStartMs(fetchedAt);

  // 先清掉当天旧条目，再写入本次完整结果，避免掉榜作品残留
  await db
    .prepare('DELETE FROM jav_ranking_entries WHERE snapshot_key = ?')
    .bind(snapshotKey)
    .run();

  await db
    .prepare(
      `INSERT INTO jav_ranking_snapshots
         (snapshot_key, source_name, list_type, section, year, snapshot_at, item_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(snapshot_key) DO UPDATE SET
         item_count = excluded.item_count,
         snapshot_at = excluded.snapshot_at`
    )
    .bind(
      snapshotKey,
      channel.name,
      payload.period,
      payload.section,
      payload.year ?? null,
      fetchedAt,
      items.length,
      now
    )
    .run();

  const archiveStatements: D1PreparedStatement[] = [];
  for (const item of items) {
    archiveStatements.push(
      db
        .prepare(
          `INSERT INTO jav_ranking_entries
             (id, snapshot_key, record_id, code, title, cover, rank, score, url,
              list_type, section, year, source_name, snapshot_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(snapshot_key, code) DO UPDATE SET
             rank = excluded.rank,
             score = excluded.score,
             title = excluded.title,
             cover = COALESCE(excluded.cover, jav_ranking_entries.cover),
             url = COALESCE(excluded.url, jav_ranking_entries.url),
             record_id = COALESCE(excluded.record_id, jav_ranking_entries.record_id)`
        )
        .bind(
          `${snapshotKey}:${item.code}`,
          snapshotKey,
          recordIdOf(item.code) ?? null,
          item.code,
          item.title,
          item.cover,
          item.rank,
          item.rating,
          item.url ?? null,
          payload.period,
          payload.section,
          payload.year ?? null,
          channel.name,
          fetchedAt,
          now
        )
    );
  }
  await runBatches(db, archiveStatements);

  // 清理当天沿用旧键的历史快照：只清当天（不碰前几天的历史），重跑不会产生重复快照。
  const staleWhere =
    `source_name = ? AND list_type = ? AND section = ? AND COALESCE(year, 0) = ? ` +
    `AND snapshot_key <> ? AND snapshot_at >= ?`;
  const staleParams = [
    channel.name,
    payload.period,
    payload.section,
    payload.year ?? 0,
    snapshotKey,
    replaceWindowStart,
  ];
  await db.batch([
    db
      .prepare(
        `DELETE FROM jav_ranking_entries WHERE snapshot_key IN (
           SELECT snapshot_key FROM jav_ranking_snapshots WHERE ${staleWhere}
         )`
      )
      .bind(...staleParams),
    db.prepare(`DELETE FROM jav_ranking_snapshots WHERE ${staleWhere}`).bind(...staleParams),
  ]);

  // 新入库的占位记录显式标记「详情不完整 + 缺哪些字段」；
  // 已有 meta 行（包括已补全）不会被覆盖。
  const recordIds = items
    .map((item) => recordIdOf(item.code))
    .filter((id): id is string => Boolean(id));
  await markJavDetailPending(db, recordIds);

  return {
    created: createdCount,
    existing: existingCount,
    sources: sourceStatements.length,
    archived: archiveStatements.length,
    skipped,
    period: payload.period,
    section: payload.section,
    year: payload.year,
    snapshotAt: fetchedAt,
    sourceName: channel.name,
  };
}
