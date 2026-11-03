/**
 * 独立热门列表
 *
 * 只服务新用户（以及"为你推荐"无命中时的回退），不使用相关度打分。
 * 数据优先级：近期榜单 rank → 站内热作品 → 热演员/标签命中 → 最近入库。
 */
import { RECOMMEND } from '@/constants';
import type { JavRecommendationItem, JavRecommendationResponse } from '@/types';
import {
  findJavCandidatesBySeeds,
  getInternalSignalRows,
  getJavRecordsByCodes,
  getRankingRows,
  getRecentJavRecords,
  getUserFavoriteCodes,
  type JavRecordRow,
  type RankingRow,
  type SignalRow,
} from '@/repositories/recommendation-repository';
import {
  getCachedJson,
  isJavWorkCode,
  normalizeJavCode,
  parseValueList,
  putCachedJson,
  recordToRecommendationItem,
  valueKey,
} from './recommendation-utils';
import {
  getTagFrequency,
  isIgnoredTagKey,
} from './tag-frequency';

interface HotSignals {
  /** 番号 → 近 30 天互动去重用户数 */
  codeUsers: Record<string, number>;
  /** 演员小写 key → 去重用户数 */
  actorUsers: Record<string, number>;
  /** 标签小写 key → 去重用户数 */
  tagUsers: Record<string, number>;
  topActors: string[];
  topTags: string[];
}

interface RankedEntry {
  code: string;
  rank: number;
  fetchedAt: number;
  row: RankingRow;
}

interface UserSetValue {
  display: string;
  users: Set<string>;
}

const SIGNALS_CACHE_KEY = 'signals-v2';

// ─── 站内热度 ──────────────────────────────────────────────────────────

export async function getHotSignals(db: D1Database): Promise<HotSignals> {
  const cached = await getCachedJson<HotSignals>(SIGNALS_CACHE_KEY);
  if (cached) return cached;

  const since = Date.now() - RECOMMEND.POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const { favorites, history } = await getInternalSignalRows(db, since);

  const codeUsers = new Map<string, Set<string>>();
  const actorUsers = new Map<string, UserSetValue>();
  const tagUsers = new Map<string, UserSetValue>();

  const addCode = (code: string, userId: string) => {
    if (!isJavWorkCode(code)) return;
    const normalized = normalizeJavCode(code);
    const set = codeUsers.get(normalized) || new Set<string>();
    set.add(userId);
    codeUsers.set(normalized, set);
  };

  const addNamed = (
    map: Map<string, UserSetValue>,
    value: string,
    userId: string
  ) => {
    const key = valueKey(value);
    if (!key) return;
    const existing = map.get(key);
    if (existing) existing.users.add(userId);
    else map.set(key, { display: value.trim(), users: new Set([userId]) });
  };

  const processRow = (row: SignalRow) => {
    const code = row.code || row.query || '';
    addCode(code, row.user_id);
    for (const actor of parseValueList(row.actors)) {
      addNamed(actorUsers, actor, row.user_id);
    }
    for (const tag of parseValueList(row.tags)) {
      addNamed(tagUsers, tag, row.user_id);
    }
  };

  for (const row of favorites) processRow(row);
  for (const row of history) processRow(row);

  const codeCounts: Record<string, number> = {};
  for (const [code, users] of codeUsers) codeCounts[code] = users.size;

  const actorCounts: Record<string, number> = {};
  for (const [key, value] of actorUsers) actorCounts[key] = value.users.size;

  const tagFrequency = await getTagFrequency(db);
  const tagCounts: Record<string, number> = {};
  for (const [key, value] of tagUsers) {
    if (!isIgnoredTagKey(key, tagFrequency)) {
      tagCounts[key] = value.users.size;
    }
  }

  const topActors = Array.from(actorUsers.entries())
    .filter(([, value]) => value.users.size >= 2)
    .sort((a, b) => b[1].users.size - a[1].users.size)
    .slice(0, 10)
    .map(([, value]) => value.display);

  const topTags = Array.from(tagUsers.entries())
    .filter(([key, value]) => value.users.size >= 2 && !isIgnoredTagKey(key, tagFrequency))
    .sort((a, b) => b[1].users.size - a[1].users.size)
    .slice(0, 10)
    .map(([, value]) => value.display);

  const signals: HotSignals = {
    codeUsers: codeCounts,
    actorUsers: actorCounts,
    tagUsers: tagCounts,
    topActors,
    topTags,
  };

  await putCachedJson(SIGNALS_CACHE_KEY, signals, RECOMMEND.SIGNALS_CACHE_TTL);
  return signals;
}

