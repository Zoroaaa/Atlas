/**
 * 小说搜索服务：抓取知轩藏书与奇书网的 HTML 搜索页/详情页，产出可直接下载的 TXT 条目。
 *
 * 类型契约：NovelItem / NovelSearchResult 与 frontend/src/types/search.ts 同步。
 * 跳转卡片源（Z-Library、Anna's Archive 等）不在此抓取，由 search.ts 路由从
 * search_sources 表注入到 results 字段。
 */

import { fetchWithRetry } from '@/utils/fetch';
import { sanitizeError, classifySearchError, type SearchErrorKind } from '@/utils/error';
import { decodeGbk, encodeGbkQuery } from '@/utils/gbk';
import { mapWithConcurrency } from '@/utils';
import { createDeadline, budgetFor } from '@/utils';
import { isCircuitOpen, recordCircuitFailure, recordCircuitSuccess } from '@/utils/breaker';
import { buildDiagnostics, logSearchDiagnostics, type SearchDiagnostics, type SourceStat } from '@/utils/search-metrics';
import { isNovelActionable } from '@/services/search-actionable';
import type { Deadline } from '@/utils/search-budget';

// ── 常量 ─────────────────────────────────────────────────

/** 知轩藏书域名 */
const ZXCS_DOMAIN = 'zxcs.zip';

/**
 * 奇书网（qishuxia.com）
 * - 全站 GBK 编码，搜索表单是 POST /modules/article/search.php?searchkey=<GBK 百分号编码>
 * - 首次访问返回 403 + Set-Cookie 反爬门，带 cookie 重放即 200
 * - TXT 直链：/modules/article/txtarticle.php?id={bookId}（实测 text/plain + attachment）
 */
const QSX_ORIGIN = 'https://www.qishuxia.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
} as Record<string, string>;

/** 知轩藏书请求头（加 Referer 防盗链） */
const ZXCS_HEADERS = {
  ...FETCH_HEADERS,
  'Referer': `https://${ZXCS_DOMAIN}/`,
} as Record<string, string>;

/** 奇书网请求头（Referer 防盗链） */
const QSX_HEADERS = {
  ...FETCH_HEADERS,
  'Referer': `${QSX_ORIGIN}/`,
} as Record<string, string>;

/** 单次请求超时（ms） */
const FETCH_TIMEOUT = 15000;

// ── 类型 ─────────────────────────────────────────────────

export interface NovelItem {
  /** MD5，作为唯一标识 */
  id: string;
  /** 书名 */
  title: string;
  /** 作者 */
  author: string;
  /** 图书描述 / 简介（从详情页抓取） */
  description: string;
  /** 出版社 / 来源机构（含年份，如 "shu.im, 2011"） */
  publisher: string;
  /** 封面图 URL */
  cover: string;
  /** 语言（如 "中文 [zh]"） */
  language: string;
  /** 文件格式（如 "PDF" / "EPUB" / "MOBI"） */
  format: string;
  /** 文件大小（如 "1.4MB"） */
  size: string;
  /** 出版年份 */
  year: string;
  /** 分类标签（如 "小说类图书"） */
  category: string;
  /** 来源标识（如 "lgli/upload/zlib"） */
  source: string;
  /** 详情页/下载页 URL */
  detailUrl: string;
  /** 源站书籍详情页（与 detailUrl 的 txt 直链区分） */
  siteUrl?: string;
  /** 同书在其他站点的下载入口（跨站合并后填充） */
  mirrors?: Array<{ source: string; detailUrl: string; size?: string; format?: string }>;
}

