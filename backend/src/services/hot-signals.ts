/**
 * 站内热度信号
 *
 * 从收藏/搜索历史计算近 N 天去重用户数，供“热门推荐”和“热门女优榜”共用。
 * 只统计被不同用户重复交互的值，避免单用户刷高。
 */
import { RECOMMEND } from '@/constants';
import {
  getInternalSignalRows,
  type SignalRow,
} from '@/repositories/recommendation-repository';
import {
  getCachedJson,
  isJavWorkCode,
  normalizeJavCode,
  parseValueList,
  putCachedJson,
  valueKey,
} from './recommendation-utils';
import { isTechnicalTagKey } from './tag-filter';

export interface HotSignals {
  /** 番号 → 近 30 天互动去重用户数 */
  codeUsers: Record<string, number>;
  /** 演员小写 key → 去重用户数 */
  actorUsers: Record<string, number>;
  /** 标签小写 key → 去重用户数 */
  tagUsers: Record<string, number>;
  topActors: string[];
  topTags: string[];
}

interface UserSetValue {
  display: string;
  users: Set<string>;
}

const SIGNALS_CACHE_KEY = 'signals-v5';

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

  // 关注女优计入演员热度（取代原先"女优收藏"提供的信号）；按用户去重，和收藏/历史不会重复计数
  const follows = await db
    .prepare(
      `SELECT f.user_id AS user_id, t.name AS name
       FROM user_follows f JOIN follow_targets t ON t.watch_key = f.watch_key
       WHERE t.entity_type = 'actress'`
    )
    .all<{ user_id: string; name: string }>();
  for (const row of follows.results || []) addNamed(actorUsers, row.name, row.user_id);

  const codeCounts: Record<string, number> = {};
  for (const [code, users] of codeUsers) codeCounts[code] = users.size;

  const actorCounts: Record<string, number> = {};
  for (const [key, value] of actorUsers) actorCounts[key] = value.users.size;

  const tagCounts: Record<string, number> = {};
  for (const [key, value] of tagUsers) {
    if (!isTechnicalTagKey(key)) {
      tagCounts[key] = value.users.size;
    }
  }

  const topActors = Array.from(actorUsers.entries())
    .filter(([, value]) => value.users.size >= 2)
    .sort((a, b) => b[1].users.size - a[1].users.size)
    .slice(0, 10)
    .map(([, value]) => value.display);

  const topTags = Array.from(tagUsers.entries())
    .filter(([key, value]) => value.users.size >= 2 && !isTechnicalTagKey(key))
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
