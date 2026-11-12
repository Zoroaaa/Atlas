/**
 * AnimeProvider — 动漫搜索适配器
 *
 * 包装 anime-search.ts 的 searchAnime 函数，实现 SearchProvider 接口。
 * 数据源：Bangumi（元数据）+ Nyaa.si / Mikan / AnimeTosho / DMHY（磁力）
 */
import { SearchProvider, SearchResultBase, SearchContext, HistoryEnrichment, SuggestionItem, TrendingItem } from '@/services/search-provider';
import { searchAnime } from '@/services/anime-search';
import { resolveLiveSources } from '@/services/live-sources';
import { lookupQueryVariants } from '@/services/alias-resolver';
import { ingestBangumiSubjects } from '@/services/alias-ingest';

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
  /** 响应含按用户过滤的源卡片，缓存键需按用户隔离 */
  readonly injectsUserSources = true;

  async search(keyword: string, page: number, ctx: SearchContext): Promise<SearchResultBase> {
    // 只为真实在跑的抓取器出卡片；用户关掉的源同时跳过其抓取
    const { cards, skip } = await resolveLiveSources(ctx.db, {
      categoryId: ctx.categoryId,
      userId: ctx.user?.userId || '',
      disabledSources: ctx.disabledSources,
      keyword,
    });
    const result = await searchAnime(keyword, page, skip);
    // 别名覆盖不足时，用本次 Bangumi 结果异步补别名（不额外发请求）
    if (ctx.waitUntil) {
      const variants = await lookupQueryVariants(ctx.db, keyword, 'work').catch(() => []);
      const hasDbAliases = variants.some(variant => variant.transform.startsWith('db:'));
      const bgm = (result as { bgm?: Array<{ id: number; name: string; nameCN: string }> }).bgm ?? [];
      if (!hasDbAliases && bgm.length > 0) {
        ctx.waitUntil(ingestBangumiSubjects(ctx.db, bgm).catch(() => 0));
      }
    }
    return { ...result, resultType: 'anime', sourceCards: cards } as unknown as SearchResultBase;
  }

  buildHistoryEnrichment(result: Record<string, unknown>): HistoryEnrichment | null {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    // 动漫：提取首条 Bangumi 元数据 → title + cover + code(bgm:id) + tags + studio(publisher)
    const bgm = (result as {
      bgm?: Array<{ id: number; name: string; nameCN: string; cover: string; tags?: string[]; studio?: string; rating?: number }>;
    }).bgm;
    const firstBgm = bgm?.[0];
    if (firstBgm) {
      fields.push('title=?, cover=?, code=?');
      values.push(firstBgm.nameCN || firstBgm.name, firstBgm.cover, `bgm:${firstBgm.id}`);
      if (firstBgm.tags?.length) {
        fields.push('tags=?');
        values.push(firstBgm.tags.join(','));
      }
      if (firstBgm.studio) {
        fields.push('publisher=?');
        values.push(firstBgm.studio);
      }
      if (firstBgm.rating != null) {
        fields.push('subtitle=?');
        values.push(`${firstBgm.rating} 分`);
      }
    }

    return fields.length > 0 ? { fields, values } : null;
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
      // Bangumi v0 排行榜：type=2 动画，sort=rank 按站内排名。
      // 旧实现拿关键词「マンガ」以 type=2 去搜，返回的是「与漫画相关的动画」，语义是错的。
      const url = 'https://api.bgm.tv/v0/subjects?type=2&sort=rank&limit=10';
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'codeseek/1.0 (https://github.com/Zoroaaa)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) return [];
      const data = await r.json() as { data?: BgmApiSubject[] };
      if (!data.data?.length) return [];

      return data.data.slice(0, 10).map((s: BgmApiSubject) => ({
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