// ─── 榜单行 ────────────────────────────────────────────────────────────

function parseRankingRows(rows: RankingRow[]): RankedEntry[] {
  const since = Date.now() - RECOMMEND.RANKING_FRESH_DAYS * 24 * 60 * 60 * 1000;
  const byCode = new Map<string, RankedEntry>();

  for (const row of rows) {
    if (!isJavWorkCode(row.code)) continue;

    let data: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.source_data || '{}');
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
    } catch {
      // 忽略坏数据
    }

    const fetchedAt = Number(data.fetchedAt ?? row.created_at) || 0;
    if (fetchedAt < since) continue;

    const rank = Math.max(1, Number(data.rank) || 999);
    const existing = byCode.get(row.code);
    if (!existing || rank < existing.rank) {
      byCode.set(row.code, { code: row.code, rank, fetchedAt, row });
    }
  }

  return Array.from(byCode.values()).sort((a, b) => a.rank - b.rank);
}

// ─── 热门列表 ──────────────────────────────────────────────────────────

function heatOf(row: JavRecordRow, signals: HotSignals): number {
  const item = recordToRecommendationItem(row);
  let heat = (signals.codeUsers[item.code] || 0) * 3;
  for (const actor of item.actors || []) {
    heat += signals.actorUsers[valueKey(actor)] || 0;
  }
  for (const tag of item.tags || []) {
    heat += signals.tagUsers[valueKey(tag)] || 0;
  }
  return heat;
}

export async function recommendPopular(
  db: D1Database,
  userId: string,
  isNewUser: boolean
): Promise<JavRecommendationResponse> {
  const limit = RECOMMEND.HOT_LIMIT;
  const [signals, rankingRows, favoriteCodes] = await Promise.all([
    getHotSignals(db),
    getRankingRows(db),
    getUserFavoriteCodes(db, userId),
  ]);

  const excluded = new Set(favoriteCodes.map((code) => normalizeJavCode(code)));
  const selected: JavRecommendationItem[] = [];
  const selectedCodes = new Set<string>();

  const pushItem = (
    item: Omit<JavRecommendationItem, 'score' | 'reason'>,
    reason: JavRecommendationItem['reason'],
    rank?: number
  ) => {
    if (selected.length >= limit) return;
    const code = normalizeJavCode(item.code);
    if (!code || selectedCodes.has(code) || excluded.has(code)) return;
    selectedCodes.add(code);
    selected.push({
      ...item,
      reason,
      ...(rank ? { rank } : {}),
    });
  };

  // 1. 榜单作品
  for (const entry of parseRankingRows(rankingRows)) {
    if (selected.length >= limit) break;
    pushItem(
      recordToRecommendationItem(entry.row),
      { type: 'ranking' },
      entry.rank
    );
  }

  // 2. 站内热作品
  const hotCodes = Object.entries(signals.codeUsers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([code]) => code);
  if (hotCodes.length > 0) {
    const rows = await getJavRecordsByCodes(db, hotCodes);
    const byCode = new Map(rows.map((row) => [row.code, row]));
    for (const code of hotCodes) {
      if (selected.length >= limit) break;
      const row = byCode.get(code);
      if (!row) continue;
      pushItem(recordToRecommendationItem(row), { type: 'popular' });
    }
  }

  // 3. 热演员/标签命中的作品
  if (selected.length < limit && (signals.topActors.length > 0 || signals.topTags.length > 0)) {
    const candidates = await findJavCandidatesBySeeds(
      db,
      { actors: signals.topActors, tags: signals.topTags },
      200
    );
    const ranked = candidates
      .map((row) => ({ row, heat: heatOf(row, signals) }))
      .sort((a, b) => b.heat - a.heat);
    for (const entry of ranked) {
      if (selected.length >= limit) break;
      pushItem(recordToRecommendationItem(entry.row), { type: 'popular' });
    }
  }

  // 4. 最近入库兜底
  if (selected.length < limit) {
    const recent = await getRecentJavRecords(db, limit * 2);
    for (const row of recent) {
      if (selected.length >= limit) break;
      pushItem(recordToRecommendationItem(row), { type: 'popular' });
    }
  }

  return {
    mode: 'popular',
    isNewUser,
    items: selected,
    basis: {
      actors: signals.topActors.slice(0, 3),
      tags: signals.topTags.slice(0, 3),
    },
    generatedAt: Date.now(),
  };
}