export interface NovelSearchResult {
  resultType: 'novel';
  keyword: string;
  page: number;
  total: number;
  /** 是否还有下一页（前端「加载更多」依据） */
  hasMore?: boolean;
  errors: Record<string, string | null>;
  /** 按源的失败语义（与动漫/漫画/影视对齐） */
  errorKinds?: Record<string, SearchErrorKind>;
  novels: NovelItem[];
  /** 多源跳转卡片（由 search.ts 路由从数据库注入，与 JAV 的 results 机制一致） */
  results?: Array<{
    id: string;
    name: string;
    subtitle?: string;
    icon?: string;
    url: string;
    siteType: string;
    category: string;
    description?: string;
  }>;
  /** 诊断指标：耗时、预算、各源状态、可操作率。前端不渲染 */
  diagnostics?: SearchDiagnostics;
}

// ── HTML 解析工具 ────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function firstMatch(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? decodeEntities(m[1].trim()) : '';
}

/** 每源每页最多解析的书数（详情页需逐本抓取，不能无限放大请求） */
const NOVEL_PAGE_SIZE = 10;
/** 详情页抓取并发上限 */
const DETAIL_CONCURRENCY = 3;
/**
 * 详情解析缓存 TTL。
 * TXT 书籍的标题/作者/简介/大小几乎不变，而详情页是 N+1 的主要成本；
 * 7 天足够摊薄，又不至于让「新书补简介」长期不生效。
 */
const DETAIL_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

// ── 详情缓存（Cache API）─────────────────────────────────

/**
 * 详情解析结果缓存。
 *
 * 用 Cache API 而不是 D1：详情是纯读、可丢弃、按 URL 天然分片的数据，
 * 写 D1 会放大写压力（搜索是最高频路径）。本地/单测环境没有 caches 时静默跳过。
 */
async function readDetailCache(key: string): Promise<NovelItem | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const hit = await caches.default.match(new Request(key));
    if (!hit) return null;
    return await hit.json() as NovelItem;
  } catch {
    return null;
  }
}

