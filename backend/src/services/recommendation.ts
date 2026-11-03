/**
 * JAV 推荐引擎
 *
 * 只做"相关度"：演员 50% / 标签 40% / 发行商 10%。
 * 不做人气加权、不乘榜单名次；热门列表由 services/hot-list.ts 独立负责。
 */
import { RECOMMEND } from '@/constants';
import type { JavRecommendationItem, JavRecommendationResponse } from '@/types';
import {
  countUserJavHistory,
  findJavCandidatesBySeeds,
  getJavRecordByCode,
  getUserFavoriteCodes,
  getUserFavoriteRows,
  getUserJavHistoryRows,
  type JavRecordRow,
} from '@/repositories/recommendation-repository';
import {
  cleanSeedValues,
  getCachedJson,
  hashString,
  isJavWorkCode,
  normalizeJavCode,
  parseValueList,
  putCachedJson,
  recordToRecommendationItem,
  valueKey,
} from './recommendation-utils';
import {
  filterDiscriminatingTags,
  getTagFrequency,
  isIgnoredTagKey,
} from './tag-frequency';

// ─── 类型 ──────────────────────────────────────────────────────────────

interface DimensionData {
  /** 小写 key → 归一化权重 */
  weights: Record<string, number>;
  /** 小写 key → 展示值 */
  display: Record<string, string>;
}

export interface UserProfile {
  actor: DimensionData;
  tag: DimensionData;
  publisher: DimensionData;
  javFavorites: number;
  javHistory: number;
  isNewUser: boolean;
  hasSignal: boolean;
  topActors: string[];
  topTags: string[];
  topPublishers: string[];
}

interface DimensionCollector {
  values: Map<string, { display: string; count: number }>;
}

interface ScoredItem {
  item: Omit<JavRecommendationItem, 'score' | 'reason'>;
  score: number;
  reason: JavRecommendationItem['reason'];
}

export interface RelatedInput {
  code?: string;
  actress?: string;
  actors?: string[];
  tags?: string[];
  publisher?: string;
  excludeCodes?: string[];
  limit?: number;
}

// ─── 维度收集 / 归一化 ────────────────────────────────────────────────

function createCollector(): DimensionCollector {
  return { values: new Map() };
}

function addValue(collector: DimensionCollector, value: string, amount: number): void {
  const key = valueKey(value);
  if (!key) return;
  const existing = collector.values.get(key);
  if (existing) {
    existing.count += amount;
  } else {
    collector.values.set(key, { display: value.trim(), count: amount });
  }
}

function addValues(collector: DimensionCollector, raw: string | null, amount: number): void {
  for (const value of parseValueList(raw)) {
    addValue(collector, value, amount);
  }
}

function finalizeDimension(collector: DimensionCollector): DimensionData {
  const entries = Array.from(collector.values.entries());
  const total = entries.reduce((sum, [, v]) => sum + Math.max(0, v.count), 0);
  if (total <= 0) return { weights: {}, display: {} };

  const weights: Record<string, number> = {};
  const display: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value.count <= 0) continue;
    weights[key] = value.count / total;
    display[key] = value.display;
  }
  return { weights, display };
}

function topValues(dim: DimensionData, limit: number): string[] {
  return Object.entries(dim.weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => dim.display[key] || key);
}

// ─── 画像 ──────────────────────────────────────────────────────────────

export async function getUserProfile(
  db: D1Database,
  userId: string
): Promise<UserProfile> {
  const cacheKey = `profile-v2/${userId}`;
  const cached = await getCachedJson<UserProfile>(cacheKey);
  if (cached) return cached;

  const profile = await buildUserProfile(db, userId);
  await putCachedJson(cacheKey, profile, RECOMMEND.PROFILE_CACHE_TTL);
  return profile;
}

