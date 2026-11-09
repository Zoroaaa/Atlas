/**
 * 类别作品接口
 *
 * - 整页解析结果缓存 1 小时，随机抽样在缓存之后（否则 1 小时内所有人看到同一批）
 * - 页码学习：分页窗口最大页码 + 空页确认末页 + 每日扩张探测 + 30 页硬上限
 * - 拦截页（无 waterfall/movie-box）不缓存、不写库、不更新页码，直接 502 SOURCE_BLOCKED
 */
import { GENRE_WORKS } from '@/constants';
import { getHtml, parseGrid, type JavItem } from '@/services/jav-utils';
import {
  getFavoriteCodesAmong,
  getGenrePageState,
  saveGenrePageState,
  type GenrePageState,
  type GenreRow,
  type GenreSection,
} from '@/repositories/genre-repository';
import { upsertWorksToLibrary } from '@/services/library-writer';

export interface GenreWorksItem {
  code: string;
  title: string;
  cover?: string;
  actors: string[];
  date?: string;
  tags: string[];
  isFavorite: boolean;
}

export interface GenreWorksResult {
  genre: {
    key: string;
    name: string;
    section: GenreSection;
    url: string;
  };
  page: number;
  maxPage: number;
  hasMore: boolean;
  items: GenreWorksItem[];
}

export type GenreWorksFailure = 'SOURCE_BLOCKED';

export type GenreWorksOutcome =
  | { ok: true; data: GenreWorksResult }
  | { ok: false; code: GenreWorksFailure };

interface ParsedPage {
  blocked: boolean;
  empty: boolean;
  items: JavItem[];
  windowMax: number;
}

interface CachedPage {
  empty: boolean;
  items: JavItem[];
  windowMax: number;
}

interface GenreWorksOptions {
  refresh?: boolean;
  prevPage?: number;
  /** 后台任务挂载点（Worker 的 executionCtx.waitUntil） */
  waitUntil?: (promise: Promise<unknown>) => void;
}

function pageUrl(section: GenreSection, genreKey: string, page: number): string {
  const base = section === 'uncensored'
    ? 'https://www.javbus.com/uncensored/genre'
    : 'https://www.javbus.com/genre';
  return page > 1 ? `${base}/${genreKey}/${page}` : `${base}/${genreKey}`;
}

/** 从分页区块解析该标签已出现的最大页码（只是下界来源，不假设一定有末页链接） */
function parseWindowMax(html: string, genreKey: string): number {
  const escaped = genreKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `href="(?:https?:\\/\\/www\\.javbus\\.com)?\\/(?:uncensored\\/)?genre\\/${escaped}\\/(\\d+)"`,
    'gi'
  );
  let max = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const page = Number(match[1]);
    if (Number.isFinite(page) && page > max) max = page;
  }
  return max;
}

function cacheRequest(section: GenreSection, genreKey: string, page: number): Request {
  return new Request(`https://internal/jav-genre-page/${section}/${genreKey}/${page}`);
}

