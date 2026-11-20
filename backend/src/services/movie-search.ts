/**
 * 影视搜索服务：TMDB 提供元数据，TPB（关键词）与 EZTV（剧集）提供磁力。
 *
 * 类型契约：TMDBResult / ResourceItem / MovieSearchResult 与 frontend/src/types/search.ts 同步。
 * 外部源失败必须落到 tmdbError / tpbError / eztvError，不能静默返回空数组冒充「没有资源」。
 */

// ── 类型 ─────────────────────────────────────────────────

export interface TMDBResult {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string;
  year: string;
  rating: number;
  voteCount: number;
  mediaType: 'movie' | 'tv';
  source: 'tmdb';
}

export interface ResourceItem {
  title: string;
  magnet: string;
  size: string;
  date: string;
  source: string;
  sourceLabel: string;
  /** 资源类型：magnet=磁力 drive=网盘 direct=直链 */
  resourceType?: 'magnet' | 'drive' | 'direct';
  /** 网盘链接（当 resourceType === 'drive' 时） */
  driveUrl?: string;
  /** 提取码 */
  driveCode?: string;
  /** 原站详情页链接（用于“查看详情”跳转） */
  detailUrl?: string;
  /** 做种数（TPB/EZTV 提供） */
  seeders?: number;
  /** 下载者数（TPB/EZTV 提供） */
  leechers?: number;
  /** 季号（EZTV 直接返回；TPB 只能从标题解析） */
  season?: number;
  /** 集号（同上） */
  episode?: number;
}

/** 归组结果项 */
export interface MovieGroupedItem {
  /** 关联的 TMDB 作品 */
  subject: TMDBResult;
  /** 该作品下所有匹配的资源 */
  resources: ResourceItem[];
}

export interface MovieSearchResult {
  keyword: string;
  page: number;
  results: TMDBResult[];
  resources: ResourceItem[];
  total: number;
  resourceTotal: number;
  tmdbError: string | null;
  tpbError: string | null;
  eztvError: string | null;
  /** 按源的失败语义（与 error 字段对应） */
  errorKinds?: Record<string, SearchErrorKind>;
  resourceSources: string[];
  /** 作品级归组结果（v1.3.0 新增） */
  grouped?: {
    groups: MovieGroupedItem[];
    ungrouped: ResourceItem[];
  };
  /** 诊断指标：耗时、预算、各源状态、可操作率。前端不渲染，供日志与排查使用 */
  diagnostics?: SearchDiagnostics;
}

import { fetchWithRetry } from '@/utils/fetch';
import { formatBytes } from '@/utils/format';
import { classifySearchError, sanitizeError, type SearchErrorKind } from '@/utils/error';
import { createDeadline, budgetFor, mapWithConcurrency } from '@/utils';
import { buildDiagnostics, logSearchDiagnostics, type SearchDiagnostics, type SourceStat } from '@/utils/search-metrics';
import { isMovieResourceActionable } from '@/services/search-actionable';
import { groupResourcesBySubject } from '@/utils/title-grouping';
import { groupResourcesBySubjectV2, USE_SCORED_MATCHER } from '@/utils/subject-resolver';
import { compareGrouping, logMatcherShadow } from '@/services/matcher-shadow';
import { lookupQueryVariants, resolveQuery } from '@/services/alias-resolver';
import { ingestTmdbAliases } from '@/services/alias-ingest';
import { toSourceSearchText } from '@/services/query-normalizer';

// ── 常量 ─────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 从 magnet URI 提取 infoHash（40位 hex） */
function extractHash(magnet: string): string {
  const m = magnet.match(/urn:btih:([a-fA-F0-9]{40})/i);
  return m ? m[1].toLowerCase() : '';
}

// ── TMDB API ─────────────────────────────────────────────

