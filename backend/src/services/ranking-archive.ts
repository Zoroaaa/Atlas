/**
 * 榜单归档查询：只读 jav_ranking_snapshots / jav_ranking_entries，写入方是 ranking-import。
 *
 * 服务两个场景：前台 TOP250 面板取最新一期；管理端按周期/分类/年份/快照/关键词筛选历史。
 * 周期与终榜标记在查询时按快照时间计算，不额外落库；迁移未执行时返回空态而不是抛错。
 */
import { JAV_TOP250 } from '@/constants';
import { missingFieldsFromMask, type JavDetailField } from './jav-detail-meta';
import { parseRankingCycleKey, rankingCycleOf } from './ranking-cycle';

/** list_type 合法值；与导入侧写入的 period 一致。 */
const VALID_LIST_TYPES = ['weekly', 'monthly', 'top250', 'yearly'] as const;
/** 榜单分类合法值；yearly 只有 all。 */
const VALID_SECTIONS = ['censored', 'uncensored', 'western', 'fc2', 'all'] as const;

export type RankingListType = (typeof VALID_LIST_TYPES)[number];
export type RankingArchiveSection = (typeof VALID_SECTIONS)[number];

/** 查询参数里的榜单周期是否为合法值。 */
export function isRankingListType(value: unknown): value is RankingListType {
  return typeof value === 'string' && (VALID_LIST_TYPES as readonly string[]).includes(value);
}

/** 查询参数里的分类是否为合法值。 */
export function isRankingArchiveSection(value: unknown): value is RankingArchiveSection {
  return typeof value === 'string' && (VALID_SECTIONS as readonly string[]).includes(value);
}

export interface Top250Item {
  code: string;
  title: string;
  cover?: string;
  rank: number;
  score?: string;
  url?: string;
}

export interface Top250Snapshot {
  section: string;
  year: number | null;
  items: Top250Item[];
  updatedAt: number;
  total: number;
}

/** 管理端榜单归档条目：含详情补全状态、周期与缺失字段。 */
export interface RankingArchiveEntry {
  id: string;
  snapshotKey: string;
  snapshotAt: number;
  sourceName: string;
  listType: RankingListType;
  section: string;
  year: number | null;
  rank: number;
  code: string;
  title: string;
  cover: string | null;
  score: string | null;
  url: string | null;
  recordId: string | null;
  detailCompleted: boolean;
  detailStatus: string | null;
  detailMissing: JavDetailField[];
  /** 周期标识；TOP250 不分周期时为 null */
  cycleKey: string | null;
  /** 是否为该周期终榜 */
  isFinal: boolean;
}

export interface RankingArchiveSnapshot {
  snapshotKey: string;
  sourceName: string;
  listType: RankingListType;
  section: string;
  year: number | null;
  snapshotAt: number;
  itemCount: number;
  /** 周期标识；TOP250 不分周期时为 null */
  cycleKey: string | null;
  /** 是否为该周期终榜 */
  isFinal: boolean;
}