async function buildUserProfile(db: D1Database, userId: string): Promise<UserProfile> {
  const [favorites, history, javHistory, tagFrequency] = await Promise.all([
    getUserFavoriteRows(db, userId),
    getUserJavHistoryRows(db, userId),
    countUserJavHistory(db, userId),
    getTagFrequency(db),
  ]);

  const actor = createCollector();
  const tag = createCollector();
  const publisher = createCollector();
  let javFavorites = 0;

  for (const row of favorites) {
    const code = row.code || '';
    if (isJavWorkCode(code)) {
      javFavorites += 1;
      addValues(actor, row.actors, RECOMMEND.FAVORITE_WEIGHT);
      addValues(tag, row.tags, RECOMMEND.FAVORITE_WEIGHT);
      if (row.publisher) addValue(publisher, row.publisher, RECOMMEND.FAVORITE_WEIGHT);
    } else if (code.startsWith('actress:')) {
      // 女优收藏：只贡献演员信号
      javFavorites += 1;
      addValues(actor, row.actors, RECOMMEND.FAVORITE_WEIGHT);
    }
  }

  // 历史信号：同一演员/标签/发行商出现 ≥3 次才计入，每次 +1
  const historyActor = new Map<string, { display: string; count: number }>();
  const historyTag = new Map<string, { display: string; count: number }>();
  const historyPublisher = new Map<string, { display: string; count: number }>();

  const countHistoryValues = (
    map: Map<string, { display: string; count: number }>,
    raw: string | null
  ) => {
    for (const value of parseValueList(raw)) {
      const key = valueKey(value);
      if (!key) continue;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { display: value.trim(), count: 1 });
    }
  };

  for (const row of history) {
    countHistoryValues(historyActor, row.actors);
    countHistoryValues(historyTag, row.tags);
    if (row.publisher) countHistoryValues(historyPublisher, row.publisher);
  }

  for (const [key, value] of historyActor) {
    if (value.count >= RECOMMEND.HISTORY_MIN_OCCURRENCES) {
      const existing = actor.values.get(key);
      if (existing) existing.count += value.count * RECOMMEND.HISTORY_WEIGHT;
      else actor.values.set(key, { display: value.display, count: value.count * RECOMMEND.HISTORY_WEIGHT });
    }
  }
  for (const [key, value] of historyTag) {
    if (value.count >= RECOMMEND.HISTORY_MIN_OCCURRENCES) {
      const existing = tag.values.get(key);
      if (existing) existing.count += value.count * RECOMMEND.HISTORY_WEIGHT;
      else tag.values.set(key, { display: value.display, count: value.count * RECOMMEND.HISTORY_WEIGHT });
    }
  }
  for (const [key, value] of historyPublisher) {
    if (value.count >= RECOMMEND.HISTORY_MIN_OCCURRENCES) {
      const existing = publisher.values.get(key);
      if (existing) existing.count += value.count * RECOMMEND.HISTORY_WEIGHT;
      else publisher.values.set(key, { display: value.display, count: value.count * RECOMMEND.HISTORY_WEIGHT });
    }
  }

  // 大众/技术标签不参与推荐：直接剔除，而不是降权；剩余标签仍按命中数排序
  for (const key of Array.from(tag.values.keys())) {
    if (isIgnoredTagKey(key, tagFrequency)) {
      tag.values.delete(key);
    }
  }

  const actorDim = finalizeDimension(actor);
  const tagDim = finalizeDimension(tag);
  const publisherDim = finalizeDimension(publisher);
  const hasSignal =
    Object.keys(actorDim.weights).length > 0 ||
    Object.keys(tagDim.weights).length > 0 ||
    Object.keys(publisherDim.weights).length > 0;

  return {
    actor: actorDim,
    tag: tagDim,
    publisher: publisherDim,
    javFavorites,
    javHistory,
    isNewUser: javFavorites === 0 && javHistory < RECOMMEND.NEW_USER_MAX_HISTORY,
    hasSignal,
    topActors: topValues(actorDim, 10),
    topTags: topValues(tagDim, 15),
    topPublishers: topValues(publisherDim, 3),
  };
}

