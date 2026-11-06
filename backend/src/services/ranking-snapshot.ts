/**
 * JavDB 榜单快照读取
 *
 * 只读 data_record_sources 里的 ranking 行，不删除任何历史数据。
 * 每个 (period, section) 取 fetchedAt 最大的那一批作为“当前榜单”；
 * 掉榜作品的旧行仍保留在库中，但不会被当成当前榜单返回。
 */
import { JAV_RANKING } from '@/constants';
import { getRankingRows, type RankingRow } from '@/repositories/recommendation-repository';
import { parseValueList } from './recommendation-utils';

export type RankingPeriod = 'weekly' | 'monthly';
export type RankingSection = 'censored' | 'uncensored';

export interface RankingRecord {
  row: RankingRow;
  rank: number;
  fetchedAt: number;
  section: RankingSection;
  period: RankingPeriod;
  url?: string;
}

export interface JavRankingEntry {
  code: string;
  title: string;
  cover?: string;
  rank: number;
  url?: string;
  /** 相对上一期快照的名次变化：正数=上升，负数=下降；无上一期快照时不返回 */
  change?: number;
  /** 上一期快照里没有（新上榜）；无上一期快照时不返回 */
  isNew?: boolean;
}

export interface JavRankingSectionView {
  censored: JavRankingEntry[];
  uncensored: JavRankingEntry[];
  updatedAt: number;
}

export interface JavRankingSnapshot {
  weekly: JavRankingSectionView;
  monthly: JavRankingSectionView;
  source: 'javdb';
}

const SOURCE_CONFIGS = Object.values(JAV_RANKING.SOURCE);
const PERIOD_ORDER: Record<RankingPeriod, number> = { weekly: 0, monthly: 1 };

function sourceConfigOf(sourceName: string) {
  return SOURCE_CONFIGS.find((source) => source.name === sourceName);
}

function isPeriod(value: unknown): value is RankingPeriod {
  return value === 'weekly' || value === 'monthly';
}

function isSection(value: unknown): value is RankingSection {
  return value === 'censored' || value === 'uncensored';
}

