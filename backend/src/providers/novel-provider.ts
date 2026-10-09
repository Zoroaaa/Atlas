/**
 * NovelProvider — 小说搜索适配器
 *
 * 包装 novel-search.ts 的 searchNovel 函数，实现 SearchProvider 接口。
 * 数据源：Anna's Archive（HTML 抓取解析）
 * 额外注入「按用户过滤的多源跳转卡片」（与 JAV 机制一致），但保持自身 total（前端分页依赖）。
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
  /** 结果含按用户过滤的多源源列表 → 属用户态响应 */
  readonly injectsUserSources = true;

  async search(keyword: string, page: number, ctx: SearchContext): Promise<SearchResultBase> {
    const result = (await searchNovel(keyword, page)) as unknown as SearchResultBase & {
      results?: SearchSourceCard[];
    };

    // 注入多源跳转卡片（total 保持 novels 数量，前端分页依赖）
    const sources = await listSourcesByCategory(ctx.db, {
      categoryId: ctx.categoryId,
      userId: ctx.user?.userId || '',
    });
    result.results = toSourceCards(
      filterEnabledSources(sources, ctx.enabledSources ?? null),
      keyword
    );

    return result;
  }

  async suggestions(_keyword: string): Promise<{ text: string; meta?: Record<string, unknown> }[]> {
    // Anna's Archive 无搜索建议 API，返回空数组，会 fallback 到数据库历史
    return [];
  }

  async trending(): Promise<{ keyword: string; count: number }[]> {
    return [];
  }

  buildHistoryEnrichment(result: Record<string, unknown>): HistoryEnrichment | null {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    // 小说 NovelItem 置顶顺序：zxcs（知轩藏书） → 奇书网
    // 跳转卡片源（Z-Library/Anna等）由 search_sources 表注入，不在此处理
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
      || novels?.find(n => n.source === '奇书网')
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

/** 导出单例 */
export const novelProvider = new NovelProvider();