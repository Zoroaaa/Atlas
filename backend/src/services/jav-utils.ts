/**
 * JAV 搜索共享工具
 *
 * 从 jav.ts 路由和 jav-provider.ts 中提取的公共逻辑。
 * 两处都需要：normalizeCode / extractGidUc / parseMagnets / parseJavDetail
 */

// ─── 类型 ──────────────────────────────────────────────────────────────

export interface MagnetItem {
  name: string;
  size: string;
  date: string;
  magnet: string;
  isHD: boolean;
}

// ─── JavBus 网格项类型 ─────────────────────────────────────────────────

export interface JavItem {
  code: string;
  title: string;
  cover?: string;
  date?: string;
  actress?: string;
  source: string;
}

/** 番号格式校验：字母(2-8位) + 横杠 + 数字(2-6位) */
export function isValidCode(code: string): boolean {
  return /^[A-Z]{2,8}-\d{2,6}$/.test(code);
}

/**
 * 解析 JavBus 网格页（waterfall 区域内的 movie-box 列表）
 * 通用解析器：首页 / 无码 / genre / star / 搜索结果页均使用同一网格结构
 */
export function parseGrid(html: string, source: string): JavItem[] {
  if (!html) return [];
  const items: JavItem[] = [];
  // 截取 waterfall 区域
  const wi = html.indexOf('id="waterfall"');
  const section = wi !== -1 ? html.slice(wi, wi + 60000) : html;

  const re = /<a[^>]+class="movie-box"[^>]*href="[^"]+"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null && items.length < 30) {
    const block = m[1];
    const imgM = block.match(/<img[^>]+src="([^"]+)"/i);
    // JavBus 封面图可能是相对路径（/pics/...），统一转为绝对 URL 供前端图片代理使用
    const cover = imgM ? normalizeJavbusUrl(imgM[1]) : undefined;

    const codeM =
      block.match(/<span[^>]*class="[^"]*id[^"]*"[^>]*>([^<]+)<\/span>/i) ||
      block.match(/<date[^>]*>([A-Za-z0-9]+-\d+)<\/date>/i) ||
      block.match(/>([A-Z]{2,8}-\d{2,6})</);
    if (!codeM) continue;
    const code = normalizeCode(codeM[1].trim());
    if (!isValidCode(code)) continue;

    const titleM = block.match(/title="([^"]+)"/i);
    const title = titleM ? titleM[1].trim() : code;

    const dateM = block.match(/<date[^>]*>(\d{4}-\d{2}-\d{2})<\/date>/i);
    const date = dateM ? dateM[1] : undefined;

    items.push({ code, title, cover, date, source });
  }
  return items;
}

/** 将 JavBus 相对 URL 转为绝对 URL（封面图等资源） */
function normalizeJavbusUrl(url: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://www.javbus.com${url}`;
  return url;
}

// ─── HTTP 请求常量 ──────────────────────────────────────────────────────

export const JAV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.javbus.com/',
};

// ─── 番号标准化 ─────────────────────────────────────────────────────────

/** 将输入统一为 XXX-123 格式 */
export function normalizeCode(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s/g, '');
  if (/^[A-Z]+-\d+$/.test(s)) return s;
  const m = s.match(/^([A-Z]+)(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : s;
}

// ─── HTTP 辅助 ──────────────────────────────────────────────────────────

/** get() 返回类型 */
export type GetResult =
  | { ok: true; html: string }
  | { ok: false; error: 'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'PARSE_ERROR' };

export async function get(url: string, timeoutMs = 10000): Promise<GetResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: JAV_HEADERS, signal: ctrl.signal });
    if (!r.ok) {
      return { ok: false, error: 'HTTP_ERROR' };
    }
    const html = await r.text();
    return { ok: true, html };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'TIMEOUT' };
    }
    return { ok: false, error: 'NETWORK_ERROR' };
  } finally {
    clearTimeout(t);
  }
}

/** 兼容函数：返回空字符串而不是结构化错误（用于现有代码） */
export async function getHtml(url: string, timeoutMs = 10000): Promise<string> {
  const result = await get(url, timeoutMs);
  return result.ok ? result.html : '';
}

