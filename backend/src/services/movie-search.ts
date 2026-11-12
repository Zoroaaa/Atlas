/**
 * 影视搜索服务
 * 元数据: TMDB
 * 磁力资源: TPB API（关键词搜索）+ EZTV（剧集）
 *
 * ⚠️ 类型契约：本文件导出的接口（TMDBResult, ResourceItem, MovieSearchResult）
 *    与 frontend/src/types/search.ts 保持结构同步。
 *    修改任一端时，请同步更新另一端。
 */

// ─── Types ──────────────────────────────────────────────────────────────

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
}

import { fetchWithRetry } from '@/utils/fetch';
import { formatBytes } from '@/utils/format';
import { classifySearchError, sanitizeError, type SearchErrorKind } from '@/utils/error';
import { groupResourcesBySubject } from '@/utils/title-grouping';

// ─── Constants ───────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 从 magnet URI 提取 infoHash（40位 hex） */
function extractHash(magnet: string): string {
  const m = magnet.match(/urn:btih:([a-fA-F0-9]{40})/i);
  return m ? m[1].toLowerCase() : '';
}

// ─── TMDB API ──────────────────────────────────────────────────────────

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

// ─── The Pirate Bay API（apibay.org JSON，最全，CF Workers 可达）──────

async function searchTPB(keyword: string): Promise<ResourceItem[]> {
  // apibay 的 q 区分大小写：实测 "Inception" 返回 0 条、"inception" 返回 100 条。
  // TMDB 英文标题首字母大写，必须转小写再查，否则整个 TPB 源恒为空。
  const url = `https://apibay.org/q.php?q=${encodeURIComponent(keyword.toLowerCase())}&cat=0`;
  const r = await fetchWithRetry(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  }, { retries: 2, baseDelay: 1000 });
  // 失败必须抛出：由 searchMovie 收集为 tpbError，静默返回 [] 会让前端误判「没有资源」
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const items = await r.json() as Array<{
    id: string; name: string; info_hash: string;
    leechers: string; seeders: string; size: string; added: string;
  }>;
  if (!items?.length || items[0]?.name === 'No results returned') return [];

  const trackers = [
    'udp%3A%2F%2Ftracker.openbittorrent.com%3A6969%2Fannounce',
    'udp%3A%2F%2Fopen.demonii.com%3A1337%2Fannounce',
    'udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce',
    'udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce',
  ].map(t => `&tr=${t}`).join('');

  return items.slice(0, 20).map(item => ({
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
  }));
}

// ─── TMDB External IDs（获取 IMDB ID 用于 EZTV）──────────────────────

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

// ─── EZTV JSON API（剧集专用）─────────────────────────────────────────