export interface RankingArchiveMeta {
  totals: {
    snapshots: number;
    entries: number;
    works: number;
  };
  channels: Array<{
    listType: string;
    section: string;
    year: number | null;
    snapshots: number;
    entries: number;
    latestAt: number;
  }>;
  years: number[];
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const value = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** 解析分页参数；页码上限 100000，每页最多 100 条，防止大 offset 拖垮查询。 */
export function parseArchivePagination(query: {
  page?: string;
  pageSize?: string;
}): { page: number; pageSize: number } {
  return {
    page: clampInt(query.page, 1, 100000, 1),
    pageSize: clampInt(query.pageSize, 1, 100, 20),
  };
}

/** 前台 TOP250：取指定分类/年份的最新一期 */
export async function getTop250Snapshot(
  db: D1Database,
  section: string,
  year: number | null
): Promise<Top250Snapshot> {
  try {
    const snapshot = year == null
      ? await db
          .prepare(
            `SELECT snapshot_key, snapshot_at
             FROM jav_ranking_snapshots
             WHERE list_type = 'top250' AND section = ?
             ORDER BY snapshot_at DESC
             LIMIT 1`
          )
          .bind(section)
          .first<{ snapshot_key: string; snapshot_at: number }>()
      : await db
          .prepare(
            `SELECT snapshot_key, snapshot_at
             FROM jav_ranking_snapshots
             WHERE list_type = 'yearly' AND section = 'all' AND year = ?
             ORDER BY snapshot_at DESC
             LIMIT 1`
          )
          .bind(year)
          .first<{ snapshot_key: string; snapshot_at: number }>();

    if (!snapshot) {
      return { section, year, items: [], updatedAt: 0, total: 0 };
    }

    const rows = await db
      .prepare(
        `SELECT e.code,
                COALESCE(d.title, e.title, e.code) AS title,
                COALESCE(d.cover, e.cover) AS cover,
                e.rank,
                e.score,
                e.url
         FROM jav_ranking_entries e
         LEFT JOIN data_records d ON d.id = e.record_id
         WHERE e.snapshot_key = ?
         ORDER BY e.rank ASC
         LIMIT ?`
      )
      .bind(snapshot.snapshot_key, JAV_TOP250.MAX_ITEMS)
      .all<{
        code: string;
        title: string;
        cover: string | null;
        rank: number;
        score: string | null;
        url: string | null;
      }>();

    const items = (rows.results || []).map((row) => ({
      code: row.code,
      title: row.title || row.code,
      cover: row.cover ?? undefined,
      rank: Number(row.rank) || 0,
      score: row.score ?? undefined,
      url: row.url ?? undefined,
    }));

    return {
      section,
      year,
      items,
      updatedAt: Number(snapshot.snapshot_at) || 0,
      total: items.length,
    };
  } catch (err) {
    // 迁移尚未执行时页面应正常渲染空态，而不是 500
    console.error('[ranking-archive] top250 query failed:', err);
    return { section, year, items: [], updatedAt: 0, total: 0 };
  }
}

// ── 管理端：元数据 / 快照列表 / 名次明细 ─────────────────────────────

interface ArchiveFilterInput {
  listType?: string;
  section?: string;
  year?: string;
  snapshotKey?: string;
  cycleKey?: string;
  search?: string;
}

function buildFilters(input: ArchiveFilterInput): {
  where: string;
  params: (string | number)[];
} {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (isRankingListType(input.listType)) {
    where.push('s.list_type = ?');
    params.push(input.listType);
  }
  if (isRankingArchiveSection(input.section)) {
    where.push('s.section = ?');
    params.push(input.section);
  }
  const year = Number.parseInt(input.year ?? '', 10);
  if (Number.isFinite(year) && year >= 1900) {
    where.push('s.year = ?');
    params.push(year);
  }
  if (input.snapshotKey) {
    where.push('s.snapshot_key = ?');
    params.push(input.snapshotKey);
  }
  // 周期筛选换算成东八区自然日范围；年度榜的周期是刷新年，与目标年份 year 字段互不影响
  if (input.cycleKey) {
    const range = parseRankingCycleKey(input.cycleKey);
    if (range) {
      where.push('s.list_type = ? AND s.snapshot_at >= ? AND s.snapshot_at < ?');
      params.push(range.listType, range.startAt, range.endAt);
    }
  }

  return {
    where: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

/** 管理端概览：快照/条目/作品总数、各通道统计与可选年份列表。 */
export async function getRankingArchiveMeta(db: D1Database): Promise<RankingArchiveMeta> {
  try {
    const [totalRow, channelRows] = await db.batch([
      db.prepare(
        `SELECT
           (SELECT COUNT(*) FROM jav_ranking_snapshots) AS snapshots,
           (SELECT COUNT(*) FROM jav_ranking_entries) AS entries,
           (SELECT COUNT(DISTINCT code) FROM jav_ranking_entries) AS works`
      ),
      db.prepare(
        `SELECT list_type, section, year, COUNT(*) AS snapshots,
                SUM(item_count) AS entries, MAX(snapshot_at) AS latest_at
         FROM jav_ranking_snapshots
         GROUP BY list_type, section, year
         ORDER BY list_type ASC, section ASC, year DESC`
      ),
    ]) as unknown as [
      { results: Array<{ snapshots: number; entries: number; works: number }> },
      { results: Array<Record<string, unknown>> },
    ];

    const totals = totalRow.results?.[0];
    const channels = (channelRows.results || []).map((row) => ({
      listType: String(row.list_type),
      section: String(row.section),
      year: row.year == null ? null : Number(row.year),
      snapshots: Number(row.snapshots) || 0,
      entries: Number(row.entries) || 0,
      latestAt: Number(row.latest_at) || 0,
    }));

    const years = Array.from(
      new Set(channels.map((channel) => channel.year).filter((value): value is number => value != null))
    ).sort((a, b) => b - a);

    return {
      totals: {
        snapshots: Number(totals?.snapshots) || 0,
        entries: Number(totals?.entries) || 0,
        works: Number(totals?.works) || 0,
      },
      channels,
      years,
    };
  } catch (err) {
    console.error('[ranking-archive] meta query failed:', err);
    return { totals: { snapshots: 0, entries: 0, works: 0 }, channels: [], years: [] };
  }
}

/** 管理端快照列表：按快照时间倒序分页。 */
export async function listRankingSnapshots(
  db: D1Database,
  input: ArchiveFilterInput,
  pagination: { page: number; pageSize: number }
): Promise<{ items: RankingArchiveSnapshot[]; total: number }> {
  const { where, params } = buildFilters(input);
  try {
    const [countResult, rowsResult] = await db.batch([
      db.prepare(`SELECT COUNT(*) AS total FROM jav_ranking_snapshots s ${where}`).bind(...params),
      db
        .prepare(
          `SELECT s.snapshot_key, s.source_name, s.list_type, s.section, s.year,
                  s.snapshot_at, s.item_count
           FROM jav_ranking_snapshots s
           ${where}
           ORDER BY s.snapshot_at DESC
           LIMIT ? OFFSET ?`
        )
        .bind(
          ...params,
          pagination.pageSize,
          (pagination.page - 1) * pagination.pageSize
        ),
    ]) as unknown as [
      { results: Array<{ total: number }> },
      { results: Array<Record<string, unknown>> },
    ];

    const items = (rowsResult.results || []).map((row) => {
      const listType = String(row.list_type) as RankingListType;
      const snapshotAt = Number(row.snapshot_at) || 0;
      const cycle = rankingCycleOf(listType, snapshotAt);
      return {
        snapshotKey: String(row.snapshot_key),
        sourceName: String(row.source_name),
        listType,
        section: String(row.section),
        year: row.year == null ? null : Number(row.year),
        snapshotAt,
        itemCount: Number(row.item_count) || 0,
        cycleKey: cycle.cycleKey,
        isFinal: cycle.isFinal,
      };
    });

    return { items, total: Number(countResult.results?.[0]?.total) || 0 };
  } catch (err) {
    console.error('[ranking-archive] snapshot query failed:', err);
    return { items: [], total: 0 };
  }
}

/** 管理端名次明细：联表补全标题/封面/详情补全状态，支持番号或标题模糊搜索。 */
export async function listRankingEntries(
  db: D1Database,
  input: ArchiveFilterInput,
  pagination: { page: number; pageSize: number }
): Promise<{ items: RankingArchiveEntry[]; total: number }> {
  const { where, params } = buildFilters(input);
  const search = (input.search || '').trim();
  // 无其它筛选时 where 为空，搜索条件必须自带 WHERE，否则会拼出「... JOIN ... AND ...」的非法 SQL
  const searchWhere = search
    ? `${where ? 'AND' : 'WHERE'} (e.code LIKE ? OR COALESCE(d.title, e.title) LIKE ?)`
    : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

  try {
    const [countResult, rowsResult] = await db.batch([
      db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM jav_ranking_entries e
           JOIN jav_ranking_snapshots s ON s.snapshot_key = e.snapshot_key
           LEFT JOIN data_records d ON d.id = e.record_id
           ${where} ${searchWhere}`
        )
        .bind(...params, ...searchParams),
      db
        .prepare(
          `SELECT e.id, e.snapshot_key, e.snapshot_at, e.source_name, e.list_type,
                  e.section, e.year, e.rank, e.code,
                  COALESCE(d.title, e.title, e.code) AS title,
                  COALESCE(d.cover, e.cover) AS cover,
                  e.score, e.url, e.record_id,
                  d.detail_completed,
                  m.status AS detail_status,
                  m.missing_mask AS detail_missing_mask
           FROM jav_ranking_entries e
           JOIN jav_ranking_snapshots s ON s.snapshot_key = e.snapshot_key
           LEFT JOIN data_records d ON d.id = e.record_id
           LEFT JOIN jav_detail_meta m ON m.record_id = e.record_id
           ${where} ${searchWhere}
           ORDER BY e.snapshot_at DESC, e.rank ASC
           LIMIT ? OFFSET ?`
        )
        .bind(
          ...params,
          ...searchParams,
          pagination.pageSize,
          (pagination.page - 1) * pagination.pageSize
        ),
    ]) as unknown as [
      { results: Array<{ total: number }> },
      { results: Array<Record<string, unknown>> },
    ];

    const items = (rowsResult.results || []).map((row) => {
      const listType = String(row.list_type) as RankingListType;
      const snapshotAt = Number(row.snapshot_at) || 0;
      const cycle = rankingCycleOf(listType, snapshotAt);
      return {
        id: String(row.id),
        snapshotKey: String(row.snapshot_key),
        snapshotAt,
        sourceName: String(row.source_name),
        listType,
        section: String(row.section),
        year: row.year == null ? null : Number(row.year),
        rank: Number(row.rank) || 0,
        code: String(row.code),
        title: String(row.title || row.code),
        cover: (row.cover as string | null) ?? null,
        score: (row.score as string | null) ?? null,
        url: (row.url as string | null) ?? null,
        recordId: (row.record_id as string | null) ?? null,
        detailCompleted: Number(row.detail_completed) === 1,
        detailStatus: (row.detail_status as string | null) ?? null,
        detailMissing: missingFieldsFromMask(Number(row.detail_missing_mask ?? 0)),
        cycleKey: cycle.cycleKey,
        isFinal: cycle.isFinal,
      };
    });

    return { items, total: Number(countResult.results?.[0]?.total) || 0 };
  } catch (err) {
    console.error('[ranking-archive] entry query failed:', err);
    return { items: [], total: 0 };
  }
}