function parseSourceData(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function toRankingRecord(row: RankingRow): RankingRecord | null {
  if (!row.code) return null;

  const data = parseSourceData(row.source_data);
  const config = sourceConfigOf(row.source_name);

  const period = isPeriod(data.period)
    ? data.period
    : config?.period;
  const section = isSection(data.section)
    ? data.section
    : config?.section;
  if (!period || !section) return null;

  const rankValue = Number(data.rank);
  if (!Number.isFinite(rankValue) || rankValue < 1) return null;
  const rank = Math.floor(rankValue);

  const fetchedAt = Number(data.fetchedAt ?? row.created_at) || 0;
  if (!fetchedAt) return null;

  const url = typeof data.url === 'string' && data.url ? data.url : undefined;

  return { row, rank, fetchedAt, section, period, url };
}

/**
 * 每个 (period, section) 只返回 fetchedAt 最大的那一批记录。
 * 历史行保留在表里，但不会混进当前榜单。
 */
export async function getLatestRankingRecords(db: D1Database): Promise<RankingRecord[]> {
  return latestRecordsOf(await loadRankingRecords(db));
}

async function loadRankingRecords(db: D1Database): Promise<RankingRecord[]> {
  const rows = await getRankingRows(db);
  return rows
    .map(toRankingRecord)
    .filter((record): record is RankingRecord => record !== null);
}

// 与上一期快照至少间隔这么久才算"上一期"，避免同一天多次导入互相比较
const PREVIOUS_SNAPSHOT_MIN_GAP_MS = 20 * 60 * 60 * 1000;

/** 每个 (period, section) 上一期快照的 code -> rank；没有上一期的组不出现在结果中 */
function previousRankMaps(parsed: RankingRecord[]): Map<string, Map<string, number>> {
  const latestByGroup = new Map<string, number>();
  for (const record of parsed) {
    const key = `${record.period}:${record.section}`;
    if (record.fetchedAt > (latestByGroup.get(key) ?? 0)) latestByGroup.set(key, record.fetchedAt);
  }

  const previousByGroup = new Map<string, number>();
  for (const record of parsed) {
    const key = `${record.period}:${record.section}`;
    const latest = latestByGroup.get(key) ?? 0;
    if (record.fetchedAt <= latest - PREVIOUS_SNAPSHOT_MIN_GAP_MS &&
        record.fetchedAt > (previousByGroup.get(key) ?? 0)) {
      previousByGroup.set(key, record.fetchedAt);
    }
  }

  const result = new Map<string, Map<string, number>>();
  for (const record of parsed) {
    const key = `${record.period}:${record.section}`;
    if (previousByGroup.get(key) !== record.fetchedAt) continue;
    const ranks = result.get(key) ?? new Map<string, number>();
    const existing = ranks.get(record.row.code);
    if (existing === undefined || record.rank < existing) ranks.set(record.row.code, record.rank);
    result.set(key, ranks);
  }
  return result;
}

function latestRecordsOf(parsed: RankingRecord[]): RankingRecord[] {
  const latestByGroup = new Map<string, number>();
  for (const record of parsed) {
    const key = `${record.period}:${record.section}`;
    const current = latestByGroup.get(key) ?? 0;
    if (record.fetchedAt > current) latestByGroup.set(key, record.fetchedAt);
  }

  const latest = parsed.filter((record) =>
    record.fetchedAt === latestByGroup.get(`${record.period}:${record.section}`)
  );

  // 同一组同番号取最小 rank；weekly 优先，然后 rank 升序
  const byGroupCode = new Map<string, RankingRecord>();
  for (const record of latest) {
    const key = `${record.period}:${record.section}:${record.row.code}`;
    const existing = byGroupCode.get(key);
    if (!existing || record.rank < existing.rank) {
      byGroupCode.set(key, record);
    }
  }

  return Array.from(byGroupCode.values()).sort((a, b) => {
    if (a.period !== b.period) return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    return a.rank - b.rank;
  });
}

function entriesOf(
  records: RankingRecord[],
  period: RankingPeriod,
  section: RankingSection,
  previous: Map<string, Map<string, number>>
): JavRankingEntry[] {
  const prevRanks = previous.get(`${period}:${section}`);
  return records
    .filter((record) => record.period === period && record.section === section)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, JAV_RANKING.PANEL_LIMIT)
    .map((record) => {
      const prevRank = prevRanks?.get(record.row.code);
      return {
        code: record.row.code,
        title: record.row.title || record.row.code,
        cover: record.row.cover || undefined,
        rank: record.rank,
        url: record.url,
        ...(prevRanks
          ? prevRank === undefined
            ? { isNew: true }
            : { change: prevRank - record.rank }
          : {}),
      };
    });
}

function updatedAtOf(records: RankingRecord[], period: RankingPeriod): number {
  return records
    .filter((record) => record.period === period)
    .reduce((max, record) => Math.max(max, record.fetchedAt), 0);
}

/** 包装成前端响应：每个 period+section 截取 PANEL_LIMIT 条 */
export async function getJavRankingSnapshot(db: D1Database): Promise<JavRankingSnapshot> {
  const parsed = await loadRankingRecords(db);
  const records = latestRecordsOf(parsed);
  const previous = previousRankMaps(parsed);

  return {
    weekly: {
      censored: entriesOf(records, 'weekly', 'censored', previous),
      uncensored: entriesOf(records, 'weekly', 'uncensored', previous),
      updatedAt: updatedAtOf(records, 'weekly'),
    },
    monthly: {
      censored: entriesOf(records, 'monthly', 'censored', previous),
      uncensored: entriesOf(records, 'monthly', 'uncensored', previous),
      updatedAt: updatedAtOf(records, 'monthly'),
    },
    source: 'javdb',
  };
}

/** 从最新周榜/月榜记录聚合演员上榜作品数（同番号跨周/月只算 1 部） */
export function countRankingActors(
  records: RankingRecord[]
): Map<string, { name: string; works: number }> {
  const actorWorks = new Map<string, { name: string; codes: Set<string> }>();

  for (const record of records) {
    const code = record.row.code;
    if (!code) continue;

    const seenActors = new Set<string>();
    for (const actor of parseValueList(record.row.actors)) {
      const key = actor.trim().toLowerCase();
      if (!key || seenActors.has(key)) continue;
      seenActors.add(key);

      const existing = actorWorks.get(key);
      if (existing) {
        existing.codes.add(code);
      } else {
        actorWorks.set(key, { name: actor.trim(), codes: new Set([code]) });
      }
    }
  }

  const result = new Map<string, { name: string; works: number }>();
  for (const [key, value] of actorWorks) {
    result.set(key, { name: value.name, works: value.codes.size });
  }
  return result;
}
