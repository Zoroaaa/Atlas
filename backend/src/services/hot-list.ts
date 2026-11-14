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
  getJavRecordsByCodes,
  getRecentJavRecords,
  getUserFavoriteCodes,
  type JavRecordRow,
} from '@/repositories/recommendation-repository';
import {
  normalizeJavCode,
  recordToRecommendationItem,
  valueKey,
} from './recommendation-utils';
import { getHotSignals, type HotSignals } from './hot-signals';
import { getLatestRankingRecords, type RankingRecord } from './ranking-snapshot';

// ─── 热门列表 ──────────────────────────────────────────────────────────

const RANKING_CACHE_KEY = 'https://internal/recommend-ranking-records-v1';
const RANKING_CACHE_TTL_SECONDS = 300;

/**
 * 榜单快照缓存：取「每期最新一批」要全量扫 data_record_sources，
 * 但榜单每期只更新一次，没必要每次推荐请求都扫一遍。
 *
 * 只缓存全局榜单数据（固定 key，与用户无关）；按用户排除已收藏的逻辑
 * 仍在上层用 userId 计算，缓存内容不含任何用户维度数据。
 */
async function getCachedRankingRecords(db: D1Database): Promise<RankingRecord[]> {
  if (typeof caches === 'undefined') return getLatestRankingRecords(db);
  const cache = caches.default;
  const key = new Request(RANKING_CACHE_KEY);
  try {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as RankingRecord[];
  } catch {
    // 缓存读失败：直接查库
  }
  const fresh = await getLatestRankingRecords(db);
  try {
    await cache.put(
      key,
      new Response(JSON.stringify(fresh), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${RANKING_CACHE_TTL_SECONDS}`,
        },
      })
    );
  } catch {
    // 缓存写失败不影响返回
  }
  return fresh;
}

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
  const [signals, rankingRecords, favoriteCodes] = await Promise.all([
    getHotSignals(db),
    getCachedRankingRecords(db),
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

  // 1. 榜单作品：周榜优先、月榜补充；同番号去重
  const rankingFreshSince = Date.now() - RECOMMEND.RANKING_FRESH_DAYS * 24 * 60 * 60 * 1000;
  const seenRankingCodes = new Set<string>();
  for (const entry of rankingRecords) {
    if (selected.length >= limit) break;
    if (entry.fetchedAt < rankingFreshSince) continue;
    const code = normalizeJavCode(entry.row.code);
    if (!code || seenRankingCodes.has(code)) continue;
    seenRankingCodes.add(code);
    pushItem(
      recordToRecommendationItem(entry.row),
      { type: 'ranking', period: entry.period },
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
