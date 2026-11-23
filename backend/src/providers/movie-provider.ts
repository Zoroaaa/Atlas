/**
 * MovieProvider — 影视搜索适配器，实现 SearchProvider 接口并注册到 providerRegistry。
 *
 * 包装 movie-search.ts 的 searchMovie：TMDB 元数据 + TPB / EZTV 磁力。
 * 源卡片放独立的 sourceCards 字段，不覆盖 results（results 是 TMDB 元数据契约）；
 * 响应含按用户过滤的源卡片，因此 injectsUserSources=true。
 */
import { SearchProvider, SearchResultBase, SearchContext, HistoryEnrichment, SuggestionItem } from '@/services/search-provider';
import { searchMovie } from '@/services/movie-search';
import { resolveLiveSources } from '@/services/live-sources';

/** 模块级注入的 TMDB API Key；为空时 suggestions 直接跳过，避免无效请求。 */
let _tmdbApiKey: string | undefined;

/** 注入 TMDB API Key（由运行时配置提供）。 */
export function setTmdbApiKey(key: string | undefined): void {
  _tmdbApiKey = key;
}

/** TMDB 搜索/热门 API 返回的条目 */
interface TmdbApiItem {
  id: number;
  title?: string;
  name?: string;
  media_type?: 'movie' | 'tv';
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  popularity?: number;
  vote_average?: number;
}

export class MovieProvider implements SearchProvider {
  readonly id = 'movie';
  readonly name = '影视搜索';
  readonly supportedCategories = ['movie_sources'];
  /** 响应含按用户过滤的源卡片，缓存键需按用户隔离 */
  readonly injectsUserSources = true;

  /** 影视搜索；源卡片单列 sourceCards，保持 results 为 TMDB 元数据。 */
  async search(keyword: string, page: number, ctx: SearchContext): Promise<SearchResultBase> {
    // 影视的 results 字段是 TMDB 元数据，源卡片单列 sourceCards，避免覆盖既有契约
    const { cards, skip } = await resolveLiveSources(ctx.db, {
      categoryId: ctx.categoryId,
      userId: ctx.user?.userId || '',
      disabledSources: ctx.disabledSources,
      keyword,
    });
    const result = await searchMovie(keyword, page, ctx.apiKeys?.['TMDB_API_KEY'], skip, {
      db: ctx.db,
      waitUntil: ctx.waitUntil,
    });
    return { ...result, resultType: 'movie', sourceCards: cards } as unknown as SearchResultBase;
  }

  /** 写搜索历史：取首条 TMDB 结果作为作品卡片。 */
  buildHistoryEnrichment(result: Record<string, unknown>): HistoryEnrichment | null {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    const results = (result as {
      results?: Array<{ id: number; title: string; poster: string | null; release_date?: string; first_air_date?: string; vote_average?: number }>;
    }).results;
    const firstResult = results?.[0];
    if (firstResult) {
      fields.push('title=?, cover=?, code=?');
      values.push(firstResult.title, firstResult.poster || '', `tmdb:${firstResult.id}`);
      const release = firstResult.release_date || firstResult.first_air_date;
      if (release) {
        fields.push('release_date=?');
        values.push(release);
      }
      if (firstResult.vote_average != null) {
        fields.push('subtitle=?');
        values.push(`${firstResult.vote_average} 分`);
      }
    }

    return fields.length > 0 ? { fields, values } : null;
  }

  /** TMDB 搜索建议；无 Key 或接口异常时返回空数组。 */
  async suggestions(keyword: string): Promise<SuggestionItem[]> {
    // 无 API Key 时直接返回空，避免无效请求
    if (!_tmdbApiKey) return [];
    try {
      const url = `https://api.themoviedb.org/3/search/multi?api_key=${_tmdbApiKey}&query=${encodeURIComponent(keyword)}&language=zh-CN&page=1`;
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return [];
      const data = await r.json() as { results?: TmdbApiItem[] };
      if (!data.results?.length) return [];

      return data.results
        .filter((item: TmdbApiItem) => item.media_type === 'movie' || item.media_type === 'tv')
        .slice(0, 8)
        .map((item: TmdbApiItem) => ({
          text: item.title || item.name || '',
          meta: {
            id: item.id,
            mediaType: item.media_type,
            date: item.release_date || item.first_air_date || '',
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : '',
          },
        }));
    } catch {
      return [];
    }
  }
}

export const movieProvider = new MovieProvider();
