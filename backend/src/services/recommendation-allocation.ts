/**
 * 推荐位分配
 *
 * 目标：不让一个标签/演员独占所有推荐位。
 * 纯函数，不碰数据库；随机抽取在每次请求时执行。
 */
import type { JavRecommendationItem } from '@/types';
import { normalizeJavCode, valueKey } from './recommendation-utils';

export interface ScoredItem {
  item: Omit<JavRecommendationItem, 'score' | 'reason'>;
  score: number;
  reason: JavRecommendationItem['reason'];
}

interface Bucket {
  reason: JavRecommendationItem['reason'];
  pool: ScoredItem[];
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function itemHasValue(
  item: ScoredItem['item'],
  field: 'actors' | 'tags',
  value: string
): boolean {
  const key = valueKey(value);
  return (item[field] || []).some((candidate) => valueKey(candidate) === key);
}

function buildTagBuckets(tags: string[], scored: ScoredItem[]): Bucket[] {
  return tags
    .map((tag) => ({
      reason: { type: 'tag' as const, value: tag },
      pool: scored.filter((entry) => itemHasValue(entry.item, 'tags', tag)),
    }))
    .filter((bucket) => bucket.pool.length > 0);
}

function buildActorBuckets(actors: string[], scored: ScoredItem[]): Bucket[] {
  return actors
    .map((actor) => ({
      reason: { type: 'actor' as const, value: actor },
      pool: scored.filter((entry) => itemHasValue(entry.item, 'actors', actor)),
    }))
    .filter((bucket) => bucket.pool.length > 0);
}

/**
 * 在多个桶之间轮转取数，保证每个标签/演员都有名额。
 * 桶顺序和桶内顺序都随机；先满足 quota，不足由调用方从全局池补。
 */
function allocateFromBuckets(
  buckets: Bucket[],
  quota: number,
  excluded: Set<string>,
  pickedCodes: Set<string>
): ScoredItem[] {
  if (quota <= 0 || buckets.length === 0) return [];

  const pools = shuffle(buckets).map((bucket) => ({
    reason: bucket.reason,
    pool: shuffle(bucket.pool),
  }));
  const picked: ScoredItem[] = [];
  let added = true;

  while (picked.length < quota && added) {
    added = false;
    for (const bucket of pools) {
      while (bucket.pool.length > 0) {
        const entry = bucket.pool.shift();
        if (!entry) break;
        const code = normalizeJavCode(entry.item.code);
        if (excluded.has(code) || pickedCodes.has(code)) continue;

        picked.push({ ...entry, reason: bucket.reason });
        pickedCodes.add(code);
        added = true;
        break;
      }
      if (picked.length >= quota) break;
    }
  }

  return picked;
}

function fillFromScored(
  picked: ScoredItem[],
  scored: ScoredItem[],
  target: number,
  excluded: Set<string>,
  pickedCodes: Set<string>
): void {
  // 只在前 100 个高分候选里随机补位：既保留相关性，又不会每次补同一批
  const pool = shuffle(scored.slice(0, Math.min(100, scored.length)));
  for (const entry of pool) {
    if (picked.length >= target) break;
    const code = normalizeJavCode(entry.item.code);
    if (excluded.has(code) || pickedCodes.has(code)) continue;
    picked.push(entry);
    pickedCodes.add(code);
  }
}

function countReasonType(picked: ScoredItem[], type: 'actor' | 'tag'): number {
  return picked.filter((entry) => entry.reason.type === type).length;
}

function toRecommendationItems(entries: ScoredItem[]): JavRecommendationItem[] {
  return entries.map((entry) => ({
    ...entry.item,
    score: entry.score,
    reason: entry.reason,
  }));
}

/**
 * 为你推荐：前 5 个标签占 6 个位置，前 2 个演员占 6 个位置。
 * top 2 演员不足 6 部时，从 top 3-10 演员继续补演员位；
 * top 5 标签不足 6 部时，从 top 6-15 标签继续补标签位。
 * 每个标签/演员内部随机抽取，最终打乱顺序。
 */
export function allocateForYouItems(
  scored: ScoredItem[],
  topTags: string[],
  topActors: string[],
  excluded: Set<string>,
  limit: number
): JavRecommendationItem[] {
  const tagPrimary = buildTagBuckets(topTags.slice(0, 5), scored);
  const tagSecondary = buildTagBuckets(topTags.slice(5, 15), scored);
  const actorPrimary = buildActorBuckets(topActors.slice(0, 2), scored);
  const actorSecondary = buildActorBuckets(topActors.slice(2, 10), scored);

  const hasTags = tagPrimary.length > 0 || tagSecondary.length > 0;
  const hasActors = actorPrimary.length > 0 || actorSecondary.length > 0;

  const tagQuota = hasTags ? Math.min(6, limit) : 0;
  const actorQuota = hasActors
    ? (hasTags ? Math.min(6, limit - tagQuota) : limit)
    : 0;

  const picked: ScoredItem[] = [];
  const pickedCodes = new Set<string>();

  if (tagQuota > 0) {
    picked.push(...allocateFromBuckets(tagPrimary, tagQuota, excluded, pickedCodes));
  }
  if (actorQuota > 0) {
    picked.push(...allocateFromBuckets(actorPrimary, actorQuota, excluded, pickedCodes));
  }

  // 演员位不足时，先用其他演员补，避免全被标签补位占满
  const actorCount = countReasonType(picked, 'actor');
  if (actorQuota > actorCount && actorSecondary.length > 0) {
    picked.push(
      ...allocateFromBuckets(actorSecondary, actorQuota - actorCount, excluded, pickedCodes)
    );
  }

  const tagCount = countReasonType(picked, 'tag');
  if (tagQuota > tagCount && tagSecondary.length > 0) {
    picked.push(
      ...allocateFromBuckets(tagSecondary, tagQuota - tagCount, excluded, pickedCodes)
    );
  }

  fillFromScored(picked, scored, limit, excluded, pickedCodes);
  return toRecommendationItems(shuffle(picked).slice(0, limit));
}

/**
 * 相关推荐：演员与作品标签各占一半位置，标签桶轮转分配，
 * 5 个标签抢 4 个位置时随机选 4 个标签，不会一个标签独占。
 */
export function allocateRelatedItems(
  scored: ScoredItem[],
  actors: string[],
  tags: string[],
  excluded: Set<string>,
  limit: number
): JavRecommendationItem[] {
  const actorBuckets = buildActorBuckets(actors, scored);
  const tagBuckets = buildTagBuckets(tags, scored);

  let actorQuota = 0;
  let tagQuota = 0;
  if (actorBuckets.length > 0 && tagBuckets.length > 0) {
    actorQuota = Math.floor(limit / 2);
    tagQuota = limit - actorQuota;
  } else if (actorBuckets.length > 0) {
    actorQuota = limit;
  } else if (tagBuckets.length > 0) {
    tagQuota = limit;
  }

  const picked: ScoredItem[] = [];
  const pickedCodes = new Set<string>();

  if (actorQuota > 0) {
    picked.push(...allocateFromBuckets(actorBuckets, actorQuota, excluded, pickedCodes));
  }
  if (tagQuota > 0) {
    picked.push(...allocateFromBuckets(tagBuckets, tagQuota, excluded, pickedCodes));
  }

  fillFromScored(picked, scored, limit, excluded, pickedCodes);
  return toRecommendationItems(shuffle(picked).slice(0, limit));
}
