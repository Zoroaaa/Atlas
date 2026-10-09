/**
 * MangaProvider — 漫画搜索适配器
 *
 * 包装 manga-search.ts 的 searchManga 函数，实现 SearchProvider 接口。
 * 数据源：MangaDex（漫画元数据）
 */
import { SearchProvider, SearchResultBase, SearchContext, HistoryEnrichment } from '@/services/search-provider';
import { searchManga } from '@/services/manga-search';

export class MangaProvider implements SearchProvider {
  readonly id = 'manga';
  readonly name = '漫画搜索';
  readonly supportedCategories = ['manga_sources'];

  async search(keyword: string, page: number, _ctx: SearchContext): Promise<SearchResultBase> {
    const result = await searchManga(keyword, page);
    return result as unknown as SearchResultBase;
  }

  buildHistoryEnrichment(result: Record<string, unknown>): HistoryEnrichment | null {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    // 漫画：提取首条 MangaDex 结果 → title + cover + code(manga:id) + tags
    const manga = (result as {
      manga?: Array<{ id: string; title: string; cover: string; status?: string; tags?: string[] }>;
    }).manga;
    const firstManga = manga?.[0];
    if (firstManga) {
      fields.push('title=?, cover=?, code=?');
      values.push(firstManga.title, firstManga.cover, `manga:${firstManga.id}`);
      if (firstManga.tags?.length) {
        fields.push('tags=?');
        values.push(firstManga.tags.join(','));
      }
    }

    return fields.length > 0 ? { fields, values } : null;
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