/**
 * MangaProvider — 漫画搜索适配器，实现 SearchProvider 接口并注册到 providerRegistry。
 *
 * 包装 manga-search.ts 的 searchManga：MangaDex 为主源，MangaUpdates 补全/降级。
 * 响应含按用户过滤的源卡片，因此 injectsUserSources=true，路由必须按用户隔离缓存。
 */
import { SearchProvider, SearchResultBase, SearchContext, HistoryEnrichment } from '@/services/search-provider';
import { searchManga } from '@/services/manga-search';
import { resolveLiveSources } from '@/services/live-sources';
import { lookupQueryVariants } from '@/services/alias-resolver';
import { ingestMangaDexByKeyword } from '@/services/alias-ingest';

export class MangaProvider implements SearchProvider {
  readonly id = 'manga';
  readonly name = '漫画搜索';
  readonly supportedCategories = ['manga_sources'];
  /** 响应含按用户过滤的源卡片，缓存键需按用户隔离 */
  readonly injectsUserSources = true;

  /** 漫画搜索 + 源卡片；别名覆盖不足时后台异步灌入 MangaDex altTitles，不阻塞本次响应。 */
  async search(keyword: string, page: number, ctx: SearchContext): Promise<SearchResultBase> {
    const { cards, skip } = await resolveLiveSources(ctx.db, {
      categoryId: ctx.categoryId,
      userId: ctx.user?.userId || '',
      disabledSources: ctx.disabledSources,
      keyword,
    });
    const result = await searchManga(keyword, page, skip);
    // 别名覆盖不足时异步灌入 MangaDex altTitles，供其他源站复用
    if (ctx.waitUntil) {
      const variants = await lookupQueryVariants(ctx.db, keyword, 'work').catch(() => []);
      const hasDbAliases = variants.some(variant => variant.transform.startsWith('db:'));
      if (!hasDbAliases) {
        ctx.waitUntil(ingestMangaDexByKeyword(ctx.db, keyword).catch(() => 0));
      }
    }
    return { ...result, sourceCards: cards } as unknown as SearchResultBase;
  }

  /** 写搜索历史：取首条 MangaDex 结果作为作品卡片。 */
  buildHistoryEnrichment(result: Record<string, unknown>): HistoryEnrichment | null {
    const fields: string[] = [];
    const values: (string | number)[] = [];

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

  /** MangaDex 搜索建议；异常时返回空数组，由路由回落到本地历史。 */
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

  /** 漫画抓取源没有热门榜单，返回空数组，由路由回落到本地历史。 */
  async trending(): Promise<{ keyword: string; count: number }[]> {
    // 漫画没有热门搜索 API，返回空数组，会 fallback 到数据库历史
    return [];
  }
}

export const mangaProvider = new MangaProvider();