/** TMDB 多类型搜索（movie + tv），最多保留前 20 条。 */
async function searchTMDB(keyword: string, apiKey: string, page = 1, lang = 'zh-CN'): Promise<TMDBResult[]> {
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(keyword)}&language=${lang}&page=${page}&include_adult=false`;
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`TMDB error: ${r.status}`);
  const data = await r.json() as { results?: any[] };
  if (!data.results) return [];

  return data.results
    .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
    .slice(0, 20)
    .map((item: any) => {
      const releaseDate: string = item.release_date || item.first_air_date || '';
      return {
        id: item.id,
        title: item.title || item.name || '',
        originalTitle: item.original_title || item.original_name || '',
        overview: (item.overview || '').slice(0, 300),
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
        releaseDate,
        year: releaseDate ? releaseDate.slice(0, 4) : '',
        rating: Math.round((item.vote_average || 0) * 10) / 10,
        voteCount: item.vote_count || 0,
        mediaType: item.media_type as 'movie' | 'tv',
        source: 'tmdb' as const,
      };
    });
}

// ── The Pirate Bay（apibay.org）──────────────────────────

/**
 * TPB 关键词搜索。
 *
 * 返回 `degraded` 标记而不是直接空数组：apibay 在降级/限流时返回
 * HTTP 200 + `[{"id":"0","name":"No results returned"}]`，与「真的没有资源」结构完全一致。
 * 直接当空处理会让「源挂了」永远不可见，所以调用方必须拿到这个标记。
 *
 * 导出供金丝雀与集成测试直接探测源站行为（降级、分类过滤、限流）。
 */
export async function searchTPB(
  keyword: string,
  timeoutMs = 15_000,
): Promise<{ items: ResourceItem[]; degraded: boolean }> {
  // apibay 的 q 区分大小写：实测 "Inception" 返回 0 条、"inception" 返回 100 条。
  // TMDB 英文标题首字母大写，必须转小写再查，否则整个 TPB 源恒为空。
  // 同时剥掉维基消歧后缀（Up (2009 film)），否则按词匹配同样返回 0 条。
  const cleaned = toSourceSearchText(keyword);
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(cleaned.toLowerCase())}&cat=200`;
  const r = await fetchWithRetry(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(timeoutMs),
  }, { retries: 2, baseDelay: 1000 });
  // 失败必须抛出：由 searchMovie 收集为 tpbError，静默返回 [] 会让前端误判「没有资源」
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const items = await r.json() as Array<{
    id: string; name: string; info_hash: string; category?: string;
    leechers: string; seeders: string; size: string; added: string;
  }>;
  if (!items?.length) return { items: [], degraded: false };
  if (items[0]?.name === 'No results returned') return { items: [], degraded: true };

  const trackers = [
    'udp%3A%2F%2Ftracker.openbittorrent.com%3A6969%2Fannounce',
    'udp%3A%2F%2Fopen.demonii.com%3A1337%2Fannounce',
    'udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce',
    'udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce',
  ].map(t => `&tr=${t}`).join('');

  // cat=200 已按视频大类过滤，这里再用响应里的 category 兜一层：
  // apibay 若忽略 cat 参数（或后续改行为），5xx 成人分类会重新混进来。
  const videoOnly = items.filter(item => {
    const cat = Number(item.category);
    return !Number.isFinite(cat) || (cat >= 200 && cat < 300);
  });

  return {
    items: videoOnly.slice(0, 20).map(item => ({
      title: item.name,
      magnet: `magnet:?xt=urn:btih:${item.info_hash.toLowerCase()}&dn=${encodeURIComponent(item.name)}${trackers}`,
      size: formatBytes(parseInt(item.size) || 0),
      date: item.added ? new Date(parseInt(item.added) * 1000).toISOString().split('T')[0] : '',
      source: 'tpb',
      sourceLabel: 'TPB',
      resourceType: 'magnet' as const,
      detailUrl: item.id ? `https://thepiratebay.org/description.php?id=${item.id}` : undefined,
      seeders: parseInt(item.seeders) || 0,
      leechers: parseInt(item.leechers) || 0,
    })),
    degraded: false,
  };
}

// ── TMDB External IDs ───────────────────────────────────