async function writeDetailCache(key: string, item: NovelItem): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.default.put(
      new Request(key),
      new Response(JSON.stringify(item), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${DETAIL_CACHE_TTL_SECONDS}`,
        },
      }),
    );
  } catch {
    // 缓存失败不影响结果
  }
}

/** 站点内书籍详情：先查缓存，未命中才抓详情页 */
async function loadNovelDetail(
  site: 'zxcs' | 'qishu',
  bookId: string,
  loader: () => Promise<NovelItem | null>,
): Promise<NovelItem | null> {
  const key = `https://internal/novel-detail/${site}/${bookId}`;
  const cached = await readDetailCache(key);
  if (cached) return cached;
  const item = await loader();
  if (item) await writeDetailCache(key, item);
  return item;
}

/** 带超时的 HTML 请求：搜索页/详情页共用，避免每处重复写 AbortController */
async function fetchHtml(url: string, headers: Record<string, string>, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchWithRetry(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

interface NovelSourceResult {
  items: NovelItem[];
  error: string | null;
  /** 失败语义（脱敏文案随之返回，前端按 kind 区分提示） */
  errorKind?: SearchErrorKind;
  /** 搜索结果里是否还有下一页 */
  hasMore: boolean;
  /** 是否因总预算耗尽而提前收工（此时结果不完整，但不是失败） */
  truncated?: boolean;
  /** 因熔断被跳过：不是失败，也不该显示为「没有结果」 */
  breakerOpen?: boolean;
}

// ── 知轩藏书（zxcs.zip）────────────────────────────────

/**
 * 知轩藏书搜索流程：
 *   1. 搜索页 `https://zxcs.zip/search?q={keyword}` — Angular SSR 渲染，正则提取首个 `/book/{id}.html`
 *   2. 详情页 `https://zxcs.zip/book/{id}.html` — 提取作者/简介/字数/状态/大小/分类/标签
 *   3. 下载直链 `https://download.zxcs.zip/{书名}.txt` — 无加密无混淆，明文 txt
 *
 * 与可乐小说不同：zxcs 是明文 HTML + 直链下载，无 AES 加密、无字体反混淆。
 */

/**
 * 清洗知轩书名：搜索页标题形如
 *   《书名》（整理未校对精校版全本）作者：某某
 * 直接展示会把版本说明和作者一起塞进书名。书名号存在时只取书名号内内容，
 * 没有书名号时退化为剥掉「作者：…」后缀。
 */
export function cleanZxcsTitle(raw: string): string {
  const title = raw.trim();
  const quoted = /《([^》]+)》/.exec(title);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  return title.replace(/作者\s*[:：].*$/, '').trim() || title;
}

/** 从搜索页 HTML 提取全部书籍（保持页面顺序，按 URL 去重） */
function parseZxcsSearchResults(html: string): Array<{ title: string; bookUrl: string }> {
  // Angular SSR 结构：<a href="/book/675.html" target="_self" ...><div class="tile-wrapper">...
  //   <span _ngcontent-wfr-c36="" class="link ng-tns-c36-0">《仙逆》...</span>
  // 注意：Angular 会给标签追加 _ngcontent 属性和 class 组件 ID 后缀，需用 `[^>]*` 和 `[^"]*` 兼容
  const re = /href="(\/book\/\d+\.html)"\s+target="_self"[^>]*>[\s\S]*?<span[^>]*class="link[^"]*">([\s\S]*?)<\/span>/g;
  const results: Array<{ title: string; bookUrl: string }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(re)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    results.push({
      bookUrl: match[1],
      title: cleanZxcsTitle(decodeEntities(match[2].trim())),
    });
  }
  return results;
}

/** 从详情页 HTML 提取书籍详情和 txt 下载直链 */
function parseZxcsDetailPage(
  html: string,
  searchResult: { title: string; bookUrl: string },
): NovelItem | null {
  const idMatch = searchResult.bookUrl.match(/\/book\/(\d+)\.html/);
  const bookId = idMatch ? idMatch[1] : '';

  // txt 下载直链：<a href="https://download.zxcs.zip/..." download id="downloadtxt">
  const downloadMatch = html.match(/<a href="([^"]+)"\s+download\s+id="downloadtxt"/);
  const downloadUrl = downloadMatch ? downloadMatch[1] : '';
  if (!downloadUrl) return null;

  const author = firstMatch(html, /【作者】：([^<]+)<\/p>/);

  // 简介（<br /> 后到 </p>，压缩空白）
  const introRaw = firstMatch(html, /【内容简介】：<br\s*\/?>([\s\S]*?)<\/p>/);
  const description = introRaw ? decodeEntities(stripTags(introRaw.replace(/\s+/g, ' '))).trim() : '';

  // 字数（并入 size 后缀，便于卡片展示）
  const wordCount = firstMatch(html, /【字数】：([^<]+)<\/p>/).trim();

  const status = firstMatch(html, /【状态】：([^<]+)<\/p>/);

  // TXT 大小（追加字数信息）
  const txtSize = firstMatch(html, /【TXT大小】：([^<]+)<\/p>/).trim();
  const size = wordCount ? `${txtSize} · ${wordCount}字` : txtSize;

  const category = firstMatch(html, /【分类】：<a[^>]*>([^<]+)<\/a>/);

  // 标签（多个 a，拼接）
  const tagBlock = html.match(/【标签】：([\s\S]*?)<\/p>/);
  const tags = tagBlock
    ? (tagBlock[1].match(/<a[^>]*>([^<]+)<\/a>/g) || [])
        .map(t => t.replace(/<[^>]*>/g, '').trim())
        .filter(Boolean)
        .join(',')
    : '';

  // 校对版本（如 "校对版全本"）
  const proofread = firstMatch(html, /【校对】：([^<]+)<\/p>/);

  return {
    id: bookId,
    title: searchResult.title,
    author,
    description,
    publisher: '知轩藏书',
    cover: '',
    language: '中文',
    format: 'TXT',
    size,
    year: '',
    category: [category, status, proofread].filter(Boolean).join(' / ') || tags,
    source: '知轩藏书',
    detailUrl: downloadUrl,
    siteUrl: `https://${ZXCS_DOMAIN}${searchResult.bookUrl}`,
  };
}

