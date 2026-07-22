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
}

/** 导出单例 */
export const mangaProvider = new MangaProvider();