/** 读取 TMDB 剧集的 IMDB ID，供 EZTV 查询。 */
async function fetchTMDBExternalIds(tmdbId: number, apiKey: string): Promise<{ imdb_id: string | null }> {
  try {
    const url = `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${apiKey}`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`tmdb_ext_http_${r.status}`);
    const data = await r.json() as { imdb_id?: string | null };
    return { imdb_id: data.imdb_id || null };
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * 取 TMDB 各地区片名，只保留拉丁字母标题（TPB 只认英文发布名）。
 * 失败返回空数组：补不到英文名是「资源少」，不该让整次搜索报错。
 */
async function fetchTmdbAlternativeTitles(
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  apiKey: string,
  timeoutMs: number,
): Promise<string[]> {
  try {
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/alternative_titles?api_key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return [];
    const data = await r.json() as { titles?: Array<{ iso_3166_1?: string; title?: string }> };
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of data.titles ?? []) {
      const title = (item.title || '').trim();
      // 只留拉丁标题：中文/日文别名对 TPB 没有检索价值
      if (!title || !/[A-Za-z]/.test(title) || seen.has(title)) continue;
      seen.add(title);
      out.push(title);
    }
    // 美/英片名优先（TPB 索引率最高）
    out.sort((a, b) => {
      const aEn = /^[\x20-\x7e]+$/.test(a) ? 0 : 1;
      const bEn = /^[\x20-\x7e]+$/.test(b) ? 0 : 1;
      return aEn - bEn;
    });
    return out.slice(0, 3);
  } catch {
    return [];
  }
}

// ── EZTV JSON API ────────────────────────────────────────

/** EZTV 单页条数上限（服务端固定） */
const EZTV_PAGE_SIZE = 30;
/** 最多翻几页：3 页 ≈ 90 条，覆盖绝大多数剧集；再翻收益低于成本 */
const EZTV_MAX_PAGES = 3;

/**
 * 按 IMDB ID 取 EZTV 剧集资源。
 *
 * 分页是必需的：limit=30 只覆盖最新 30 条，实测《权谋》torrents_count=146、
 * 《怪奇物语》196，老剧集与旧季包全在后面的页里。
 * 季集参数（season/episode）实测无效，所以只能翻页 + 用返回里的 season/episode 本地分组。
 */