async function fetchPage(
  section: GenreSection,
  genreKey: string,
  page: number
): Promise<ParsedPage> {
  const cache = caches.default;
  const key = cacheRequest(section, genreKey, page);

  try {
    const cached = await cache.match(key);
    if (cached) {
      const data = (await cached.json()) as CachedPage;
      return { blocked: false, empty: data.empty, items: data.items, windowMax: data.windowMax };
    }
  } catch {
    // 缓存不可用时直接抓取
  }

  const html = await getHtml(pageUrl(section, genreKey, page), GENRE_WORKS.FETCH_TIMEOUT_MS);
  const hasWaterfall = Boolean(html) && /id="waterfall"/.test(html);
  const hasMovieBox = Boolean(html) && /class="movie-box"/.test(html);

  // 年龄门/拦截页：宁可不返回，也不缓存污染 1 小时
  if (!html || (!hasWaterfall && !hasMovieBox)) {
    return { blocked: true, empty: false, items: [], windowMax: 0 };
  }

  const items = parseGrid(html, 'javbus-genre');
  const windowMax = parseWindowMax(html, genreKey);
  const empty = items.length === 0;

  const payload: CachedPage = { empty, items, windowMax };
  const response = new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${GENRE_WORKS.CACHE_TTL_SECONDS}`,
    },
  });
  try {
    await cache.put(key, response);
  } catch {
    // 缓存写失败不影响本次响应
  }

  return { blocked: false, empty, items, windowMax };
}

function initialState(nameKey: string): GenrePageState {
  return {
    name_key: nameKey,
    max_page_seen: 1,
    last_page: 0,
    last_page_p: 0,
    probed_at: 0,
    updated_at: 0,
  };
}

function effectiveMaxPage(state: GenrePageState): number {
  const raw = state.last_page > 0 ? state.last_page : state.max_page_seen;
  return Math.min(GENRE_WORKS.MAX_PAGE, Math.max(1, raw));
}

function randomPage(maxPage: number, prevPage?: number): number {
  if (maxPage <= 1) return 1;
  let page = 1 + Math.floor(Math.random() * maxPage);
  if (prevPage && page === prevPage) {
    page = 1 + Math.floor(Math.random() * maxPage);
  }
  return page;
}

/** 从整页结果中随机抽 12 条（不足 12 条则全给） */
function sampleItems(items: JavItem[], size: number): JavItem[] {
  if (items.length <= size) return [...items];
  const pool = [...items];
  for (let i = 0; i < size; i += 1) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

/** 每日一次扩张探测：向后推 8 页，学习真实页码范围 */
function scheduleProbe(
  db: D1Database,
  genre: GenreRow,
  options: GenreWorksOptions,
  now: number
): Promise<void> | null {
  if (!options.waitUntil) return null;

  const run = async (): Promise<void> => {
    const latest = (await getGenrePageState(db, genre.name_key)) ?? initialState(genre.name_key);
    if (now - latest.probed_at < GENRE_WORKS.PROBE_INTERVAL_MS) return;

    // 以"已确认的末页"为基准向后推；last_page 已确认时不能再用可能过期的 max_page_seen
    const base = latest.last_page > 0 ? latest.last_page : latest.max_page_seen;
    const target = Math.min(GENRE_WORKS.MAX_PAGE, base + GENRE_WORKS.PROBE_STEP);
    if (target <= base) {
      await saveGenrePageState(db, { ...latest, probed_at: now, updated_at: now });
      return;
    }

    const parsed = await fetchPage(genre.section, genre.genre_key, target);
    if (parsed.blocked) {
      // 拦截不推进页码，但记录探测时间，避免每天反复打
      await saveGenrePageState(db, { ...latest, probed_at: now, updated_at: now });
      return;
    }

    if (parsed.empty) {
      // 探测页为空：base 即最后有效页，保持它，不要把过期的 max_page_seen 当成末页
      await saveGenrePageState(db, {
        ...latest,
        last_page: Math.max(1, base),
        last_page_p: target,
        probed_at: now,
        updated_at: now,
      });
      return;
    }

    await saveGenrePageState(db, {
      ...latest,
      max_page_seen: Math.min(
        GENRE_WORKS.MAX_PAGE,
        Math.max(latest.max_page_seen, parsed.windowMax, target)
      ),
      // 探测页有内容说明此前"末页"判断失效，恢复按 max_page_seen 扩张
      last_page: 0,
      last_page_p: target,
      probed_at: now,
      updated_at: now,
    });
  };

  return run().catch((err) => {
    console.error(`[genre-works] probe failed for ${genre.name_key}:`, err);
  });
}

export async function getGenreWorks(
  db: D1Database,
  userId: string,
  genre: GenreRow,
  options: GenreWorksOptions = {}
): Promise<GenreWorksOutcome> {
  const now = Date.now();
  const state = (await getGenrePageState(db, genre.name_key)) ?? initialState(genre.name_key);
  const maxPage = effectiveMaxPage(state);

  let page = options.refresh ? randomPage(maxPage, options.prevPage) : 1;
  let parsed = await fetchPage(genre.section, genre.genre_key, page);

  if (parsed.blocked) {
    return { ok: false, code: 'SOURCE_BLOCKED' };
  }

  // 越过末页：收缩末页并回退第 1 页（只回退一次）
  if (parsed.empty && page > 1) {
    const fallback = await fetchPage(genre.section, genre.genre_key, 1);
    if (fallback.blocked) {
      return { ok: false, code: 'SOURCE_BLOCKED' };
    }
    state.last_page = Math.max(1, page - 1);
    page = 1;
    parsed = fallback;
  }

  const nextState: GenrePageState = {
    ...state,
    max_page_seen: Math.min(
      GENRE_WORKS.MAX_PAGE,
      Math.max(state.max_page_seen, page, parsed.windowMax)
    ),
    updated_at: now,
  };
  await saveGenrePageState(db, nextState);

  const sampled = sampleItems(parsed.items, GENRE_WORKS.PAGE_SIZE);
  const favoriteSet = await getFavoriteCodesAmong(
    db,
    userId,
    sampled.map((item) => item.code)
  );

  const items: GenreWorksItem[] = sampled.map((item) => ({
    code: item.code,
    title: item.title,
    cover: item.cover,
    actors: [],
    date: item.date,
    tags: [],
    isFavorite: favoriteSet.has(item.code),
  }));

  // 写本地库：失败不影响接口返回
  if (parsed.items.length > 0) {
    const write = upsertWorksToLibrary(db, parsed.items, {
      sourceName: 'JavBus',
      sourceType: 'genre',
      sourceData: {
        via: 'genre',
        genreKey: genre.genre_key,
        genreName: genre.name,
        section: genre.section,
      },
      now,
    }).catch((err) => console.error('[genre-works] save works to library failed:', err));

    if (options.waitUntil) options.waitUntil(write);
    else await write;
  }

  const probe = scheduleProbe(db, genre, options, now);
  if (probe && options.waitUntil) options.waitUntil(probe);

  const finalMaxPage = Math.min(
    GENRE_WORKS.MAX_PAGE,
    nextState.last_page > 0 ? nextState.last_page : nextState.max_page_seen
  );

  return {
    ok: true,
    data: {
      genre: {
        key: genre.name_key,
        name: genre.name,
        section: genre.section,
        url: genre.url,
      },
      page,
      maxPage: Math.max(1, finalMaxPage),
      hasMore: finalMaxPage > 1,
      items,
    },
  };
}
