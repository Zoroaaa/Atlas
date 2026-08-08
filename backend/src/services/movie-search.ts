/**
 * 影视搜索服务
 * 元数据: TMDB（主）+ 豆瓣（fallback）
 * 磁力资源: TPB API（关键词搜索）+ Torrentio（TMDB ID 聚合多源）
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
  source: 'tmdb' | 'douban';
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
}

/** 归组结果项 */
export interface MovieGroupedItem {
  /** 关联的 TMDB/豆瓣 作品 */
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
  doubanError: string | null;
  tpbError: string | null;
  eztvError: string | null;
  resourceSources: string[];
  /** 作品级归组结果（v4.2 新增） */
  grouped?: {
    groups: MovieGroupedItem[];
    ungrouped: ResourceItem[];
  };
}

import { fetchWithRetry } from '@/utils/fetch';
import { formatBytes } from '@/utils/format';
import { sanitizeError } from '@/utils/error';
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

// ─── 豆瓣搜索（best-effort fallback）───────────────────────────────
//
// ⚠️ 豆瓣反爬策略可能随时变化，此接口不保证长期可用。
//    当前作为 TMDB 中文元数据的补充，失败时静默降级，不影响主流程。
//    如豆瓣持续不可用，可移除此函数及调用点。

interface DoubanRawItem { id: string; title: string; rate: string; cover?: string; url: string; is_tv: boolean; }

async function searchDoubanAjax(keyword: string): Promise<TMDBResult[]> {
  try {
    const url = `https://movie.douban.com/j/search_subjects?type=movie&tag=&sort=recommend&page_limit=20&page_start=0&search_text=${encodeURIComponent(keyword)}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA, 'Accept': 'application/json, text/javascript, */*',
        'Referer': 'https://movie.douban.com/explore', 'X-Requested-With': 'XMLHttpRequest',
        'Cookie': 'bid=""; __yadk_uid=dummy',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Douban AJAX error: ${r.status}`);
    const data = await r.json() as { subjects?: DoubanRawItem[] };
    if (!data.subjects?.length) return [];
    return data.subjects.slice(0, 15).map((item) => ({
    id: -Math.abs(parseInt(item.id) || 0), title: item.title || '', originalTitle: item.title || '',
    overview: '', poster: item.cover?.startsWith('http') ? item.cover : (item.cover ? `https:${item.cover}` : null),
    backdrop: null, releaseDate: '', year: '',
    rating: parseFloat(item.rate) || 0, voteCount: 0,
    mediaType: (item.is_tv ? 'tv' : 'movie') as 'movie' | 'tv', source: 'douban' as const,
  }));
  } catch {
    // 豆瓣不可用时静默降级，TMDB 已足够覆盖
    return [];
  }
}

async function searchDouban(keyword: string): Promise<TMDBResult[]> {
  try { const r = await searchDoubanAjax(keyword); if (r.length > 0) return r; } catch { /* ignore */ }
  return [];
}

// ─── The Pirate Bay API（apibay.org JSON，最全，CF Workers 可达）──────

async function searchTPB(keyword: string): Promise<ResourceItem[]> {
  try {
    const url = `https://apibay.org/q.php?q=${encodeURIComponent(keyword)}&cat=0`;
    const r = await fetchWithRetry(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(30000),
    }, { retries: 2, baseDelay: 1000 });
    if (!r.ok) return [];
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
    }));
  } catch (e) {
    console.error('[movie-search] tpb failed:', e instanceof Error ? e.message : e);
    return [];
  }
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
    const url = `https://eztv.re/api/get-torrents?imdb_id=${imdbId}&limit=30`;
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
    }));
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

// ─── 主入口 ────────────────────────────────────────────────────────────

