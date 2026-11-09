/**
 * 推荐标签选择
 *
 * 口径（与方案一致）：
 * - 只统计可识别为 JAV 作品的番号；同一番号在收藏/历史中重复出现只算 1 部
 * - 剔除技术/发行属性标签（tag-filter）
 * - 分母是"含至少 1 个内容标签的作品数"，不是记录数或标签总数
 * - 收藏权重 0.7、历史权重 0.3（只有一个来源时该来源权重 1）
 * - 不足 10 个时从词典中随机补满；两来源都无标签时等价新用户，全随机
 */
import { GENRE_REC } from '@/constants';
import {
  getGenreFavoriteSignals,
  getGenreHistorySignals,
  getUsableGenres,
  type GenreRow,
  type GenreSignalRow,
} from '@/repositories/genre-repository';
import {
  getCachedJson,
  isJavWorkCode,
  normalizeJavCode,
  parseValueList,
  putCachedJson,
  valueKey,
} from './recommendation-utils';
import { filterContentTags } from './tag-filter';

export interface GenreRecTag {
  key: string;
  name: string;
  section: 'censored' | 'uncensored';
  source: 'personal' | 'random';
  score: number;
}

export interface GenreCoverage {
  favorites: number;
  favoritesWithTags: number;
  history: number;
  historyWithTags: number;
}

export interface GenreRecommendationResult {
  tags: GenreRecTag[];
  isNewUser: boolean;
  coverage: GenreCoverage;
}

interface TagSignal {
  display: string;
  count: number;
  lastAt: number;
}

interface SignalSummary {
  totalWorks: number;
  worksWithTags: number;
  tags: Map<string, TagSignal>;
}

const EMPTY_COVERAGE: GenreCoverage = {
  favorites: 0,
  favoritesWithTags: 0,
  history: 0,
  historyWithTags: 0,
};

function summarize(rows: GenreSignalRow[]): SignalSummary {
  const seenCodes = new Set<string>();
  const tags = new Map<string, TagSignal>();
  let totalWorks = 0;
  let worksWithTags = 0;

  for (const row of rows) {
    const code = normalizeJavCode(row.code || '');
    if (!isJavWorkCode(code) || seenCodes.has(code)) continue;
    seenCodes.add(code);
    totalWorks += 1;

    const contentTags = filterContentTags(parseValueList(row.tags));
    const uniqueKeys = new Set<string>();
    const rowTags: { key: string; display: string }[] = [];
    for (const tag of contentTags) {
      const key = valueKey(tag);
      if (!key || uniqueKeys.has(key)) continue;
      uniqueKeys.add(key);
      rowTags.push({ key, display: tag });
    }
    if (rowTags.length === 0) continue;
    worksWithTags += 1;

    for (const tag of rowTags) {
      const existing = tags.get(tag.key);
      if (existing) {
        existing.count += 1;
        existing.lastAt = Math.max(existing.lastAt, row.created_at);
      } else {
        tags.set(tag.key, { display: tag.display, count: 1, lastAt: row.created_at });
      }
    }
  }

  return { totalWorks, worksWithTags, tags };
}

function shuffle<T>(values: T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function toRecTag(genre: GenreRow, source: GenreRecTag['source'], score: number): GenreRecTag {
  return {
    key: genre.name_key,
    name: genre.name,
    section: genre.section,
    source,
    score: Number(score.toFixed(4)),
  };
}

function buildResult(
  dictionary: GenreRow[],
  favorites: SignalSummary,
  history: SignalSummary
): GenreRecommendationResult {
  const coverage: GenreCoverage = {
    favorites: favorites.totalWorks,
    favoritesWithTags: favorites.worksWithTags,
    history: history.totalWorks,
    historyWithTags: history.worksWithTags,
  };

  const hasFavSignal = favorites.worksWithTags > 0;
  const hasHistSignal = history.worksWithTags > 0;
  const isNewUser = !hasFavSignal && !hasHistSignal;

  const byKey = new Map(dictionary.map((genre) => [genre.name_key, genre]));
  const wFav = hasFavSignal && hasHistSignal ? GENRE_REC.FAVORITE_WEIGHT : hasFavSignal ? 1 : 0;
  const wHist = hasFavSignal && hasHistSignal ? GENRE_REC.HISTORY_WEIGHT : hasHistSignal ? 1 : 0;

  const scored: { genre: GenreRow; score: number; lastAt: number }[] = [];
  const unionKeys = new Set([...favorites.tags.keys(), ...history.tags.keys()]);
  let unresolved = 0;

  for (const key of unionKeys) {
    const genre = byKey.get(key);
    if (!genre) {
      unresolved += 1;
      continue;
    }
    const favCount = favorites.tags.get(key)?.count ?? 0;
    const histCount = history.tags.get(key)?.count ?? 0;
    const favShare = favorites.worksWithTags > 0 ? favCount / favorites.worksWithTags : 0;
    const histShare = history.worksWithTags > 0 ? histCount / history.worksWithTags : 0;
    const score = wFav * favShare + wHist * histShare;
    if (score <= 0) continue;

    const lastAt = Math.max(
      favorites.tags.get(key)?.lastAt ?? 0,
      history.tags.get(key)?.lastAt ?? 0
    );
    scored.push({ genre, score, lastAt });
  }

  if (unresolved > 0) {
    const sample = Array.from(unionKeys).slice(0, 3).join(',');
    console.log(`[genre-rec] unresolved=${unresolved} sample=${sample}`);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.lastAt !== a.lastAt) return b.lastAt - a.lastAt;
    return a.genre.name.localeCompare(b.genre.name);
  });

  const selected: GenreRecTag[] = [];
  const usedKeys = new Set<string>();
  for (const entry of scored) {
    if (selected.length >= GENRE_REC.MAX_TAGS) break;
    if (usedKeys.has(entry.genre.name_key)) continue;
    usedKeys.add(entry.genre.name_key);
    selected.push(toRecTag(entry.genre, 'personal', entry.score));
  }

  if (selected.length < GENRE_REC.MAX_TAGS) {
    const candidates = dictionary.filter((genre) => !usedKeys.has(genre.name_key));
    const filled = shuffle(candidates).slice(0, GENRE_REC.MAX_TAGS - selected.length);
    for (const genre of filled) selected.push(toRecTag(genre, 'random', 0));
  }

  return { tags: selected, isNewUser, coverage };
}

export async function getGenreRecommendations(
  db: D1Database,
  userId: string,
  refresh = false
): Promise<GenreRecommendationResult> {
  const cacheKey = `genre-rec-v1/${userId}`;
  if (!refresh) {
    const cached = await getCachedJson<GenreRecommendationResult>(cacheKey);
    if (cached) return cached;
  }

  const dictionary = await getUsableGenres(db);
  if (dictionary.length === 0) {
    return { tags: [], isNewUser: false, coverage: EMPTY_COVERAGE };
  }

  const [favoriteRows, historyRows] = await Promise.all([
    getGenreFavoriteSignals(db, userId, GENRE_REC.FAVORITE_LIMIT),
    getGenreHistorySignals(db, userId, GENRE_REC.HISTORY_LIMIT),
  ]);

  const result = buildResult(dictionary, summarize(favoriteRows), summarize(historyRows));

  // 新用户/空词典不缓存：每次请求重新抽随机，且词典同步后能尽快出现
  if (!result.isNewUser && result.tags.length > 0) {
    await putCachedJson(cacheKey, result, GENRE_REC.PROFILE_CACHE_TTL);
  }

  return result;
}
