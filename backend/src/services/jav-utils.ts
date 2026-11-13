/**
 * JAV 搜索共享工具
 *
 * 从 jav.ts 路由和 jav-provider.ts 中提取的公共逻辑。
 * 两处都需要：番号解析 / extractGidUc / parseMagnets / parseJavDetail
 *
 * 番号格式规则统一来自 @codeseek/shared/utils（前后端唯一事实来源）。
 */
import {
  isJavCodeLike,
  javCodeLookupVariants,
  normalizeJavCode,
} from '@codeseek/shared/utils';

export { isJavCodeLike, normalizeJavCode, javCodeLookupVariants };

// ─── 类型 ──────────────────────────────────────────────────────────────

export interface MagnetItem {
  name: string;
  size: string;
  date: string;
  magnet: string;
  isHD: boolean;
}

/** JavBus 实体分类：导演 / 制作商 / 发行商 / 系列 / 标签 */
export type JavEntityKind = 'director' | 'studio' | 'label' | 'series' | 'tag';

/** 详情页字段上的实体链接（用于「点击导演/制作商/发行商/系列/标签查看作品」） */
export interface JavEntityLink {
  kind: JavEntityKind;
  name: string;
  /** JavBus 实体列表页路径，如 /director/o7 */
  path: string;
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
      block.match(/<date[^>]*>([A-Za-z0-9]+[-_][A-Za-z0-9]+)<\/date>/i) ||
      block.match(/>([A-Z0-9]{2,10}[-_][A-Z0-9]{1,8})</);
    if (!codeM) continue;
    const code = normalizeJavCode(codeM[1].trim());
    if (!isJavCodeLike(code)) continue;

    const titleM = block.match(/title="([^"]+)"/i);
    const title = titleM ? titleM[1].trim() : code;

    const dateM = block.match(/<date[^>]*>(\d{4}-\d{2}-\d{2})<\/date>/i);
    const date = dateM ? dateM[1] : undefined;

    items.push({ code, title, cover, date, source });
  }
  return items;
}

/** 将 JavBus 相对 URL 转为绝对 URL（封面图等资源） */
export function normalizeJavbusUrl(url: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://www.javbus.com${url}`;
  return url;
}

// ─── JavBus 女优列表解析 ────────────────────────────────────────────────

/** JavBus 女优列表项（/actresses 与 /searchstar/ 结构一致） */
export interface ActressListEntry {
  /** star slug，如 2xi */
  key: string;
  name: string;
  cover?: string;
}

/**
 * 解析 JavBus 女优列表（/actresses 页与 /searchstar/{keyword} 页共用同一 avatar-box 结构）
 *
 *   <a class="avatar-box text-center" href="https://www.javbus.com/star/2xi">
 *     <div class="photo-frame"><img src="/pics/actress/2xi_a.jpg" title="葵つかさ"></div>
 *     <div class="photo-info"><span>葵つかさ</span></div>
 *   </a>
 */
export function parseActressList(html: string, limit = 50): ActressListEntry[] {
  if (!html) return [];
  const entries: ActressListEntry[] = [];
  const re = /href="https?:\/\/www\.javbus\.com\/star\/([a-z0-9]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && entries.length < limit) {
    const key = m[1].trim();
    const block = m[2];
    // 优先从 img title 提取名字，其次从 span
    const titleM = block.match(/title="([^"]+)"/i);
    const spanM = block.match(/<span[^>]*>([^<]+)<\/span>/i);
    const name = (titleM ? titleM[1] : spanM ? spanM[1] : '').trim();
    if (!key || !name || name.length > 30) continue;
    if (entries.find(e => e.key === key)) continue;
    const imgM = block.match(/<img[^>]+src="([^"]+)"/i);
    entries.push({ key, name, cover: imgM ? normalizeJavbusUrl(imgM[1]) : undefined });
  }
  return entries;
}

// ─── HTTP 请求常量 ──────────────────────────────────────────────────────

export const JAV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7',
  // 不手动声明 Accept-Encoding：Workers/undici 只有在由运行时协商时才会自动解压，
  // 手动设置后可能拿到未解压的二进制体，文本解析会得到空结果，进而误判成「源站无磁力」。
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.javbus.com/',
};