/**
 * 判断搜索页是否存在下一页链接。
 * 不能用「本页条数是否满额」猜：末页恰好满额时会多显示一次「加载更多」。
 */
function hasZxcsNextPage(html: string, page: number): boolean {
  const next = page + 1;
  // 链接形如 href="https://zxcs.zip/search?q=...&amp;page=2"
  return new RegExp(`href="[^"]*page=${next}(?:["&]|&amp;)`).test(html);
}

/** 知轩藏书搜索：站点按 &page=N 分页，每页最多抓 NOVEL_PAGE_SIZE 本详情 */
async function searchZxcsNovel(keyword: string, page: number, deadline: Deadline): Promise<NovelSourceResult> {
  try {
    // 1. 抓取搜索页（实测：&page=N 生效，第 1/2/3 页结果不同）
    const searchUrl = `https://${ZXCS_DOMAIN}/search?q=${encodeURIComponent(keyword)}&page=${page}`;
    const r = await fetchHtml(searchUrl, ZXCS_HEADERS, deadline.slice(FETCH_TIMEOUT));
    if (!r.ok) return { items: [], error: sanitizeError(`zxcs_http_${r.status}`), errorKind: classifySearchError(`zxcs_http_${r.status}`) ?? undefined, hasMore: false };
    const searchHtml = await r.text();

    // 2. 解析当前页书目（站点每页固定 10 条）
    const all = parseZxcsSearchResults(searchHtml);
    if (!all.length) return { items: [], error: null, hasMore: false };
    const slice = all.slice(0, NOVEL_PAGE_SIZE);
    const hasMore = hasZxcsNextPage(searchHtml, page);

    // 3. 有限并发抓详情页；单本失败只丢该本，预算耗尽则停止发起新请求
    let truncated = false;
    const items = await mapWithConcurrency(slice, DETAIL_CONCURRENCY, async (entry) => {
      if (deadline.expired()) {
        truncated = true;
        return null;
      }
      try {
        const bookId = entry.bookUrl.match(/\/book\/(\d+)\.html/)?.[1] ?? entry.bookUrl;
        return await loadNovelDetail('zxcs', bookId, async () => {
          const dr = await fetchHtml(`https://${ZXCS_DOMAIN}${entry.bookUrl}`, ZXCS_HEADERS, deadline.slice(FETCH_TIMEOUT));
          if (!dr.ok) return null;
          return parseZxcsDetailPage(await dr.text(), entry);
        });
      } catch {
        return null;
      }
    });

    const found = items.filter((item): item is NovelItem => item !== null);
    return {
      items: found,
      // 预算截断导致条数不足不算解析失败：否则会被误判为「源挂了」
      error: found.length || truncated ? null : '详情页解析失败',
      errorKind: found.length || truncated ? undefined : 'PARSE_FAILED',
      hasMore,
      truncated,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'unknown';
    console.error('[novel-search] zxcs error:', errorMessage);
    return {
      items: [],
      error: sanitizeError(errorMessage),
      errorKind: classifySearchError(errorMessage) ?? 'SOURCE_UNAVAILABLE',
      hasMore: false,
    };
  }
}

// ── 奇书网（qishuxia.com）───────────────────────────────

interface QsxSearchRow {
  bookUrl: string;
  bookId: string;
  title: string;
  category: string;
  author: string;
}

/** GBK 页面请求：处理「403 + Set-Cookie」反爬门，第二次带 cookie 重放 */
async function fetchGbkHtml(url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT): Promise<string> {
  let cookie = '';
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetchWithRetry(url, {
        ...init,
        headers: {
          ...QSX_HEADERS,
          ...(init.headers as Record<string, string> || {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        signal: controller.signal,
      });
      lastStatus = r.status;

      const setCookie = r.headers.get('set-cookie') || '';
      const html = decodeGbk(new Uint8Array(await r.arrayBuffer()));

      if (r.ok && html.length > 500) return html;
      if (setCookie) {
        cookie = setCookie.split(';')[0].trim();
        continue; // 带上反爬 cookie 重放一次
      }
      if (r.ok) throw new Error('qishu_empty_page');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`qishu_blocked: cookie challenge (last status ${lastStatus})`);
}

/** 搜索页解析：每行是 li > s1 分类 / s2 书名链接 / s3 最新章节 / s4 作者 / s5 更新时间 */
function parseQsxSearchResults(html: string): QsxSearchRow[] {
  const rows: QsxSearchRow[] = [];
  const seen = new Set<string>();
  const liRe = /<li>\s*<span class="s1">([\s\S]*?)<\/span>\s*<span class="s2"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/span>[\s\S]*?<span class="s4">([\s\S]*?)<\/span>/gi;

  for (const m of html.matchAll(liRe)) {
    const bookUrl = m[2].trim();
    const idMatch = bookUrl.match(/\/book\/(\d+)\/?/);
    if (!idMatch) continue;
    if (seen.has(idMatch[1])) continue;
    seen.add(idMatch[1]);
    rows.push({
      bookUrl,
      bookId: idMatch[1],
      title: decodeEntities(stripTags(m[3])).trim(),
      category: decodeEntities(stripTags(m[1])).replace(/[[\]]/g, '').trim(),
      author: decodeEntities(stripTags(m[4])).trim(),
    });
  }

  return rows;
}

/** 解析奇书网详情页；字段缺失时回退到搜索页行数据，封面缺失则按 bookId 规则拼接。 */
function parseQsxDetailPage(html: string, row: QsxSearchRow): NovelItem {
  const title = firstMatch(html, /<div class="info">[\s\S]*?<h1>([^<]+)<\/h1>/i) || row.title;
  const author = firstMatch(html, /作者：([^<]+)<\/p>/i) || row.author;
  const category = firstMatch(html, /类别：([^<]+)<\/p>/i) || row.category;
  const status = firstMatch(html, /状态：([^<]+)<\/p>/i);
  const lastUpdate = firstMatch(html, /最后更新：([^<]+)<\/p>/i);

  // 简介：优先 .desc 正文（真实简介），退化到 meta description（SEO 文案）
  const blockDesc = firstMatch(html, /<div class="desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const metaDesc = firstMatch(html, /<meta name="Description" content="([^"]*)"/i);
  const description = stripTags(blockDesc).replace(/^关于[^：]*：/, '').trim() || metaDesc;

  const cover = firstMatch(html, /<div class="info">[\s\S]*?<img[^>]+src="([^"]+)"/i)
    || `https://www.qishuxia.com/files/article/image/${row.bookId.slice(0, -3) || '0'}/${row.bookId}/${row.bookId}s.jpg`;

  // 书籍页没有总章节数（章节列表异步加载），不编造 size
  const size = '';

  // TXT 直链实测：/modules/article/txtarticle.php?id=9000 → text/plain + attachment
  const dlRel = firstMatch(html, /href="(\/modules\/article\/txtarticle\.php\?id=\d+)"/i);
  const detailUrl = dlRel ? `${QSX_ORIGIN}${dlRel}` : `${QSX_ORIGIN}/book/${row.bookId}/`;

  return {
    id: row.bookId,
    title,
    author,
    description,
    publisher: '奇书网',
    cover,
    language: '中文',
    format: 'TXT',
    size,
    year: lastUpdate.slice(0, 4),
    category: [category, status, lastUpdate && `更新 ${lastUpdate}`].filter(Boolean).join(' / '),
    source: '奇书网',
    detailUrl,
    siteUrl: `${QSX_ORIGIN}/book/${row.bookId}/`,
  };
}

/**
 * 奇书网搜索：搜索页一次返回全部命中（无分页参数），这里按页切片后再抓详情，
 * 让 hasMore / page 契约与知轩藏书一致，同时避免每页重复抓取全部详情。
 */
async function searchQishuNovel(keyword: string, page: number, deadline: Deadline): Promise<NovelSourceResult> {
  try {
    const searchHtml = await fetchGbkHtml(`${QSX_ORIGIN}/modules/article/search.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `searchkey=${encodeGbkQuery(keyword)}`,
    }, deadline.slice(FETCH_TIMEOUT));

    const all = parseQsxSearchResults(searchHtml);
    if (!all.length) return { items: [], error: null, hasMore: false };

    const start = (page - 1) * NOVEL_PAGE_SIZE;
    const slice = all.slice(start, start + NOVEL_PAGE_SIZE);
    const hasMore = all.length > start + NOVEL_PAGE_SIZE;

    let truncated = false;
    const items = await mapWithConcurrency(slice, DETAIL_CONCURRENCY, async (row) => {
      if (deadline.expired()) {
        truncated = true;
        return null;
      }
      try {
        return await loadNovelDetail('qishu', row.bookId, async () => parseQsxDetailPage(
          await fetchGbkHtml(row.bookUrl, {}, deadline.slice(FETCH_TIMEOUT)),
          row,
        ));
      } catch {
        return null;
      }
    });

    const found = items.filter((item): item is NovelItem => item !== null);
    return {
      items: found,
      error: found.length || truncated ? null : '详情页解析失败',
      errorKind: found.length || truncated ? undefined : 'PARSE_FAILED',
      hasMore,
      truncated,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'unknown';
    console.error('[novel-search] qishu error:', errorMessage);
    return {
      items: [],
      error: sanitizeError(errorMessage),
      errorKind: classifySearchError(errorMessage) ?? 'SOURCE_UNAVAILABLE',
      hasMore: false,
    };
  }
}

// ── 搜索入口 ─────────────────────────────────────────────

// ── 跨站合并与封面补齐 ───────────────────────────────────

/**
 * 书名归一化（仅用于跨站合并）。
 * 只处理确定性差异：全半角、大小写、标点与空白。不做同义词/繁简转换 —— 那会把
 * 《三体》和《三体Ⅱ》这类续作错误合并。
 */
export function novelTitleKey(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·・:：\-–—_.,!?()[\]{}'"“”‘’「」『』、。，《》<>/\\|]/g, '');
}

/**
 * 跨站合并：同一本书只保留一条，其余站点作为下载镜像。
 *
 * 合并条件要求「书名 + 作者」同时非空且相等：只有书名时会把同名不同作者的书并掉，
 * 这是小说场景里最常见的误合并来源。
 */
export function mergeNovelItems(items: NovelItem[]): NovelItem[] {
  const byKey = new Map<string, NovelItem>();
  const out: NovelItem[] = [];

  for (const item of items) {
    const authorKey = novelTitleKey(item.author || '');
    const titleKey = novelTitleKey(item.title || '');
    if (!titleKey || !authorKey) {
      out.push(item);
      continue;
    }
    const key = `${titleKey}|${authorKey}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      out.push(item);
      continue;
    }
    // 主条目补齐缺失字段，另一站挂成镜像
    existing.cover = existing.cover || item.cover;
    existing.description = existing.description || item.description;
    existing.size = existing.size || item.size;
    existing.year = existing.year || item.year;
    const mirrors = existing.mirrors ?? [];
    if (item.detailUrl && item.detailUrl !== existing.detailUrl) {
      mirrors.push({
        source: item.source || '未知来源',
        detailUrl: item.detailUrl,
        size: item.size || undefined,
        format: item.format || undefined,
      });
    }
    existing.mirrors = mirrors.length ? mirrors : undefined;
  }

  return out;
}

/** 豆瓣图书 suggest 返回项（只声明用到的字段） */
interface DoubanBookSuggestion {
  title?: string;
  pic?: string;
  author_name?: string;
  year?: string;
}

/**
 * 一次请求补齐整页封面。
 *
 * 为什么不是「每本查一次」：详情页已经是 N+1，再按书查豆瓣会把请求数翻倍。
 * suggest 接口支持按关键词取多条（实测 613B / 3~10 条），一次就能覆盖本页大部分书名。
 */
async function fetchDoubanCovers(keyword: string, timeoutMs: number): Promise<Map<string, DoubanBookSuggestion>> {
  const map = new Map<string, DoubanBookSuggestion>();
  try {
    const r = await fetch(`https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(keyword)}`, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://book.douban.com/',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return map;
    const list = await r.json() as DoubanBookSuggestion[];
    for (const item of Array.isArray(list) ? list : []) {
      const key = novelTitleKey(item.title || '');
      if (key && !map.has(key)) map.set(key, item);
    }
  } catch {
    // 封面是增强项，失败不影响搜索结果
  }
  return map;
}

/** 用豆瓣结果补封面/年份；已有封面或未命中的条目保持原样 */
export function applyDoubanCovers(
  items: NovelItem[],
  suggestions: Map<string, DoubanBookSuggestion>,
): NovelItem[] {
  if (suggestions.size === 0) return items;
  return items.map(item => {
    const hit = suggestions.get(novelTitleKey(item.title));
    if (!hit) return item;
    return {
      ...item,
      cover: item.cover || hit.pic || '',
      year: item.year || hit.year || '',
    };
  });
}

// ── 本地库兜底 ───────────────────────────────────────────

/**
 * 两站都拿不到结果时，回查本地库。
 *
 * 只在「全部源为空/失败」时触发，不做「本地优先」：本地记录里的 txt 直链会失效，
 * 拿它顶替远端最新结果会把「能下载」换成「看着能下载」，反而降低成功率。
 * 作为兜底，它把「源站全挂 → 零结果」变成「源站全挂 → 仍有历史可读」。
 */
export async function searchLocalNovels(
  db: D1Database,
  keyword: string,
  limit = 10,
): Promise<NovelItem[]> {
  const pattern = `%${keyword.replace(/[%_]/g, '')}%`;
  try {
    const rows = await db
      .prepare(
        `SELECT dedup_key, title, cover, actors, content_data
           FROM data_records
          WHERE record_type = 'novel'
            AND status = 'active'
            AND title LIKE ?
          ORDER BY last_updated_at DESC
          LIMIT ?`
      )
      .bind(pattern, limit)
      .all<{ dedup_key: string; title: string; cover: string | null; actors: string | null; content_data: string }>();

    const items: NovelItem[] = [];
    for (const row of rows.results ?? []) {
      let content: Record<string, unknown> = {};
      try {
        content = JSON.parse(row.content_data) as Record<string, unknown>;
      } catch {
        content = {};
      }
      const detailUrl = typeof content.detailUrl === 'string' ? content.detailUrl : '';
      if (!detailUrl) continue;
      // dedup_key 形如 novel:zxcs:12345 / novel:qishu:9000
      const parts = row.dedup_key.split(':');
      items.push({
        id: parts[2] ?? row.dedup_key,
        title: row.title,
        cover: row.cover ?? '',
        author: row.actors ?? '',
        description: typeof content.description === 'string' ? content.description : '',
        publisher: typeof content.publisher === 'string' ? content.publisher : '',
        format: typeof content.format === 'string' ? content.format : 'TXT',
        language: typeof content.language === 'string' ? content.language : '中文',
        size: typeof content.size === 'string' ? content.size : '',
        year: typeof content.year === 'string' ? content.year : '',
        category: typeof content.category === 'string' ? content.category : '',
        source: typeof content.source === 'string' ? content.source : '本地库',
        detailUrl,
        siteUrl: typeof content.siteUrl === 'string' ? content.siteUrl : undefined,
      });
    }
    return items;
  } catch (err) {
    console.error('[novel-search] local fallback failed:', err);
    return [];
  }
}

/** 小说搜索主入口：两站并发抓取，任一源失败只记录该源错误。 */
export async function searchNovel(
  keyword: string,
  page: number,
  options: { db?: D1Database } = {},
): Promise<NovelSearchResult> {
  const safePage = Math.max(1, page);
  const budgetMs = budgetFor('novel_sources');
  const deadline = createDeadline(budgetMs);

  // 熔断：连续失败的站点在冷却期内直接跳过，不再让整次搜索陪它等超时
  const [zxcsOpen, qishuOpen] = await Promise.all([
    isCircuitOpen('novel:zxcs'),
    isCircuitOpen('novel:qishu'),
  ]);

  // 封面请求与站点抓取并行：一次 600B 的请求，比「先抓完再补封面」省的尾部延迟更值
  const [zxcsResult, qishuResult, covers] = await Promise.all([
    zxcsOpen
      ? Promise.resolve<NovelSourceResult>({ items: [], error: null, hasMore: false, breakerOpen: true })
      : searchZxcsNovel(keyword, safePage, deadline),
    qishuOpen
      ? Promise.resolve<NovelSourceResult>({ items: [], error: null, hasMore: false, breakerOpen: true })
      : searchQishuNovel(keyword, safePage, deadline),
    fetchDoubanCovers(keyword, deadline.slice(3000)),
  ]);

  // 结果决定熔断状态：失败累计、成功清零
  if (!zxcsOpen) {
    void (zxcsResult.error ? recordCircuitFailure('novel:zxcs') : recordCircuitSuccess('novel:zxcs'));
  }
  if (!qishuOpen) {
    void (qishuResult.error ? recordCircuitFailure('novel:qishu') : recordCircuitSuccess('novel:qishu'));
  }

  const errors: Record<string, string | null> = {};
  if (zxcsResult.error) errors.zxcs = zxcsResult.error;
  if (qishuResult.error) errors.qishu = qishuResult.error;

  const errorKinds: Record<string, SearchErrorKind> = {};
  if (zxcsResult.errorKind) errorKinds.zxcs = zxcsResult.errorKind;
  if (qishuResult.errorKind) errorKinds.qishu = qishuResult.errorKind;

  // 两站 id 空间不同（zxcs 用站内书籍 ID，奇书网用数字 ID），落库 dedupKey 按站点前缀区分；
  // 但展示层要合并：同一本书在两站各出现一次，用户会以为有两本。
  let novels = applyDoubanCovers(
    mergeNovelItems([...zxcsResult.items, ...qishuResult.items]),
    covers,
  );

  // 全源为空/失败时的兜底：宁可给历史记录，也不要给一片空白
  let fromLibrary = 0;
  if (novels.length === 0 && options.db) {
    const local = await searchLocalNovels(options.db, keyword);
    if (local.length > 0) {
      novels = local;
      fromLibrary = local.length;
    }
  }

  const toStat = (r: NovelSourceResult): SourceStat => ({
    state: r.breakerOpen ? 'skipped'
      : r.error ? 'failed'
      : r.truncated ? 'timeout'
      : r.items.length > 0 ? 'ok'
      : 'empty',
    count: r.items.length,
  });
  const sources: Record<string, SourceStat> = { zxcs: toStat(zxcsResult), qishu: toStat(qishuResult) };

  const diagnostics: SearchDiagnostics = buildDiagnostics({
    category: 'novel_sources',
    keyword,
    page: safePage,
    elapsedMs: deadline.elapsed(),
    budgetMs,
    deadlineHit: deadline.expired(),
    works: novels.length,
    resources: novels.length,
    actionable: novels.filter(isNovelActionable).length,
    sources,
  });
  if (fromLibrary > 0) {
    // 单独一行：区分「远端抓到」与「本地兜底」，否则成功率会被历史记录虚高
    console.log(`[search-metrics] novel local-fallback keyword=${keyword} items=${fromLibrary}`);
  }
  logSearchDiagnostics(diagnostics);

  return {
    resultType: 'novel',
    keyword,
    page: safePage,
    total: novels.length,
    hasMore: zxcsResult.hasMore || qishuResult.hasMore,
    errors,
    errorKinds,
    novels,
    diagnostics,
  };
}

