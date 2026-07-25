/**
 * MangaProvider — 漫画搜索适配器
 *
 * 包装 manga-search.ts 的 searchManga 函数，实现 SearchProvider 接口。
 * 数据源：MangaDex（漫画元数据）
 */
import { SearchProvider, SearchResultBase, SearchOptions } from '@/services/search-provider';
import { searchManga } from '@/services/manga-search';

export class MangaProvider implements SearchProvider {
  readonly id = 'manga';
  readonly name = '漫画搜索';
  readonly supportedCategories = ['manga_sources'];

  async search(keyword: string, page: number, _opts?: SearchOptions): Promise<SearchResultBase> {
    const result = await searchManga(keyword, page);
    return result as unknown as SearchResultBase;
  }

  async suggestions(keyword: string): Promise<{ text: string; meta?: Record<string, unknown> }[]> {
    try {
      const trimmedKeyword = keyword.trim();
      if (!trimmedKeyword) return [];

      // MangaDex 搜索建议 API（8 秒超时,避免前端自动补全卡死）
      const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(trimmedKeyword)}&limit=10&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Atlas/1.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return [];

      const data = await response.json() as { data?: Array<{ attributes?: { title?: Record<string, string> } }> };
      const items = (data.data || []).slice(0, 10).map(manga => {
        const title = manga.attributes?.title?.en || manga.attributes?.title?.ja || Object.values(manga.attributes?.title || {})[0] || '';
        return { text: title };
      });

      return items;
    } catch {
      return [];
    }
  }

  async trending(): Promise<{ keyword: string; count: number }[]> {
    // 漫画没有热门搜索 API，返回空数组，会 fallback 到数据库历史
    return [];
  }
}

/** 导出单例 */
export const mangaProvider = new MangaProvider();