// ─── HTTP 辅助 ──────────────────────────────────────────────────────────

/** get() 返回类型 */
export type GetResult =
  | { ok: true; html: string; /** 跟随重定向后的最终地址，用于识别验证页 */ finalUrl: string }
  | { ok: false; error: 'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'PARSE_ERROR'; status?: number };

export async function get(
  url: string,
  timeoutMs = 10000,
  extraHeaders: Record<string, string> = {}
): Promise<GetResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { ...JAV_HEADERS, ...extraHeaders }, signal: ctrl.signal });
    if (!r.ok) {
      return { ok: false, error: 'HTTP_ERROR', status: r.status };
    }
    const html = await r.text();
    return { ok: true, html, finalUrl: r.url || url };
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

/** 详情抓取的失败种类：用于把「源异常」和「确实没有这个番号」区分开 */
export type JavbusFetchError = 'NOT_FOUND' | 'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'PARSE_ERROR';

export type JavbusDetailFetch =
  | { ok: true; html: string; usedCode: string }
  | { ok: false; error: JavbusFetchError };

/**
 * 失败原因 → 面向用户的文案。
 * 「未找到」与「源不可用」必须分开：把超时/限流说成「查无此号」会直接摧毁信任。
 */
export function describeJavbusFetchError(error: JavbusFetchError, code: string): string {
  switch (error) {
    case 'NOT_FOUND':
      return `未找到番号 ${code}`;
    case 'TIMEOUT':
      return 'JavBus 响应超时，请稍后重试';
    case 'NETWORK_ERROR':
      return 'JavBus 连接失败，请稍后重试';
    case 'HTTP_ERROR':
      return 'JavBus 暂时不可用（可能触发访问限制），请稍后重试';
    case 'PARSE_ERROR':
      return 'JavBus 返回内容异常，请稍后重试';
  }
}

/**
 * 失败负缓存：源站抖动/限流时，同一番号在 60 秒内不再重复打 4 个变体。
 * Workers isolate 内内存缓存即可，顺便保护源站不被同一用户的重复搜索放大。
 */
const NEGATIVE_CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_MAX_ENTRIES = 500;
const negativeCache = new Map<string, { error: JavbusFetchError; expiresAt: number }>();

function readNegativeCache(key: string): JavbusFetchError | null {
  const hit = negativeCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    negativeCache.delete(key);
    return null;
  }
  return hit.error;
}

