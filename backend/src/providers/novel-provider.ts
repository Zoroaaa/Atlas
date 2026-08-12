/**
 * NovelProvider — 小说搜索适配器
 *
 * 包装 novel-search.ts 的 searchNovel 函数，实现 SearchProvider 接口。
 * 数据源：Anna's Archive（HTML 抓取解析）
 */
import { SearchProvider, SearchResultBase, SearchOptions } from '@/services/search-provider';
import { searchNovel } from '@/services/novel-search';

export class NovelProvider implements SearchProvider {
  readonly id = 'novel';
  readonly name = '小说搜索';
  readonly supportedCategories = ['novel_sources'];

  async search(keyword: string, page: number, _opts?: SearchOptions): Promise<SearchResultBase> {
    const result = await searchNovel(keyword, page);
    return result as unknown as SearchResultBase;
  }

  async suggestions(_keyword: string): Promise<{ text: string; meta?: Record<string, unknown> }[]> {
    // Anna's Archive 无搜索建议 API，返回空数组，会 fallback 到数据库历史
    return [];
  }

  async trending(): Promise<{ keyword: string; count: number }[]> {
    return [];
  }
}

/** 导出单例 */
export const novelProvider = new NovelProvider();
