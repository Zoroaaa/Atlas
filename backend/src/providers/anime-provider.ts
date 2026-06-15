/**
 * AnimeProvider — 动漫搜索适配器
 *
 * 包装 anime-search.ts 的 searchAnime 函数，实现 SearchProvider 接口。
 * 数据源：Bangumi（元数据）+ Nyaa.si / Mikan / AnimeTosho / showRSS（磁力）
 */
import { SearchProvider, SearchResultBase, SearchOptions, SuggestionItem, TrendingItem } from '@/services/search-provider';
import { searchAnime } from '@/services/anime-search';

/** Bangumi 搜索/热门 API 返回的条目 */
interface BgmApiSubject {
  id: number;
  name: string;
  name_cn: string;
  images?: { common?: string };
  collection?: { collect?: number };
  rating?: { score?: number };
}

export class AnimeProvider implements SearchProvider {
  readonly id = 'anime';
  readonly name = '动漫搜索';
  readonly supportedCategories = ['anime_sources'];

  async search(keyword: string, page: number, _opts?: SearchOptions): Promise<SearchResultBase> {
    const result = await searchAnime(keyword, page);
    return { ...result, resultType: 'anime' } as unknown as SearchResultBase;
  }

  async suggestions(keyword: string): Promise<SuggestionItem[]> {
    try {
      const url = `https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}?type=2&responseGroup=small&max_results=5`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'codeseek/1.0 (https://github.com/Zoroaaa)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return [];
      const data = await r.json() as { list?: BgmApiSubject[] };
      if (!data.list?.length) return [];

      return data.list.map((s: BgmApiSubject) => ({
        text: s.name_cn || s.name || '',
        meta: { id: s.id, cover: s.images?.common || '' },
      }));
    } catch {
      return [];
    }
  }

  async trending(): Promise<TrendingItem[]> {
    try {
      // Bangumi 热门番剧 API（按收藏数排序）
      const url = 'https://api.bgm.tv/search/subject/%E3%83%9E%E3%83%B3%E3%82%AC?responseGroup=small&type=2&limit=10&sort=collect';
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'codeseek/1.0 (https://github.com/Zoroaaa)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) return [];
      const data = await r.json() as { list?: BgmApiSubject[] };
      if (!data.list?.length) return [];

      return data.list.slice(0, 10).map((s: BgmApiSubject) => ({
        keyword: s.name_cn || s.name || '',
        count: s.collection?.collect || 0,
        cover: s.images?.common || '',
        subtitle: `${s.rating?.score || '?'} 分`,
      }));
    } catch {
      return [];
    }
  }
}

/** 导出单例 */
export const animeProvider = new AnimeProvider();