function writeNegativeCache(key: string, error: JavbusFetchError): void {
  if (negativeCache.size >= NEGATIVE_CACHE_MAX_ENTRIES) {
    // Map 保持插入顺序，删除最早的一条即可
    const oldest = negativeCache.keys().next().value;
    if (oldest !== undefined) negativeCache.delete(oldest);
  }
  negativeCache.set(key, { error, expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
}

/**
 * 按共享查询变体抓 JavBus 详情页。
 * 首个变体 10 秒超时，后续每个最多 6 秒；最多 4 个变体，避免单次搜索拖太久。
 *
 * 返回值区分「未找到」（所有变体均 404）与「源不可用」（超时/网络/限流/内容异常），
 * 上层据此决定展示「查无此号」还是「源暂时不可用」。
 */
export async function fetchJavbusDetailHtml(
  code: string,
  timeoutMs = 10000
): Promise<JavbusDetailFetch> {
  const cacheKey = normalizeJavCode(code);
  const cachedError = readNegativeCache(cacheKey);
  if (cachedError) return { ok: false, error: cachedError };

  const variants = javCodeLookupVariants(code);
  const candidates = variants.length > 0 ? variants : [normalizeJavCode(code)];
  const failures: JavbusFetchError[] = [];

  for (let index = 0; index < candidates.length; index++) {
    const usedCode = candidates[index];
    if (!usedCode) continue;
    const result = await get(
      `https://www.javbus.com/${usedCode}`,
      index === 0 ? timeoutMs : Math.min(6000, timeoutMs)
    );

    if (result.ok) {
      // 被重定向到验证页：不是有效详情，按「源暂时不可用」处理，不能解析成缺字段
      if (isJavbusVerificationPage(result.finalUrl, result.html)) {
        failures.push('HTTP_ERROR');
        continue;
      }
      // 200 但内容过短：站点返回了维护/验证页，不是有效详情
      if (result.html.length >= 500) {
        return { ok: true, html: result.html, usedCode };
      }
      failures.push('PARSE_ERROR');
      continue;
    }

    failures.push(result.error === 'HTTP_ERROR' && result.status === 404 ? 'NOT_FOUND' : result.error);
  }

  // 所有变体都 404 才是「没有这个番号」；只要有一个是超时/网络/限流，就归为源不可用
  const error: JavbusFetchError = failures.every((e) => e === 'NOT_FOUND')
    ? 'NOT_FOUND'
    : failures.find((e) => e !== 'NOT_FOUND') ?? 'HTTP_ERROR';

  writeNegativeCache(cacheKey, error);
  return { ok: false, error };
}

// ─── 页面解析 ────────────────────────────────────────────────────────────

/** 从详情页 HTML 提取 gid / uc（用于磁力 Ajax） */
export function extractGidUc(html: string): { gid: string; uc: string } | null {
  const gidM = html.match(/var\s+gid\s*=\s*(\d+)/);
  const ucM = html.match(/var\s+uc\s*=\s*(\d+)/);
  if (gidM && ucM) return { gid: gidM[1], uc: ucM[1] };
  return null;
}

/**
 * 是否被重定向/返回了 JavBus 的访问验证页。
 *
 * 验证页有时仍会带上原详情页内容（因此不能只看正文），
 * 最终 URL 命中 /doc/driver-verify 是最可靠信号。
 */
export function isJavbusVerificationPage(finalUrl: string, html = ''): boolean {
  if (/\/doc\/(?:driver|age)[-_]?verify/i.test(finalUrl)) return true;
  // 没有 gid 的验证页（正常详情页一定带 var gid）
  if (/var\s+gid\s*=/.test(html)) return false;
  return /driver[-_]?verify|age[-_]?verification|年齡確認|年龄确认/i.test(html);
}

/**
 * 磁力接口的「源站确实没有磁力」响应。
 *
 * JavBus 没有磁力时只返回一段隐藏 loading 的脚本（实测约 92 字节），
 * 不含表格、不含磁力链接。除此之外的 200 响应都必须视为抓取失败：
 * 验证页、限流页、压缩后未解压的二进制体都可能「非空但解析不出磁力」。
 */
export function isJavbusEmptyMagnetResponse(html: string): boolean {
  const text = html.trim();
  if (text === '') return true;
  if (/<tr[\s>]/i.test(text)) return false;
  return text.length <= 600 && /movie-loading/i.test(text);
}

/** 解析磁力 Ajax 响应 HTML → MagnetItem[] */
export function parseMagnets(html: string): MagnetItem[] {
  if (!html) return [];
  const items: MagnetItem[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html)) !== null) {
    const rowHtml = row[1];
    // 新版页面把磁力同时放在 href 与 onclick="window.open('magnet:...')" 里；
    // 只认 href 会在部分模板下漏掉整行。
    const magnetM =
      rowHtml.match(/href="(magnet:\?xt=[^"]+)"/i) ||
      rowHtml.match(/window\.open\('(magnet:\?xt=[^']+)'/i);
    if (!magnetM) continue;
    // HTML 实体在属性里常被转义成 &amp;，入库前还原成合法 magnet URL
    const magnet = magnetM[1].replace(/&amp;/g, '&');
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

/**
 * 只接受 JavBus 自身的实体列表页路径，避免把详情页里的任意 href
 * 当成可请求地址（前端会把它回传给实体作品接口）。
 */
const JAVBUS_ENTITY_PATH_RE = /^\/(?:uncensored\/)?(?:director|studio|label|series|genre)\/[a-z0-9]+$/i;

export function normalizeJavbusEntityPath(raw: string): string | undefined {
  try {
    const url = new URL(raw, 'https://www.javbus.com');
    if (url.hostname !== 'www.javbus.com' && url.hostname !== 'javbus.com') return undefined;
    const path = url.pathname.replace(/\/+$/, '');
    return JAVBUS_ENTITY_PATH_RE.test(path) ? path : undefined;
  } catch {
    return undefined;
  }
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
  /** 多值原文（JavBus 同一字段可能挂多个链接） */
  publishers?: string[];
  directors?: string[];
  makers?: string[];
  seriesList?: string[];
  /** 实体链接（导演/制作商/发行商/系列/标签），供前端点击查看同类作品 */
  directorLinks?: JavEntityLink[];
  makerLinks?: JavEntityLink[];
  publisherLinks?: JavEntityLink[];
  seriesLinks?: JavEntityLink[];
  tagLinks?: JavEntityLink[];
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
  //
  // JavBus 的字段值有两种形态：
  //   <p><span class="header">發行日期:</span> 2021-02-18</p>       ← 纯文本
  //   <p><span class="header">導演:</span> <a href="/director/o7">苺原</a></p>  ← 链接
  // 链接里的 href 是实体列表页（/director、/studio、/label、/series），
  // 前端要支持点击查看同类作品，所以这里同时保留 href 与显示名。
  const infoEntries = (labels: string[]): Array<{ name: string; path?: string }> => {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blockRe = new RegExp(escaped + '[^:：]*[:：]([\\s\\S]{0,300}?)(?=<\\/p>|<p\\b)', 'i');
      const blockM = html.match(blockRe);
      if (blockM) {
        const entries: Array<{ name: string; path?: string }> = [];
        const anchorRe = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
        let anchor: RegExpExecArray | null;
        while ((anchor = anchorRe.exec(blockM[1])) !== null) {
          const name = anchor[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          if (!name || entries.some((entry) => entry.name === name)) continue;
          const path = normalizeJavbusEntityPath(anchor[1]);
          entries.push(path ? { name, path } : { name });
        }
        if (entries.length > 0) return entries;

        const text = blockM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text) return [{ name: text }];
      }

      // 回退：标签后直接是文本（部分镜像站结构更简单）
      const textRe = new RegExp(escaped + '[^:：]*[:：]\\s*([^<\\n]+)', 'i');
      const textM = html.match(textRe);
      const fallback = textM?.[1].trim();
      if (fallback) return [{ name: fallback }];
    }
    return [];
  };
  const infoValues = (labels: string[]): string[] => infoEntries(labels).map((entry) => entry.name);
  const joined = (labels: string[]): string | undefined => {
    const values = infoValues(labels);
    return values.length > 0 ? values.join(' / ') : undefined;
  };
  const toLinks = (
    kind: JavEntityKind,
    entries: Array<{ name: string; path?: string }>
  ): JavEntityLink[] | undefined => {
    const links = entries
      .filter((entry): entry is { name: string; path: string } => Boolean(entry.path))
      .map((entry) => ({ kind, name: entry.name, path: entry.path }));
    return links.length > 0 ? links : undefined;
  };

  const publisherEntries = infoEntries(['發行商', '发行商', 'Label']);
  const directorEntries = infoEntries(['導演', '导演', 'Director']);
  const makerEntries = infoEntries(['製作商', '制作商', 'Studio']);
  const seriesEntries = infoEntries(['系列', 'Series']);

  const publishers = publisherEntries.map((entry) => entry.name);
  const directors = directorEntries.map((entry) => entry.name);
  const makers = makerEntries.map((entry) => entry.name);
  const seriesList = seriesEntries.map((entry) => entry.name);
  const publisherLinks = toLinks('label', publisherEntries);
  const directorLinks = toLinks('director', directorEntries);
  const makerLinks = toLinks('studio', makerEntries);
  const seriesLinks = toLinks('series', seriesEntries);

  const releaseDate = joined(['發行日期', '发行日期', 'Release Date']);
  const duration = joined(['長度', '长度', 'Length']);
  const publisher = publishers.join(' / ') || undefined;
  const director = directors.join(' / ') || undefined;
  const maker = makers.join(' / ') || undefined;
  const series = seriesList.join(' / ') || undefined;

  // 类别标签（同时保留 /genre/xx 链接，前端点击后与导演/发行商等走同一套实体卡片）
  const tags: string[] = [];
  const tagLinks: JavEntityLink[] = [];
  const tagSection = html.match(/class="genre"[\s\S]{0,5000}/i)?.[0] ?? '';
  const tagRe = /<a[^>]+href="([^"]*\/genre\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let tagM: RegExpExecArray | null;
  while ((tagM = tagRe.exec(tagSection))) {
    const name = tagM[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    if (!tags.includes(name)) tags.push(name);
    const path = normalizeJavbusEntityPath(tagM[1]);
    if (path && !tagLinks.some((link) => link.name === name)) {
      tagLinks.push({ kind: 'tag', name, path });
    }
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

  return {
    code, title, cover, releaseDate, duration, publisher, director, maker, series,
    publishers, directors, makers, seriesList,
    directorLinks, makerLinks, publisherLinks, seriesLinks, tagLinks,
    tags, actresses, detailUrl,
  };
}

export interface JavbusDetailWithMagnets {
  detail: ReturnType<typeof parseJavDetail>;
  magnets: MagnetItem[];
  detailUrl: string;
  usedCode: string;
  /** 磁力接口本身失败（超时/被拦），不代表源站没有磁力 */
  magnetFetchFailed: boolean;
}

export type JavbusDetailWithMagnetsResult =
  | { ok: true; data: JavbusDetailWithMagnets }
  | { ok: false; error: JavbusFetchError };

interface MagnetFetchOutcome {
  magnets: MagnetItem[];
  /** true = 请求失败/被拦截，不能断言源站没有磁力 */
  failed: boolean;
}

/**
 * 抓取磁力列表，并区分「源站确实没有」与「没取到」。
 *
 * - 解析出磁力 → 成功；
 * - 合法空响应（仅隐藏 loading 的脚本）→ 再确认一次，两次都空才认定源站没有；
 * - 请求失败、被重定向到验证页、非空但解析不出磁力 → 失败。
 */
async function fetchMagnetList(
  baseUrl: string,
  detailUrl: string,
  timeoutMs: number
): Promise<MagnetFetchOutcome> {
  let failed = false;
  let confirmedEmpty = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await get(`${baseUrl}&floor=${Date.now()}-${attempt}`, timeoutMs, {
      // 与浏览器一致：来源页 + XHR 标记 + 磁力视图 cookie
      Referer: detailUrl,
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: 'existmag=all',
    });
    if (!result.ok) {
      failed = true;
      continue;
    }
    if (isJavbusVerificationPage(result.finalUrl, result.html)) {
      failed = true;
      continue;
    }
    const magnets = parseMagnets(result.html);
    if (magnets.length > 0) return { magnets, failed: false };
    if (isJavbusEmptyMagnetResponse(result.html)) {
      confirmedEmpty = true;
      continue;
    }
    // 非空、无磁力、也不是 JavBus 的合法空响应：按抓取异常处理
    failed = true;
  }

  return { magnets: [], failed: failed || !confirmedEmpty };
}

