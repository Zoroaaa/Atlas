/**
 * JavProvider — JAV 搜索适配器
 *
 * JAV 搜索与动漫/影视本质不同，这里由 Provider 内部承载三条子路径：
 *   - code：以番号为精确匹配，走 JavBus 详情页解析 + 磁力提取（单条结果，无分页）
 *   - title：非番号格式 → 仅保留多源跳转卡片（在 JavBus 等站点按标题搜）
 *   - actress：JavBus 女优资料 + 作品列表 + 多源跳转卡片
 * 另外 code/title/actress 三条路径都会注入「按用户过滤的多源跳转卡片」，
 * 并将 total 覆盖为源卡片数量（前端展示依赖）。
 *
 * 共享工具（番号解析/parseMagnets/parseJavDetail 等）提取至 jav-utils.ts
 */
import {
  SearchProvider,
  SearchResultBase,
  SearchContext,
  HistoryEnrichment,
} from '@/services/search-provider';
import { inspectJavCode, isJavCodeLike, normalizeJavCode } from '@codeseek/shared/utils';
import {
  fetchJavbusDetailWithMagnets,
  getHtml,
  describeJavbusFetchError,
  type JavEntityLink,
  type JavItem,
  type MagnetItem,
} from '@/services/jav-utils';
import { fetchActresses, fetchActressWorks, type ActressProfile } from '@/services/actress-search';
import { resolveActressKeyword, lookupQueryVariants } from '@/services/alias-resolver';
import { getLibraryJavDetail } from '@/services/library-detail';
import {
  listSourcesByCategory,
  filterEnabledSources,
  toSourceCards,
  type SearchSourceCard,
} from '@/repositories/search-source-repository';

// ─── 类型定义 ────────────────────────────────────────────────────────────

export interface JavDetailResult {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  duration?: string;
  director?: string;
  maker?: string;
  publisher?: string;
  series?: string;
  /** 实体链接：前端点击后查看该导演/制作商/发行商/系列/标签的作品 */
  directorLinks?: JavEntityLink[];
  makerLinks?: JavEntityLink[];
  publisherLinks?: JavEntityLink[];
  seriesLinks?: JavEntityLink[];
  tagLinks?: JavEntityLink[];
  tags: string[];
  actresses: string[];
  magnets: MagnetItem[];
  detailUrl: string;
  /** true 表示本次结果来自本地库（命中缓存），前端据此展示「拉取 JavBus 外部源」按钮 */
  fromLibrary?: boolean;
}

export interface JavSearchResult extends SearchResultBase {
  resultType: 'jav';
  keyword: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  /** code 子模式：JavBus 详情 + 磁力 */
  detail?: JavDetailResult;
  /** 多源跳转卡片（code/title/actress 三条路径均有） */
  results?: SearchSourceCard[];
  /** actress 子模式：JavBus 女优资料 */
  actresses?: ActressProfile[];
  /** actress 子模式：JavBus 女优作品列表 */
  actressWorks?: JavItem[];
  /** actress 子模式：归一化后的日文名（供前端站内搜索链接使用） */
  normalizedKeyword?: string;
  /** code 模式：未识别为番号（title）或识别但无 JavBus 详情（sources-only） */
  fallback?: 'title' | 'sources-only';
  /** 搜索失败语义：前端据此区分「查无此号」与「源暂时不可用」，不再解析文案 */
  searchErrorKind?: 'NOT_FOUND' | 'SOURCE_UNAVAILABLE';
  /** 详情页成功但磁力接口暂时失败，落库时不能判定为「源站没有磁力」 */
  magnetFetchFailed?: boolean;
}

// ─── Provider 实现 ──────────────────────────────────────────────────────

export class JavProvider implements SearchProvider {
  readonly id = 'jav';
  readonly name = 'JAV搜索';
  /** JAV 不依赖 majorCategoryId 进行路由分发，由前端按 tab 判断。
   *  此处保留一个虚拟 category ID 用于 Registry 匹配。 */
  readonly supportedCategories = ['jav_sources'];
  /** 结果含按用户过滤的多源源列表 → 属用户态响应 */
  readonly injectsUserSources = true;

  async search(keyword: string, page: number, ctx: SearchContext): Promise<JavSearchResult> {
    if (ctx.subMode === 'actress') {
      return this.searchActress(keyword, page, ctx);
    }

    // 注入多源跳转卡片（title/code/actress 三条路径均有）
    const cards = await this.buildSourceCards(keyword, ctx);

    // 标题模式明确不查番号详情，只返回多源卡片
    if (ctx.subMode === 'title') {
      return {
        resultType: 'jav',
        keyword,
        page,
        total: cards.length,
        errors: { search: null },
        results: cards,
      };
    }

    const info = inspectJavCode(keyword);
    if (!info.recognized) {
      return {
        resultType: 'jav',
        keyword,
        page,
        total: cards.length,
        errors: { search: null },
        results: cards,
        fallback: 'title',
      };
    }

    const result = await this.searchByCode(info.code, ctx);
    result.results = cards;
    result.total = cards.length;
    if (!result.detail) result.fallback = 'sources-only';
    return result;
  }

