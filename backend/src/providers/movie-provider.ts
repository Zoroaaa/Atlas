/**
 * MovieProvider — 影视搜索适配器
 *
 * 包装 movie-search.ts 的 searchMovie 函数，实现 SearchProvider 接口。
 * 数据源：TMDB（元数据）+ 豆瓣（fallback）+ TPB / EZTV（磁力）
 */
import { SearchProvider, SearchResultBase, SearchOptions, SuggestionItem, TrendingItem } from '@/services/search-provider';
import { searchMovie } from '@/services/movie-search';

/** 默认 TMDB API Key（由外部注入，留空时 suggestions/trending 会静默跳过） */
let _tmdbApiKey: string | undefined;

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

  async search(keyword: string, page: number, opts?: SearchOptions): Promise<SearchResultBase> {
    const result = await searchMovie(keyword, page, opts?.apiKeys?.['TMDB_API_KEY']);
    return { ...result, resultType: 'movie' } as unknown as SearchResultBase;
  }

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

  async trending(): Promise<TrendingItem[]> {
    // 无 API Key 时直接返回空，避免无效请求
    if (!_tmdbApiKey) return [];
    try {
      const url = `https://api.themoviedb.org/3/trending/all/day?api_key=${_tmdbApiKey}&language=zh-CN`;
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) return [];
      const data = await r.json() as { results?: TmdbApiItem[] };
      if (!data.results?.length) return [];

      return data.results
        .slice(0, 10)
        .map((item: TmdbApiItem) => ({
          keyword: item.title || item.name || '',
          count: item.popularity || 0,
          cover: item.poster_path
            ? `https://image.tmdb.org/t/p/w92${item.poster_path}`
            : undefined,
          subtitle: `${item.vote_average || '?'} 分 · ${item.media_type === 'tv' ? '剧' : '影'}`,
        }));
    } catch {
      return [];
    }
  }
}

/** 导出单例 */
export const movieProvider = new MovieProvider();