/**
 * 详情页（元数据）+ 磁力 Ajax 的统一抓取入口。
 * 历史上榜单补全只抓了详情页，导致记录 detail_completed=1 但磁力为空；
 * 需要「完整详情」的路径（搜索 Provider / 详情接口 / 榜单补全 / 管理批量任务）统一走这里。
 */
export async function fetchJavbusDetailWithMagnets(
  code: string,
  timeoutMs = 15000
): Promise<JavbusDetailWithMagnetsResult> {
  const fetched = await fetchJavbusDetailHtml(code, timeoutMs);
  if (!fetched.ok) return { ok: false, error: fetched.error };

  const detailUrl = `https://www.javbus.com/${fetched.usedCode}`;
  const detail = parseJavDetail(fetched.html, normalizeJavCode(code), detailUrl);

  let magnets: MagnetItem[] = [];
  let magnetFetchFailed = false;
  const gidUc = extractGidUc(fetched.html);
  if (gidUc) {
    const magnetUrl = `https://www.javbus.com/ajax/uncledatoolsbyajax.php?lang=zh&gid=${gidUc.gid}&uc=${gidUc.uc}`;
    const outcome = await fetchMagnetList(magnetUrl, detailUrl, Math.min(10000, timeoutMs));
    magnets = outcome.magnets;
    magnetFetchFailed = outcome.failed;
  } else {
    // 没有 gid/uc 说明页面结构异常，按暂时失败处理，避免误判成「源站没有磁力」
    magnetFetchFailed = true;
  }

  return {
    ok: true,
    data: { detail, magnets, detailUrl, usedCode: fetched.usedCode, magnetFetchFailed },
  };
}