async function fetchEZTV(
  imdbId: string,
  timeoutMs = 15_000,
  remainingBudgetMs?: () => number,
): Promise<ResourceItem[]> {
  try {
    // EZTV 只接受纯数字 IMDB id；带 tt 前缀时该参数被忽略，会把全站最新种子当成该剧资源
    const numericId = imdbId.replace(/^tt/i, '');
    const collected: ResourceItem[] = [];
    let total = Infinity;

    for (let page = 1; page <= EZTV_MAX_PAGES; page++) {
      // 每页都先看预算：翻页是为了补全，不该把整次搜索拖到超时
      if (remainingBudgetMs && remainingBudgetMs() < 1_500) break;
      const url = `https://eztv.re/api/get-torrents?imdb_id=${encodeURIComponent(numericId)}&limit=${EZTV_PAGE_SIZE}&page=${page}`;
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) {
        if (page === 1) throw new Error(`eztv_http_${r.status}`);
        break;
      }
      const data = await r.json() as {
        torrents_count?: number;
        torrents?: Array<{
          id: string; title: string; magnet_url: string;
          size_bytes: string; seeds: number; peers: number;
          date_released_unix: string; season?: string | number; episode?: string | number;
        }>;
      };
      if (typeof data.torrents_count === 'number') total = data.torrents_count;
      const rows = data.torrents ?? [];
      if (rows.length === 0) break;

      for (const t of rows) {
        const season = Number(t.season);
        const episode = Number(t.episode);
        collected.push({
          title: t.title || '',
          magnet: t.magnet_url || '',
          size: t.size_bytes ? formatBytes(parseInt(t.size_bytes) || 0) : '',
          date: t.date_released_unix ? new Date(parseInt(t.date_released_unix) * 1000).toISOString().split('T')[0] : '',
          source: 'eztv',
          sourceLabel: 'EZTV',
          resourceType: 'magnet' as const,
          seeders: t.seeds ?? 0,
          leechers: t.peers ?? 0,
          // EZTV 直接给季集，不需要从标题猜；0 表示特别篇/未标注，保持 undefined
          season: Number.isFinite(season) && season > 0 ? season : undefined,
          episode: Number.isFinite(episode) && episode > 0 ? episode : undefined,
        });
      }
      if (collected.length >= total) break;
    }

    return collected;
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

// ── 主入口 ───────────────────────────────────────────────

/**
 * 影视搜索主入口：TMDB 中英双语并行取元数据，再用英文标题查 TPB、用 IMDB ID 查 EZTV。
 *
 * 返回 total 为元数据条数、resourceTotal 为去重后资源条数；两套计数前端分别使用。
 */
export async function searchMovie(
  keyword: string,
  page = 1,
  tmdbKey?: string,
  skip: Set<string> = new Set(),
  options: { db?: D1Database; waitUntil?: (task: Promise<unknown>) => void } = {}
): Promise<MovieSearchResult> {
  const budgetMs = budgetFor('movie_sources');
  const deadline = createDeadline(budgetMs);
  const sources: Record<string, SourceStat> = {};
  const useTmdb = !!tmdbKey && !skip.has('tmdb');
  // 本地别名表兜底：TMDB 不可用时仍能为 TPB 生成英文检索词
  const aliasVariants = options.db
    ? await lookupQueryVariants(options.db, keyword, 'work').catch(() => [])
    : [];
  const aliasEnglishTitles = aliasVariants
    .filter(variant => variant.lang === 'en')
    .map(variant => variant.text)
    .filter(title => title.length > 1);
  const hasDbAliases = aliasVariants.some(variant => variant.transform.startsWith('db:'));
  if (options.db && !hasDbAliases && options.waitUntil) {
    // 别名未命中时异步预热，不阻塞本次搜索；下一次同词搜索即可命中
    options.waitUntil(
      resolveQuery(options.db, keyword, { entityType: 'work', allowNetwork: true }).catch(() => null)
    );
  }
  // Phase 1: 元数据 — 中文 TMDB + 英文 TMDB（拿英文名搜 TPB）两路并行
  //
  // 这里不能给每路挂 `.catch(() => [])`：那样 `tmdbErrorRaw` 永远是 null，
  // TMDB 全挂时前端只会看到「没有结果」，与「确实没有这部片」无法区分。
  const [zhMetaRes, enMetaRes] = await Promise.allSettled([
    useTmdb ? searchTMDB(keyword, tmdbKey!, page, 'zh-CN') : Promise.resolve([] as TMDBResult[]),
    useTmdb ? searchTMDB(keyword, tmdbKey!, page, 'en-US') : Promise.resolve([] as TMDBResult[]),
  ]);

  const zhResults: TMDBResult[] = zhMetaRes.status === 'fulfilled' ? zhMetaRes.value : [];
  const enResults: TMDBResult[] = enMetaRes.status === 'fulfilled' ? enMetaRes.value : [];
  // 任一路失败即视为元数据不可用；两路都失败才是真故障，一路失败仍有结果可用
  const tmdbErrorRaw = zhResults.length === 0 && enResults.length === 0
    ? [zhMetaRes, enMetaRes]
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => String(r.reason))[0] ?? null
    : null;

  // 中英两路合并：中文结果优先（有中文标题），英文独有作品追加在后面。
  // 旧实现只返回中文结果，导致「中文搜不到但英文搜得到」的作品整条丢失。
  const zhIds = new Set(zhResults.map(item => item.id));
  let results: TMDBResult[] = [...zhResults, ...enResults.filter(item => !zhIds.has(item.id))];

  // 元数据去重：mediaType + 年份 + 归一化标题（同名不同作品不能合并）
  const seen = new Set<string>();
  results = results.filter(item => {
    const normalizedTitle = item.title.toLowerCase().replace(/[\s:·\-–—_.,!?()[\]{}'"]/g, '');
    const key = `${item.mediaType}|${item.year}|${normalizedTitle.slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  // ── TPB 关键词 ────────────────────────────────────────
  const idToEnglishTitle = new Map<number, string>();
  for (const item of enResults) {
    if (item.id > 0 && item.title) idToEnglishTitle.set(item.id, item.title);
  }

  // 异步灌入 TMDB 各地区片名，供后续搜索及其他源站复用
  // 仅在别名覆盖不足时触发，避免每次搜索都额外打 TMDB
  if (options.db && tmdbKey && options.waitUntil && results.length > 0 && !hasDbAliases) {
    const jobs = results
      .slice(0, 3)
      .map(item => ingestTmdbAliases(options.db!, item.mediaType, item.id, tmdbKey));
    options.waitUntil(Promise.allSettled(jobs));
  }

  // 收集关键词：英文名 + 英文名+年份，去重
  const tpbKeywords: string[] = [];
  for (const r of results.slice(0, 8)) {
    const en = idToEnglishTitle.get(r.id) || r.originalTitle?.trim() || '';
    if (en && en.length > 1) {
      if (!tpbKeywords.includes(en)) tpbKeywords.push(en);
      // 加上年份提高精度
      if (r.year && !tpbKeywords.includes(`${en} ${r.year}`)) {
        tpbKeywords.push(`${en} ${r.year}`);
      }
    }
  }
  // 本地别名表补位：TMDB 无结果/未配置时，仍能用英文别名查询 TPB
  for (const en of aliasEnglishTitles) {
    if (!tpbKeywords.includes(en)) tpbKeywords.push(en);
  }

  // 华语片补英文名：TPB 只索引英文发布名，中文片名直接查必然 0 条。
  // 别名是搜索后异步灌入的，所以首次搜索必须同步取一次 alternative_titles，
  // 否则「第一次搜中文片名没有资源」要等缓存过期才会好。
  if (useTmdb && !skip.has('tpb') && tpbKeywords.length > 0
    && tpbKeywords.every(title => !/[A-Za-z]/.test(title)) && results[0]) {
    const altTitles = await fetchTmdbAlternativeTitles(results[0].mediaType, results[0].id, tmdbKey, deadline.slice(4_000));
    for (const title of altTitles) {
      if (title.length > 1 && !tpbKeywords.includes(title)) tpbKeywords.unshift(title);
    }
  }

  // ── TPB 并发搜索 ──────────────────────────────────────
  let allTpbResults: ResourceItem[] = [];
  let tpbError: string | null = null;
  const tpbStat: SourceStat = { state: 'skipped', count: 0 };
  if (tpbKeywords.length > 0 && !skip.has('tpb')) {
    const tpbStartedAt = Date.now();
    // 限制最多使用前 6 个关键词，避免过多并发请求
    const limitedKeywords = tpbKeywords.slice(0, 6);
    const TPB_CONCURRENCY = 3;

    // 真正的并发上限：`map(async ...)` 在创建 Promise 时就已发出请求，
    // 后面再「分批 await」只是等待，起不到限流作用（旧实现的实际并发是 6）。
    // mapWithConcurrency 在 fn 抛错时整体 reject，所以错误必须在 fn 内捕获，
    // 否则一个关键词失败会让整批结果丢失。
    type KeywordOutcome =
      | { ok: true; items: ResourceItem[]; degraded: boolean }
      | { ok: false; error: unknown }
      | { ok: false; skippedByDeadline: true };

    const outcomes = await mapWithConcurrency<string, KeywordOutcome>(
      limitedKeywords,
      TPB_CONCURRENCY,
      async (title) => {
        if (deadline.expired()) return { ok: false, skippedByDeadline: true };
        try {
          let r = await searchTPB(title, deadline.slice(15_000));
          // 实测 apibay 会间歇性返回「200 + No results」的降级响应（同一关键词前后行为不一致）。
          // 隔 800ms 重试一次能救回大部分；降级若持续，第二次仍会拿到同样的标记，不会误报。
          if (r.degraded && deadline.remaining() > 1_500) {
            await new Promise(resolve => setTimeout(resolve, 800));
            r = await searchTPB(title, deadline.slice(15_000));
          }
          return { ok: true, items: r.items, degraded: r.degraded };
        } catch (e) {
          // 统一加 TPB 前缀，便于 sanitizeError 映射为用户可读文案
          return { ok: false, error: new Error(`TPB: ${e instanceof Error ? e.message : String(e)}`) };
        }
      }
    );

    let tpbFulfilled = 0;
    let tpbDegraded = 0;
    let tpbSkipped = 0;
    for (const outcome of outcomes) {
      if (outcome.ok) {
        tpbFulfilled++;
        if (outcome.degraded) tpbDegraded++;
        allTpbResults.push(...outcome.items);
      } else if ('skippedByDeadline' in outcome) {
        tpbSkipped++;
      } else if (!tpbError) {
        tpbError = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
      }
    }
    // 只要有一个关键词请求成功，TPB 源就是可用的。
    // 部分标题变体失败不应让已返回的资源上方出现「TPB 请求失败」。
    if (tpbFulfilled > 0) tpbError = null;
    // 全部关键词都被预算跳过：这是超时，不是「没有资源」
    if (tpbFulfilled === 0 && tpbSkipped > 0) tpbError = 'SEARCH_TIMEOUT';

    // 按 btih 去重：复用统一提取逻辑，避免 magnet 前缀长度变化或短链时截断错位
    const seenHashes = new Set<string>();
    allTpbResults = allTpbResults.filter(r => {
      const hash = extractHash(r.magnet || '');
      if (!hash || seenHashes.has(hash)) return false;
      seenHashes.add(hash); return true;
    }).slice(0, 40);

    tpbStat.ms = Date.now() - tpbStartedAt;
    tpbStat.count = allTpbResults.length;
    tpbStat.state = allTpbResults.length > 0
      ? 'ok'
      // 全空但有 degraded 响应：源在降级，必须与真空区分
      : tpbDegraded > 0 ? 'degraded'
      : tpbSkipped > 0 ? 'timeout'
      : tpbError ? 'failed'
      : 'empty';
  }
  sources.tpb = tpbStat;

  // ── Phase 2: EZTV 剧集搜索（需要 IMDB ID）──────────────
  const eztvResults: ResourceItem[] = [];
  let eztvError: string | null = null;
  const eztvStat: SourceStat = { state: 'skipped', count: 0 };
  const tvItems = results.filter(r => r.mediaType === 'tv');
  if (tvItems.length > 0 && useTmdb && !skip.has('eztv')) {
    const eztvStartedAt = Date.now();
    let eztvSkipped = 0;
    const eztvPromises = tvItems.slice(0, 5).map(async (item) => {
      // 预算耗尽后不再发起新的 external_ids 请求，已有结果照常返回
      if (deadline.expired()) {
        eztvSkipped++;
        return [] as ResourceItem[];
      }
      const extIds = await fetchTMDBExternalIds(item.id, tmdbKey);
      if (extIds.imdb_id) {
        return await fetchEZTV(extIds.imdb_id, deadline.slice(15_000), () => deadline.remaining());
      }
      return [] as ResourceItem[];
    });
    const eztvAll = await Promise.allSettled(eztvPromises);
    let eztvFulfilled = 0;
    for (const r of eztvAll) {
      if (r.status === 'fulfilled') {
        eztvFulfilled++;
        eztvResults.push(...r.value);
      } else if (!eztvError) {
        // 单个剧集失败只降级该剧，不拖垮整批
        eztvError = r.reason instanceof Error ? r.reason.message : String(r.reason);
      }
    }
    // 同 TPB：部分剧集查询失败、但其他剧集成功时不报整源错误
    if (eztvFulfilled > 0) eztvError = null;

    eztvStat.ms = Date.now() - eztvStartedAt;
    eztvStat.count = eztvResults.length;
    eztvStat.state = eztvResults.length > 0
      ? 'ok'
      : eztvSkipped > 0 ? 'timeout'
      : eztvError ? 'failed'
      : 'empty';
  }
  sources.eztv = eztvStat;

  // ── 合并资源、去重、排序 ──────────────────────────────
  const allResources = [...allTpbResults, ...eztvResults];
  const seenHashes = new Set<string>();
  const dedupedResources = allResources.filter(r => {
    const hash = extractHash(r.magnet);
    if (!hash || seenHashes.has(hash)) return false;
    seenHashes.add(hash);
    return true;
  }).sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));

  // 实际命中的源列表，前端仅展示有资源的源标签
  const sourceNames = new Set<string>();
  if (allTpbResults.length > 0) sourceNames.add('TPB');
  if (eztvResults.length > 0) sourceNames.add('EZTV');

  // ── 作品级归组 ────────────────────────────────────────
  // 用 TMDB 作品标题匹配资源；新旧两套同时跑，返回哪一套由 USE_SCORED_MATCHER 决定
  const legacyGrouped = groupResourcesBySubject(results, dedupedResources, {
    subjectTitles: (s) => [s.title, s.originalTitle],
    resourceTitle: (r) => r.title,
    resourceId: (r) => r.magnet,
  });
  const scoredGrouped = groupResourcesBySubjectV2(results, dedupedResources, {
    subjectId: (s) => `tmdb:${s.mediaType}:${s.id}`,
    subjectTitles: (s) => [s.title, s.originalTitle],
    subjectYear: (s) => s.year,
    // 影视必须有类型：电影收到 SxxExx 剧集包时用它一票否决
    subjectMediaType: (s) => s.mediaType,
    resourceTitle: (r) => r.title,
    resourceId: (r) => r.magnet,
  });
  const shadow = compareGrouping(
    legacyGrouped,
    scoredGrouped,
    (s) => `tmdb:${s.mediaType}:${s.id}`,
    (r) => r.magnet,
  );
  logMatcherShadow('movie', keyword, shadow);
  const groupedResult = USE_SCORED_MATCHER ? scoredGrouped : legacyGrouped;

  // 失败语义：errors 只放已脱敏文案，errorKinds 保留「限流/源不可用」分类
  const errorKinds: Record<string, SearchErrorKind> = {};
  const recordErrorKind = (source: string, raw: string | null) => {
    const kind = classifySearchError(raw);
    if (kind) errorKinds[source] = kind;
  };
  recordErrorKind('tmdb', tmdbErrorRaw);
  recordErrorKind('tpb', tpbError);
  recordErrorKind('eztv', eztvError);

  sources.tmdb = {
    state: !useTmdb ? 'skipped'
      : tmdbErrorRaw ? 'failed'
      : results.length > 0 ? 'ok'
      : 'empty',
    count: results.length,
  };

  const diagnostics = buildDiagnostics({
    category: 'movie_sources',
    keyword,
    page,
    elapsedMs: deadline.elapsed(),
    budgetMs,
    deadlineHit: deadline.expired(),
    works: results.length,
    resources: dedupedResources.length,
    actionable: dedupedResources.filter(isMovieResourceActionable).length,
    ungrouped: groupedResult.ungrouped.length,
    sources,
  });
  logSearchDiagnostics(diagnostics);

  return {
    keyword,
    page,
    results,
    resources: dedupedResources,
    total: results.length,
    resourceTotal: dedupedResources.length,
    tmdbError:  tmdbErrorRaw ? sanitizeError(tmdbErrorRaw) : null,
    tpbError:    tpbError ? sanitizeError(tpbError) : null,
    eztvError:   eztvError ? sanitizeError(eztvError) : null,
    errorKinds,
    resourceSources: Array.from(sourceNames),
    grouped: {
      groups: groupedResult.groups.map(g => ({
        subject: g.subject,
        resources: g.resources,
      })),
      ungrouped: groupedResult.ungrouped,
    },
    diagnostics,
  };
}
