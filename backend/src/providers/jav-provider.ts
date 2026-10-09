/**
 * JavProvider — JAV 搜索适配器
 *
 * JAV 搜索与动漫/影视本质不同，这里由 Provider 内部承载三条子路径：
 *   - code：以番号为精确匹配，走 JavBus 详情页解析 + 磁力提取（单条结果，无分页）
 *   - title：非番号格式 → 仅保留多源跳转卡片（在 JavBus 等站点按标题搜）
 *   - actress：minnano 女优资料 + JavBus 作品列表 + 多源跳转卡片
 * 另外 code/title/actress 三条路径都会注入「按用户过滤的多源跳转卡片」，
 * 并将 total 覆盖为源卡片数量（前端展示依赖）。
 *
 * 共享工具（normalizeCode/parseMagnets/parseJavDetail 等）提取至 jav-utils.ts
 */
import {
  SearchProvider,
  SearchResultBase,
  SearchContext,
  HistoryEnrichment,
} from '@/services/search-provider';
import {
  normalizeCode,
  getHtml,
  extractGidUc,
  parseMagnets,
  parseJavDetail,
  type MagnetItem,
  type JavItem,
} from '@/services/jav-utils';
import { fetchActresses, fetchActressWorks, type ActressProfile } from '@/services/actress-search';
import { normalizeActressKeyword } from '@/services/actress-name-map';
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
  publisher?: string;
  tags: string[];
  actresses: string[];
  magnets: MagnetItem[];
  detailUrl: string;
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
  /** actress 子模式：minnano 女优资料 */
  actresses?: ActressProfile[];
  /** actress 子模式：JavBus 女优作品列表 */
  actressWorks?: JavItem[];
  /** actress 子模式：归一化后的日文名（供前端站内搜索链接使用） */
  normalizedKeyword?: string;
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

    const result = await this.searchByCode(keyword);
    // 注入多源跳转卡片，并将 total 覆盖为源数量（前端分页/展示依赖）
    const cards = await this.buildSourceCards(keyword, ctx);
    result.results = cards;
    result.total = cards.length;
    return result;
  }

  /** code / title 子模式：抓 JavBus 详情页 + 磁力 */
  private async searchByCode(keyword: string): Promise<JavSearchResult> {
    const code = normalizeCode(keyword);

    // 非标准番号格式 → 返回空结果（不抛错）
    if (!/^[A-Z]{2,8}-\d{2,6}$/.test(code)) {
      return {
        resultType: 'jav',
        keyword,
        page: 1,
        total: 0,
        errors: { search: '请输入有效的番号格式（如 ABP-123）' },
      };
    }

    try {
      const detailUrl = `https://www.javbus.com/${code}`;
      const html = await getHtml(detailUrl, 15000);

      if (!html || html.length < 500) {
        return {
          resultType: 'jav',
          keyword,
          page: 1,
          total: 0,
          errors: { search: `未找到番号 ${code}` },
        };
      }

      // 解析基本信息（使用共享的 parseJavDetail）
      const baseInfo = parseJavDetail(html, code, detailUrl);

      // 提取磁力链接
      let magnets: MagnetItem[] = [];
      const gidUc = extractGidUc(html);
      if (gidUc) {
        const magnetUrl = `https://www.javbus.com/ajax/uncledatoolsbyajax.php?lang=zh&gid=${gidUc.gid}&uc=${gidUc.uc}&floor=${Date.now()}`;
        const magnetHtml = await getHtml(magnetUrl, 12000);
        magnets = parseMagnets(magnetHtml);
      }

      return {
        resultType: 'jav',
        keyword,
        page: 1,
        total: magnets.length,
        errors: { search: null },
        detail: { ...baseInfo, magnets },
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

  /** actress 子模式：minnano 女优资料 + JavBus 作品 + 多源跳转卡片 */
  private async searchActress(
    keyword: string,
    page: number,
    ctx: SearchContext
  ): Promise<JavSearchResult> {
    let actresses: ActressProfile[] = [];
    let actressError: string | null = null;
    try {
      actresses = await fetchActresses(keyword);
    } catch (e) {
      actressError = String(e);
      console.error('[jav-provider] minnano actress search failed:', e);
    }

    // minnano 女优搜索成功返回数据后，补充抓取 JavBus 女优作品列表
    // 关键词复用 normalizeActressKeyword 归一化结果（日文名），确保 JavBus 可命中
    let actressWorks: JavItem[] = [];
    if (actresses.length > 0) {
      try {
        actressWorks = await fetchActressWorks(keyword);
      } catch (e) {
        console.error('[jav-provider] javbus actress works fetch failed:', e);
      }
    }

    const results = await this.buildSourceCards(keyword, ctx);

    return {
      resultType: 'jav',
      keyword,
      // 归一化后的日文名：供前端「minnano 站内搜索」链接使用（原文搜不到含假名女优）
      normalizedKeyword: normalizeActressKeyword(keyword),
      page,
      total: results.length,
      errors: { search: actressError },
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
    return toSourceCards(filterEnabledSources(sources, ctx.enabledSources ?? null), keyword);
  }

  async suggestions(keyword: string): Promise<{ text: string; meta?: Record<string, unknown> }[]> {
    try {
      const upperKeyword = keyword.toUpperCase().trim();
      if (!upperKeyword) return [];

      // 从 JavBus 首页提取匹配的番号
      const html = await getHtml('https://www.javbus.com/', 10000);
      if (!html) return [];

      const codes: string[] = [];
      const re = /<span[^>]*class="[^"]*id[^"]*"[^>]*>([A-Za-z0-9]+-\d+)<\/span>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const c = normalizeCode(m[1]);
        if (c.startsWith(upperKeyword) || c.includes(upperKeyword)) {
          if (codes.length < 10 && !codes.includes(c)) codes.push(c);
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
        const codeM = block.match(/<span[^>]*class="[^"]*id[^"]*"[^>]*>([A-Za-z0-9]+-\d+)<\/span>/i);
        if (!codeM) continue;

        const code = normalizeCode(codeM[1]);
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