// ─── 打分 ──────────────────────────────────────────────────────────────

function seedWeights(
  actors: string[],
  tags: string[],
  publisher?: string
): Pick<UserProfile, 'actor' | 'tag' | 'publisher'> {
  const make = (values: string[]): DimensionData => {
    const weights: Record<string, number> = {};
    const display: Record<string, string> = {};
    const unique = Array.from(new Map(values.map((v) => [valueKey(v), v])).entries())
      .filter(([key]) => Boolean(key));
    if (unique.length === 0) return { weights, display };
    const each = 1 / unique.length;
    for (const [key, value] of unique) {
      weights[key] = each;
      display[key] = value;
    }
    return { weights, display };
  };

  return {
    actor: make(actors),
    tag: make(tags),
    publisher: publisher
      ? { weights: { [valueKey(publisher)]: 1 }, display: { [valueKey(publisher)]: publisher } }
      : { weights: {}, display: {} },
  };
}

function scoreRow(
  row: JavRecordRow,
  dims: Pick<UserProfile, 'actor' | 'tag' | 'publisher'>
): ScoredItem | null {
  const item = recordToRecommendationItem(row);
  let weighted = 0;
  let baseSum = 0;
  let bestContribution = 0;
  let reason: JavRecommendationItem['reason'] | null = null;

  const applyDimension = (
    type: 'actor' | 'tag' | 'publisher',
    candidateValues: string[],
    dim: DimensionData
  ) => {
    if (candidateValues.length === 0) return;
    if (Object.keys(dim.weights).length === 0) return;

    const base = RECOMMEND.DIM_WEIGHTS[type];
    baseSum += base;

    let sim = 0;
    for (const value of candidateValues) {
      const key = valueKey(value);
      const weight = dim.weights[key];
      if (!weight) continue;
      sim += weight;
      if (base * weight > bestContribution) {
        bestContribution = base * weight;
        reason = { type, value };
      }
    }
    weighted += base * Math.min(1, sim);
  };

  applyDimension('actor', item.actors || [], dims.actor);
  applyDimension('tag', item.tags || [], dims.tag);
  applyDimension('publisher', item.publisher ? [item.publisher] : [], dims.publisher);

  if (baseSum === 0) return null;
  const score = weighted / baseSum;
  if (score <= 0) return null;

  return {
    item,
    score: Number(score.toFixed(4)),
    reason: reason || { type: 'actor' },
  };
}

function selectItems(
  scored: ScoredItem[],
  limit: number,
  excluded: Set<string>
): JavRecommendationItem[] {
  const primaryCount = new Map<string, number>();
  const picked: ScoredItem[] = [];
  const deferred: ScoredItem[] = [];

  for (const entry of scored) {
    if (excluded.has(normalizeJavCode(entry.item.code))) continue;
    const primary = entry.item.actors?.[0];
    const key = primary ? valueKey(primary) : '';
    const count = key ? primaryCount.get(key) || 0 : 0;
    if (key && count >= RECOMMEND.MAX_ITEMS_PER_ACTOR) {
      deferred.push(entry);
      continue;
    }
    if (key) primaryCount.set(key, count + 1);
    picked.push(entry);
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    for (const entry of deferred) {
      if (picked.length >= limit) break;
      if (excluded.has(normalizeJavCode(entry.item.code))) continue;
      picked.push(entry);
    }
  }

  return picked.map((entry) => ({
    ...entry.item,
    score: entry.score,
    reason: entry.reason,
  }));
}

// ─── 相关推荐 ──────────────────────────────────────────────────────────