export async function searchMovie(keyword: string, page = 1, tmdbKey?: string): Promise<MovieSearchResult> {
  // Phase 1: 元数据 — 中文 TMDB + 英文 TMDB（拿英文名搜 TPB）+ 豆瓣 三路并行
  const [zhMetaRes, enMetaRes, doubanRes] = await Promise.allSettled([
    tmdbKey ? searchTMDB(keyword, tmdbKey, page, 'zh-CN').catch(() => [] as TMDBResult[]) : Promise.resolve([] as TMDBResult[]),
    tmdbKey ? searchTMDB(keyword, tmdbKey, page, 'en-US').catch(() => [] as TMDBResult[]) : Promise.resolve([] as TMDBResult[]),
    searchDouban(keyword).catch(() => [] as TMDBResult[]),
  ]);

  let results: TMDBResult[] = zhMetaRes.status === 'fulfilled' ? zhMetaRes.value : [];
  if (doubanRes.status === 'fulfilled' && doubanRes.value.length > 0) {
    results.push(...doubanRes.value);
  }
  const tmdbErrorRaw = zhMetaRes.status === 'rejected' ? String(zhMetaRes.reason) : null;
  const doubanErrorRaw = doubanRes.status === 'rejected' ? String(doubanRes.reason) : null;

  // 元数据去重（按 title 前30字符）
  const seen = new Set<string>();
  results = results.filter(item => {
    const key = item.title.toLowerCase().slice(0, 30);
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
  if (tpbKeywords.length > 0) {
    // 限制最多使用前 6 个关键词，避免过多并发请求
    const limitedKeywords = tpbKeywords.slice(0, 6);
    const TPB_CONCURRENCY = 3; // 每批最多 3 个并发

    const tpbPromises = limitedKeywords.map(title =>
      searchTPB(title).catch((e) => ({ _error: String(e) }) as unknown as ResourceItem[])
    );

    // 分批执行，避免同时发起大量请求触发限流
    const tpbRes: PromiseSettledResult<ResourceItem[]>[] = [];
    for (let i = 0; i < tpbPromises.length; i += TPB_CONCURRENCY) {
      const batch = tpbPromises.slice(i, i + TPB_CONCURRENCY);
      const batchResults = await Promise.allSettled(batch);
      tpbRes.push(...batchResults);
    }
    for (const res of tpbRes) {
      if (res.status === 'fulfilled') {
        // 检查是否是错误标记结果
        if (res.value.length === 1 && (res.value[0] as any)?._error) {
          if (!tpbError) tpbError = `TPB: ${(res.value[0] as any)._error}`;
        } else {
          allTpbResults.push(...res.value);
        }
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
  let eztvResults: ResourceItem[] = [];
  let eztvError: string | null = null;
  const tvItems = results.filter(r => r.mediaType === 'tv');
  if (tvItems.length > 0 && tmdbKey) {
    const eztvPromises = tvItems.slice(0, 5).map(async (item) => {
      const extIds = await fetchTMDBExternalIds(item.id, tmdbKey);
      if (extIds.imdb_id) {
        return await fetchEZTV(extIds.imdb_id);
      }
      return [] as ResourceItem[];
    });
    try {
      const eztvAll = await Promise.all(eztvPromises);
      eztvResults = eztvAll.flat();
    } catch (e) {
      eztvError = e instanceof Error ? e.message : String(e);
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
  });

  // 收集实际命中的源列表
  const sourceNames = new Set<string>();
  if (allTpbResults.length > 0) sourceNames.add('TPB');
  if (eztvResults.length > 0) sourceNames.add('EZTV');

  // ── 构建作品级归组数据 ──
  // 用 TMDB/豆瓣 作品标题匹配资源，替换前端粗糙的模糊匹配
  const groupedResult = groupResourcesBySubject(results, dedupedResources, {
    subjectTitles: (s) => [s.title, s.originalTitle],
    resourceTitle: (r) => r.title,
    resourceId: (r) => r.magnet,
  });

  return {
    keyword,
    page,
    results,
    resources: dedupedResources,
    total: results.length,
    resourceTotal: dedupedResources.length,
    tmdbError:  sanitizeError(tmdbErrorRaw),
    doubanError: sanitizeError(doubanErrorRaw),
    tpbError:    sanitizeError(tpbError),
    eztvError:   sanitizeError(eztvError),
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
