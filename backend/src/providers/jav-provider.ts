/**
 * JavProvider — JAV 搜索适配器
 *
 * 适配 jav.ts 的搜索逻辑，实现 SearchProvider 接口。
 * 注意：JAV 搜索模式与动漫/影视不同——以番号(code)为精确匹配，
 *       走详情页解析 + 磁力提取路径。
 *
 * 共享工具（normalizeCode/parseMagnets/parseJavDetail 等）提取至 jav-utils.ts
 */
import { SearchProvider, SearchResultBase, SearchOptions } from '@/services/search-provider';
import { normalizeCode, get, extractGidUc, parseMagnets, parseJavDetail, type MagnetItem } from '@/services/jav-utils';

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
  detail?: JavDetailResult;
}

// ─── Provider 实现 ──────────────────────────────────────────────────────

export class JavProvider implements SearchProvider {
  readonly id = 'jav';
  readonly name = 'JAV搜索';
  /** JAV 不依赖 majorCategoryId 进行路由分发，由前端按 tab 判断。
   *  此处保留一个虚拟 category ID 用于 Registry 匹配。 */
  readonly supportedCategories = ['jav_sources'];

  async search(keyword: string, _page: number, _opts?: SearchOptions): Promise<JavSearchResult> {
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
      const html = await get(detailUrl, 15000);

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
        const magnetHtml = await get(magnetUrl, 12000);
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

  async suggestions(keyword: string): Promise<{ text: string; meta?: Record<string, unknown> }[]> {
    try {
      const upperKeyword = keyword.toUpperCase().trim();
      if (!upperKeyword) return [];

      // 从 JavBus 首页提取匹配的番号
      const html = await get('https://www.javbus.com/', 10000);
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
      const html = await get('https://www.javbus.com/', 10000);
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
}

/** 导出单例 */
export const javProvider = new JavProvider();