// ─── 页面解析 ────────────────────────────────────────────────────────────

/** 从详情页 HTML 提取 gid / uc（用于磁力 Ajax） */
export function extractGidUc(html: string): { gid: string; uc: string } | null {
  const gidM = html.match(/var\s+gid\s*=\s*(\d+)/);
  const ucM = html.match(/var\s+uc\s*=\s*(\d+)/);
  if (gidM && ucM) return { gid: gidM[1], uc: ucM[1] };
  return null;
}

/** 解析磁力 Ajax 响应 HTML → MagnetItem[] */
export function parseMagnets(html: string): MagnetItem[] {
  if (!html) return [];
  const items: MagnetItem[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const rowHtml = row[1];
    const magnetM = rowHtml.match(/href="(magnet:\?xt=[^"]+)"/i);
    if (!magnetM) continue;
    const magnet = magnetM[1];
    const nameM = rowHtml.match(/<td[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const name = nameM ? nameM[1].trim() : '';
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(rowHtml))) {
      cells.push(cell[1].replace(/<[^>]+>/g, '').trim());
    }
    const size = cells[1] ?? '';
    const date = cells[2] ?? '';
    const isHD = /hd|1080|720/i.test(name) || rowHtml.includes('btn-primary');
    items.push({ name: name || '未知', size, date, magnet, isHD });
  }
  return items;
}

/** 解析详情页主体信息（标题/封面/演员/标签等） */
export function parseJavDetail(
  html: string,
  code: string,
  detailUrl: string
): {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  duration?: string;
  publisher?: string;
  /** 导演（仅 jav.ts 路由使用） */
  director?: string;
  /** 制作商（仅 jav.ts 路由使用） */
  maker?: string;
  /** 系列（仅 jav.ts 路由使用） */
  series?: string;
  tags: string[];
  actresses: string[];
  detailUrl: string;
} {
  // 标题
  const titleM = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) ||
                 html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : code;
  const title = rawTitle.replace(/\s*-\s*JavBus\s*$/i, '').trim();

  // 封面
  const coverM = html.match(/bigImage[^>]*href="([^"]+)"/i) ||
                 html.match(/<img[^>]+class="[^"]*cover[^"]*"[^>]+src="([^"]+)"/i);
  const cover = coverM ? coverM[1] : undefined;

  // 信息提取辅助
  const infoField = (label: string): string | undefined => {
    const re = new RegExp(label + '[^:：]*[:：]\\s*<[^>]+>([^<]+)<', 'i');
    const m = html.match(re);
    if (m) return m[1].trim();
    const re2 = new RegExp(label + '[^:：]*[:：]\\s*([^<\\n]+)', 'i');
    const m2 = html.match(re2);
    return m2 ? m2[1].trim() : undefined;
  };

  const releaseDate = infoField('發行日期') ?? infoField('发行日期') ?? infoField('Release Date');
  const duration    = infoField('長度') ?? infoField('长度') ?? infoField('Length');
  const publisher   = infoField('發行商') ?? infoField('发行商') ?? infoField('Label');
  const director    = infoField('導演') ?? infoField('导演') ?? infoField('Director');
  const maker       = infoField('製作商') ?? infoField('制作商') ?? infoField('Studio');
  const series      = infoField('系列') ?? infoField('Series');

  // 类别标签
  const tags: string[] = [];
  const tagSection = html.match(/class="genre"[\s\S]{0,5000}/i)?.[0] ?? '';
  const tagRe = /<a[^>]+href="[^"]*\/genre\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let tagM: RegExpExecArray | null;
  while ((tagM = tagRe.exec(tagSection))) {
    const t = tagM[1].trim();
    if (t) tags.push(t);
  }

  // 演员
  const actressSet = new Set<string>();
  const actresses: string[] = [];
  const starRe = /<a[^>]+href="[^"]*\/star\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let starM: RegExpExecArray | null;
  while ((starM = starRe.exec(html))) {
    const name = starM[1].trim();
    if (name && name.length < 30 && !actressSet.has(name)) {
      actressSet.add(name);
      actresses.push(name);
    }
  }

  return { code, title, cover, releaseDate, duration, publisher, director, maker, series, tags, actresses, detailUrl };
}