async function fetchEZTV(imdbId: string): Promise<ResourceItem[]> {
  try {
    // EZTV 只接受纯数字 IMDB id；带 tt 前缀时该参数被忽略，会把全站最新种子当成该剧资源
    const numericId = imdbId.replace(/^tt/i, '');
    const url = `https://eztv.re/api/get-torrents?imdb_id=${encodeURIComponent(numericId)}&limit=30`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`eztv_http_${r.status}`);

    const data = await r.json() as {
      torrents?: Array<{
        id: string; title: string; magnet_url: string;
        size_bytes: string; seeds: number; peers: number;
        date_released_unix: string;
      }>;
    };

    if (!data.torrents?.length) return [];

    return data.torrents.map(t => ({
      title: t.title || '',
      magnet: t.magnet_url || '',
      size: t.size_bytes ? formatBytes(parseInt(t.size_bytes) || 0) : '',
      date: t.date_released_unix ? new Date(parseInt(t.date_released_unix) * 1000).toISOString().split('T')[0] : '',
      source: 'eztv',
      sourceLabel: 'EZTV',
      resourceType: 'magnet' as const,
      seeders: t.seeds ?? 0,
      leechers: t.peers ?? 0,
    }));
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

// ─── 主入口 ────────────────────────────────────────────────────────────

export async function searchMovie(
  keyword: string,
  page = 1,
  tmdbKey?: string,
  skip: Set<string> = new Set(),
): Promise<MovieSearchResult> {
  const useTmdb = !!tmdbKey && !skip.has('tmdb');
  // Phase 1: 元数据 — 中文 TMDB + 英文 TMDB（拿英文名搜 TPB）两路并行
  const [zhMetaRes, enMetaRes] = await Promise.allSettled([
    useTmdb ? searchTMDB(keyword, tmdbKey!, page, 'zh-CN').catch(() => [] as TMDBResult[]) : Promise.resolve([] as TMDBResult[]),
    useTmdb ? searchTMDB(keyword, tmdbKey!, page, 'en-US').catch(() => [] as TMDBResult[]) : Promise.resolve([] as TMDBResult[]),
  ]);

  let results: TMDBResult[] = zhMetaRes.status === 'fulfilled' ? zhMetaRes.value : [];
  const tmdbErrorRaw = zhMetaRes.status === 'rejected' ? String(zhMetaRes.reason) : null;

  // 元数据去重：mediaType + 年份 + 归一化标题（同名不同作品不能合并）
  const seen = new Set<string>();
  results = results.filter(item => {
    const normalizedTitle = item.title.toLowerCase().replace(/[\s:·\-–—_.,!?()[\]{}'"]/g, '');
    const key = `${item.mediaType}|${item.year}|${normalizedTitle.slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  // ── 构建 TPB 搜索关键词列表 ──
  const enResults: TMDBResult[] = enMetaRes.status === 'fulfilled' ? enMetaRes.value : [];
  const idToEnglishTitle = new Map<number, string>();
  for (const item of enResults) {
    if (item.id > 0 && item.title) idToEnglishTitle.set(item.id, item.title);
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

  // ── TPB 并发搜索（所有关键词）──
  let allTpbResults: ResourceItem[] = [];
  let tpbError: string | null = null;
  if (tpbKeywords.length > 0 && !skip.has('tpb')) {
    // 限制最多使用前 6 个关键词，避免过多并发请求
    const limitedKeywords = tpbKeywords.slice(0, 6);
    const TPB_CONCURRENCY = 3; // 每批最多 3 个并发

    const tpbPromises = limitedKeywords.map(async (title) => {
      try {
        return await searchTPB(title);
      } catch (e) {
        // 统一加 TPB 前缀，便于 sanitizeError 映射为用户可读文案
        throw new Error(`TPB: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      }
    });

    // 分批执行，避免同时发起大量请求触发限流
    const tpbRes: PromiseSettledResult<ResourceItem[]>[] = [];
    for (let i = 0; i < tpbPromises.length; i += TPB_CONCURRENCY) {
      const batch = tpbPromises.slice(i, i + TPB_CONCURRENCY);
      const batchResults = await Promise.allSettled(batch);
      tpbRes.push(...batchResults);
    }
    for (const res of tpbRes) {
      if (res.status === 'fulfilled') {
        allTpbResults.push(...res.value);
      } else if (!tpbError) {
        tpbError = res.reason instanceof Error ? res.reason.message : String(res.reason);
      }
    }
    // 按 btih 去重
    const seenHashes = new Set<string>();
    allTpbResults = allTpbResults.filter(r => {
      const hash = r.magnet?.slice(20, 60) || '';
      if (!hash || seenHashes.has(hash)) return false;
      seenHashes.add(hash); return true;
    }).slice(0, 40);
  }

  // ── Phase 2: EZTV 剧集搜索（需要 IMDB ID）──
  const eztvResults: ResourceItem[] = [];
  let eztvError: string | null = null;
  const tvItems = results.filter(r => r.mediaType === 'tv');
  if (tvItems.length > 0 && useTmdb && !skip.has('eztv')) {
    const eztvPromises = tvItems.slice(0, 5).map(async (item) => {
      const extIds = await fetchTMDBExternalIds(item.id, tmdbKey);
      if (extIds.imdb_id) {
        return await fetchEZTV(extIds.imdb_id);
      }
      return [] as ResourceItem[];
    });
    const eztvAll = await Promise.allSettled(eztvPromises);
    for (const r of eztvAll) {
      if (r.status === 'fulfilled') {
        eztvResults.push(...r.value);
      } else if (!eztvError) {
        // 单个剧集失败只降级该剧，不拖垮整批
        eztvError = r.reason instanceof Error ? r.reason.message : String(r.reason);
      }
    }
  }

  // ── 合并所有资源 + 去重 + 排序 ──
  const allResources = [...allTpbResults, ...eztvResults];
  const seenHashes = new Set<string>();
  const dedupedResources = allResources.filter(r => {
    const hash = extractHash(r.magnet);
    if (!hash || seenHashes.has(hash)) return false;
    seenHashes.add(hash);
    return true;
  }).sort((a, b) => (b.seeders ?? -1) - (a.seeders ?? -1));

  // 收集实际命中的源列表
  const sourceNames = new Set<string>();
  if (allTpbResults.length > 0) sourceNames.add('TPB');
  if (eztvResults.length > 0) sourceNames.add('EZTV');

  // ── 构建作品级归组数据 ──
  // 用 TMDB 作品标题匹配资源，替换前端粗糙的模糊匹配
  const groupedResult = groupResourcesBySubject(results, dedupedResources, {
    subjectTitles: (s) => [s.title, s.originalTitle],
    resourceTitle: (r) => r.title,
    resourceId: (r) => r.magnet,
  });

  // 失败语义：errors 只放已脱敏文案，errorKinds 保留「限流/源不可用」分类
  const errorKinds: Record<string, SearchErrorKind> = {};
  const recordErrorKind = (source: string, raw: string | null) => {
    const kind = classifySearchError(raw);
    if (kind) errorKinds[source] = kind;
  };
  recordErrorKind('tmdb', tmdbErrorRaw);
  recordErrorKind('tpb', tpbError);
  recordErrorKind('eztv', eztvError);

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
  };
}
