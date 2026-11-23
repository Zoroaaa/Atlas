/**
 * NovelProvider — 小说搜索适配器，实现 SearchProvider 接口并注册到 providerRegistry。
 *
 * 包装 novel-search.ts 的 searchNovel：抓取知轩藏书、奇书网的搜索/详情页。
 * 额外注入按用户过滤的多源跳转卡片（与 JAV 机制一致），但保持 total 为小说条数（前端分页依赖）。
 */
import {
  SearchProvider,
  SearchResultBase,
  SearchContext,
  HistoryEnrichment,
} from '@/services/search-provider';
import { searchNovel } from '@/services/novel-search';
import {
  listSourcesByCategory,
  filterEnabledSources,
  toSourceCards,
  type SearchSourceCard,
} from '@/repositories/search-source-repository';

export class NovelProvider implements SearchProvider {
  readonly id = 'novel';
  readonly name = '小说搜索';
  readonly supportedCategories = ['novel_sources'];
  /** 结果含按用户过滤的搜索源卡片 → 属用户态响应 */
  readonly injectsUserSources = true;

  /** 小说搜索 + 注入跳转卡片；total 保持小说条数，不被卡片数量覆盖。 */
  async search(keyword: string, page: number, ctx: SearchContext): Promise<SearchResultBase> {
    const result = (await searchNovel(keyword, page, { db: ctx.db })) as unknown as SearchResultBase & {
      results?: SearchSourceCard[];
    };

    // 注入多源跳转卡片（total 保持 novels 数量，前端分页依赖）
    const sources = await listSourcesByCategory(ctx.db, {
      categoryId: ctx.categoryId,
      userId: ctx.user?.userId || '',
    });
    result.results = await toSourceCards(
      ctx.db,
      filterEnabledSources(sources, ctx.disabledSources ?? null),
      keyword
    );

    return result;
  }

  /** 小说抓取源没有搜索建议接口，返回空数组，由路由回落到本地历史。 */
  async suggestions(_keyword: string): Promise<{ text: string; meta?: Record<string, unknown> }[]> {
    return [];
  }

  /** 小说抓取源没有热门榜单，返回空数组，由路由回落到本地历史。 */

  /** 写搜索历史：优先取知轩藏书条目，缺失时退到首条结果。 */
  buildHistoryEnrichment(result: Record<string, unknown>): HistoryEnrichment | null {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    // 只处理抓取到的 NovelItem；Z-Library / Anna's Archive 等卡片源由 search_sources 注入，不在此处理
    const novels = (result as {
      novels?: Array<{
        id: string;
        title: string;
        cover: string;
        author?: string;
        publisher?: string;
        format?: string;
        year?: string;
        category?: string;
        source?: string;
      }>;
    }).novels;
    const firstNovel =
      novels?.find(n => n.source === '知轩藏书')
      || novels?.[0];

    if (firstNovel) {
      fields.push('title=?, cover=?, code=?');
      values.push(firstNovel.title, firstNovel.cover, `md5:${firstNovel.id}`);
      if (firstNovel.author) {
        fields.push('actors=?');
        values.push(firstNovel.author);
      }
      if (firstNovel.publisher) {
        fields.push('publisher=?');
        values.push(firstNovel.publisher);
      }
      const tags = [firstNovel.format, firstNovel.year, firstNovel.category].filter(Boolean).join(',');
      if (tags) {
        fields.push('tags=?');
        values.push(tags);
      }
    }

    return fields.length > 0 ? { fields, values } : null;
  }
}

export const novelProvider = new NovelProvider();