  /** code 子模式：本地库优先（磁力校验通过即返回），未命中再抓 JavBus 详情页 + 磁力 */
  private async searchByCode(keyword: string, ctx: SearchContext): Promise<JavSearchResult> {
    const info = inspectJavCode(keyword);

    // 未识别格式：不返回硬错误，交由上层走标题回退
    if (!info.recognized) {
      return {
        resultType: 'jav',
        keyword,
        page: 1,
        total: 0,
        errors: { search: null },
        fallback: 'title',
      };
    }

    const code = info.code;

    // 本地库优先：只做磁力校验，有磁力即返回本地库数据（不做有效期控制）
    const local = await getLibraryJavDetail(ctx.db, code).catch((err) => {
      console.error('[jav-provider] library lookup failed:', err);
      return null;
    });
    if (local?.detail && local.detail.magnets.length > 0) {
      const localDetail = local.detail;
      return {
        resultType: 'jav',
        keyword,
        page: 1,
        total: localDetail.magnets.length,
        errors: { search: null },
        detail: {
          code: localDetail.code,
          title: localDetail.title,
          cover: localDetail.cover,
          releaseDate: localDetail.releaseDate,
          duration: localDetail.duration,
          director: localDetail.director,
          maker: localDetail.maker,
          publisher: localDetail.publisher,
          series: localDetail.series,
          directorLinks: localDetail.directorLinks,
          makerLinks: localDetail.makerLinks,
          publisherLinks: localDetail.publisherLinks,
          seriesLinks: localDetail.seriesLinks,
          tagLinks: localDetail.tagLinks,
          tags: localDetail.tags,
          actresses: localDetail.actresses,
          detailUrl: localDetail.detailUrl || `https://www.javbus.com/${code}`,
          magnets: localDetail.magnets.map((m) => ({
            name: m.name,
            size: m.size ?? '',
            date: m.date ?? '',
            magnet: m.magnet,
            isHD: m.isHD ?? false,
          })),
          fromLibrary: true,
        },
      };
    }

    try {
      const fetched = await fetchJavbusDetailWithMagnets(code, 15000);

      if (!fetched.ok) {
        return {
          resultType: 'jav',
          keyword,
          page: 1,
          total: 0,
          errors: { search: describeJavbusFetchError(fetched.error, code) },
          searchErrorKind: fetched.error === 'NOT_FOUND' ? 'NOT_FOUND' : 'SOURCE_UNAVAILABLE',
          fallback: 'sources-only',
        };
      }

      const { detail: baseInfo, magnets, magnetFetchFailed } = fetched.data;

      return {
        resultType: 'jav',
        keyword,
        page: 1,
        total: magnets.length,
        errors: { search: null },
        detail: { ...baseInfo, magnets },
        magnetFetchFailed,
      };
    } catch (err) {
      return {
        resultType: 'jav',
        keyword,
        page: 1,
        total: 0,
        errors: { search: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  /** actress 子模式：JavBus 女优资料 + 作品 + 多源跳转卡片 */
  private async searchActress(
    keyword: string,
    page: number,
    ctx: SearchContext
  ): Promise<JavSearchResult> {
    let actresses: ActressProfile[] = [];
    let actressError: string | null = null;
    // 先解析日文艺名：DB 别名优先，回退人工映射表 + OpenCC
    const normalizedKeyword = await resolveActressKeyword(ctx.db, keyword);
    try {
      actresses = await fetchActresses(keyword, normalizedKeyword);
    } catch (e) {
      actressError = e instanceof Error ? e.message : String(e);
      console.error('[jav-provider] javbus actress search failed:', e);
    }

    // 作品列表与女优资料抓取解耦：资料源失败时仍尽量展示 JavBus 作品
    let actressWorks: JavItem[] = [];
    let worksError: string | null = null;
    try {
      actressWorks = await fetchActressWorks(keyword, normalizedKeyword);
    } catch (e) {
      worksError = e instanceof Error ? e.message : String(e);
      console.error('[jav-provider] javbus actress works fetch failed:', e);
    }

    const results = await this.buildSourceCards(keyword, ctx);

    return {
      resultType: 'jav',
      keyword,
      // 归一化后的日文名：供前端「JavBus 女优搜索」链接使用（原文搜不到含假名女优）
      normalizedKeyword,
      page,
      total: results.length,
      errors: { search: actressError, works: worksError },
      searchErrorKind: actressError ? 'SOURCE_UNAVAILABLE' : undefined,
      actresses,
      actressWorks,
      results,
    };
  }

  /** 查询用户启用的 JAV 源并生成多源跳转卡片 */
  private async buildSourceCards(
    keyword: string,
    ctx: SearchContext
  ): Promise<SearchSourceCard[]> {
    const sources = await listSourcesByCategory(ctx.db, {
      categoryId: ctx.categoryId,
      userId: ctx.user?.userId || '',
    });
    // 人物子模式优先用 person 别名，其余按作品名处理
    const entityType = ctx.subMode === 'actress' ? 'person' : 'work';
    const variants = await lookupQueryVariants(ctx.db, keyword, entityType).catch(() => undefined);
    return toSourceCards(
      ctx.db,
      filterEnabledSources(sources, ctx.disabledSources ?? null),
      keyword,
      { variants, entityType }
    );
  }

  async suggestions(keyword: string): Promise<{ text: string; meta?: Record<string, unknown> }[]> {
    try {
      const normalized = normalizeJavCode(keyword);
      if (!normalized) return [];
      // WAAA-624 与 WAAA624 视为同一番号，匹配时忽略横杠/下划线
      const compactKeyword = normalized.replace(/[-_]/g, '');
      if (!compactKeyword) return [];

      // 从 JavBus 首页提取匹配的番号
      const html = await getHtml('https://www.javbus.com/', 10000);
      if (!html) return [];

      const codes: string[] = [];
      const seen = new Set<string>();
      const re = /<span[^>]*class="[^"]*id[^"]*"[^>]*>([A-Za-z0-9]+[-_][A-Za-z0-9]+)<\/span>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const c = normalizeJavCode(m[1]);
        if (!isJavCodeLike(c)) continue;
        const compact = c.replace(/[-_]/g, '');
        if (compact.startsWith(compactKeyword) || compact.includes(compactKeyword)) {
          if (codes.length < 10 && !seen.has(compact)) {
            seen.add(compact);
            codes.push(c);
          }
        }
      }
      return codes.map(c => ({ text: c }));
    } catch {
      return [];
    }
  }

  async trending(): Promise<{ keyword: string; count: number; cover?: string; subtitle?: string }[]> {
    try {
      const html = await getHtml('https://www.javbus.com/', 10000);
      if (!html) return [];

      const items: { keyword: string; count: number; cover?: string; subtitle?: string }[] = [];
      const re = /<a[^>]+class="movie-box"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;

      while ((m = re.exec(html)) !== null && items.length < 10) {
        const block = m[1];
        const codeM = block.match(/<span[^>]*class="[^"]*id[^"]*"[^>]*>([A-Za-z0-9]+[-_][A-Za-z0-9]+)<\/span>/i);
        if (!codeM) continue;

        const code = normalizeJavCode(codeM[1]);
        if (!isJavCodeLike(code)) continue;
        const titleM = block.match(/title="([^"]+)"/i);
        const coverM = block.match(/<img[^>]+src="([^"]+)"/i);

        items.push({
          keyword: code,
          count: 0,
          subtitle: titleM ? titleM[1].slice(0, 30) : undefined,
          cover: coverM ? coverM[1] : undefined,
        });
      }
      return items;
    } catch {
      return [];
    }
  }

  buildHistoryEnrichment(result: Record<string, unknown>): HistoryEnrichment | null {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    const detail = (result as {
      detail?: {
        code: string;
        title: string;
        cover?: string;
        actresses?: string[];
        duration?: string;
        releaseDate?: string;
        publisher?: string;
        tags?: string[];
      };
    }).detail;

    if (detail) {
      // JAV 番号搜索：提取详情数据 → title + cover + code(番号) + actors + duration + release_date + publisher + tags
      fields.push('title=?, cover=?');
      values.push(detail.title, detail.cover || '');
      if (detail.code) {
        fields.push('code=?');
        values.push(detail.code);
      }
      if (detail.actresses?.length) {
        fields.push('actors=?');
        values.push(detail.actresses.join(','));
      }
      if (detail.duration) {
        fields.push('duration=?');
        values.push(detail.duration);
      }
      if (detail.releaseDate) {
        fields.push('release_date=?');
        values.push(detail.releaseDate);
      }
      if (detail.publisher) {
        fields.push('publisher=?');
        values.push(detail.publisher);
      }
      if (detail.tags?.length) {
        fields.push('tags=?');
        values.push(detail.tags.join(','));
      }
    } else {
      // JAV 女优搜索（无 detail，有 actresses）：提取首位女优 → title + cover + code(actress:id) + actors + subtitle + tags
      const actresses = (result as {
        actresses?: Array<{
          id: string;
          name: string;
          cover?: string;
          ruby?: string;
          romaji?: string;
          tags?: string[];
        }>;
      }).actresses;
      const firstActress = actresses?.[0];
      if (firstActress) {
        fields.push('title=?, cover=?, code=?');
        values.push(firstActress.name, firstActress.cover || '', `actress:${firstActress.id}`);
        fields.push('actors=?');
        values.push(firstActress.name);
        const subtitle = [firstActress.ruby, firstActress.romaji].filter(Boolean).join(' / ');
        if (subtitle) {
          fields.push('subtitle=?');
          values.push(subtitle);
        }
        if (firstActress.tags?.length) {
          fields.push('tags=?');
          values.push(firstActress.tags.join(','));
        }
      }
    }

    return fields.length > 0 ? { fields, values } : null;
  }
}

/** 导出单例 */
export const javProvider = new JavProvider();