export async function recommendRelated(
  db: D1Database,
  userId: string,
  input: RelatedInput
): Promise<JavRecommendationResponse> {
  const code = input.code ? normalizeJavCode(input.code) : '';
  const record = code && isJavWorkCode(code) ? await getJavRecordByCode(db, code) : null;

  const dbActors = record ? parseValueList(record.actors) : [];
  const dbTags = record ? parseValueList(record.tags) : [];
  const actors = cleanSeedValues(dbActors.length > 0 ? dbActors : input.actors, 10);
  const rawTags = cleanSeedValues(dbTags.length > 0 ? dbTags : input.tags, 20);
  const tagFrequency = rawTags.length > 0 ? await getTagFrequency(db) : null;
  const tags = tagFrequency ? filterDiscriminatingTags(rawTags, tagFrequency) : rawTags;
  const publisher = (record?.publisher || input.publisher || '').trim().slice(0, 100);
  const actress = cleanSeedValues(input.actress ? [input.actress] : [], 1);
  if (actress.length > 0) {
    actors.unshift(actress[0]);
  }

  const cleanedActors = dedupeStrings(actors).slice(0, 10);
  if (cleanedActors.length === 0 && tags.length === 0 && !publisher) {
    return {
      mode: 'related',
      isNewUser: false,
      items: [],
      generatedAt: Date.now(),
    };
  }

  const favoriteCodes = await getUserFavoriteCodes(db, userId);
  const excluded = new Set<string>();
  for (const item of favoriteCodes) excluded.add(normalizeJavCode(item));
  for (const item of input.excludeCodes || []) excluded.add(normalizeJavCode(item));
  if (code) excluded.add(code);

  const dims = seedWeights(cleanedActors, tags, publisher || undefined);
  const cacheKey = `related-v2/${hashString(
    JSON.stringify({ actors: cleanedActors, tags, publisher })
  )}`;

  let scored = await getCachedJson<ScoredItem[]>(cacheKey);
  if (!scored) {
    const candidates = await findJavCandidatesBySeeds(
      db,
      { actors: cleanedActors, tags, publisher: publisher || undefined },
      RECOMMEND.CANDIDATE_LIMIT
    );
    scored = candidates
      .map((row) => scoreRow(row, dims))
      .filter((entry): entry is ScoredItem => entry !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    await putCachedJson(cacheKey, scored, RECOMMEND.RELATED_CACHE_TTL);
  }

  const limit = Math.min(
    Math.max(1, input.limit || RECOMMEND.RELATED_LIMIT),
    RECOMMEND.RELATED_LIMIT
  );

  return {
    mode: 'related',
    isNewUser: false,
    items: selectItems(scored, limit, excluded),
    basis: { actors: cleanedActors.slice(0, 3), tags: tags.slice(0, 3) },
    generatedAt: Date.now(),
  };
}

// ─── 为你推荐 ──────────────────────────────────────────────────────────

/**
 * 画像命中为空时返回 null，由路由层回退到独立热门列表。
 */
export async function recommendForYou(
  db: D1Database,
  userId: string,
  profile: UserProfile
): Promise<JavRecommendationResponse | null> {
  if (profile.isNewUser || !profile.hasSignal) return null;

  const favoriteCodes = await getUserFavoriteCodes(db, userId);
  const excluded = new Set(favoriteCodes.map((item) => normalizeJavCode(item)));

  const candidates = await findJavCandidatesBySeeds(
    db,
    {
      actors: profile.topActors.slice(0, 10),
      tags: profile.topTags.slice(0, 15),
      publisher: profile.topPublishers[0],
    },
    RECOMMEND.CANDIDATE_LIMIT
  );

  const scored = candidates
    .map((row) => scoreRow(row, profile))
    .filter((entry): entry is ScoredItem => entry !== null)
    .sort((a, b) => b.score - a.score);

  const items = selectItems(scored, RECOMMEND.FOR_YOU_LIMIT, excluded);
  if (items.length === 0) return null;

  return {
    mode: 'for-you',
    isNewUser: false,
    items,
    basis: {
      actors: profile.topActors.slice(0, 3),
      tags: profile.topTags.slice(0, 3),
    },
    generatedAt: Date.now(),
  };
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = valueKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
