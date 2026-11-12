/**
 * 小说搜索服务
 * NovelItem 抓取源:
 *   知轩藏书 (https://zxcs.zip) — 精校版全本，明文搜索 + 直链下载
 *
 * 奇书网 (xqishuta.org) 已于 2026-11 下线：源站仅收 HTTPS，且 HTTPS 握手失败、
 *   Cloudflare 返回 522（源站不可达），无法产出数据，故移除抓取实现。
 *
 * 跳转卡片源（SearchResultsPanel）：由 search.ts 路由从数据库 search_sources 表注入，
 *   含 Z-Library / Anna's Archive / 知轩藏书 / SoBooks / Lunarora / PDFs.top / 读书派等。
 *   Anna's Archive 因人机验证不再做 NovelItem 抓取，仅保留跳转卡片。
 *
 * ⚠️ 类型契约：本文件导出的接口（NovelItem, NovelSearchResult）
 *    与 frontend/src/types/search.ts 保持结构同步。
 */

import { fetchWithRetry } from '@/utils/fetch';
import { sanitizeError, classifySearchError, type SearchErrorKind } from '@/utils/error';
import { decodeGbk, encodeGbkQuery } from '@/utils/gbk';

// ─── Constants ───────────────────────────────────────────────────────────

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

// ─── Types ──────────────────────────────────────────────────────────────

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
}

// ─── HTML 解析工具 ──────────────────────────────────────────────────────

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

/** 带超时的 HTML 请求：搜索页/详情页共用，避免每处重复写 AbortController */
async function fetchHtml(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetchWithRetry(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 有限并发 map：保持结果顺序，单条失败不应拖垮整批 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

interface NovelSourceResult {
  items: NovelItem[];
  error: string | null;
  /** 失败语义（脱敏文案随之返回，前端按 kind 区分提示） */
  errorKind?: SearchErrorKind;
  /** 搜索结果里是否还有下一页 */
  hasMore: boolean;
}

// ─── 知轩藏书 (zxcs.zip) ───────────────────────────────────────────────

/**
 * 知轩藏书搜索流程：
 *   1. 搜索页 `https://zxcs.zip/search?q={keyword}` — Angular SSR 渲染，正则提取首个 `/book/{id}.html`
 *   2. 详情页 `https://zxcs.zip/book/{id}.html` — 提取作者/简介/字数/状态/大小/分类/标签
 *   3. 下载直链 `https://download.zxcs.zip/{书名}.txt` — 无加密无混淆，明文 txt
 *
 * 与可乐小说不同：zxcs 是明文 HTML + 直链下载，无 AES 加密、无字体反混淆。
 */

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
      title: decodeEntities(match[2].trim()),
    });
  }
  return results;
}

/** 从详情页 HTML 提取书籍详情和 txt 下载直链 */
function parseZxcsDetailPage(
  html: string,
  searchResult: { title: string; bookUrl: string },
): NovelItem | null {
  // 书籍 ID
  const idMatch = searchResult.bookUrl.match(/\/book\/(\d+)\.html/);
  const bookId = idMatch ? idMatch[1] : '';

  // txt 下载直链：<a href="https://download.zxcs.zip/..." download id="downloadtxt">
  const downloadMatch = html.match(/<a href="([^"]+)"\s+download\s+id="downloadtxt"/);
  const downloadUrl = downloadMatch ? downloadMatch[1] : '';
  if (!downloadUrl) return null;

  // 作者
  const author = firstMatch(html, /【作者】：([^<]+)<\/p>/);

  // 简介（<br /> 后到 </p>，压缩空白）
  const introRaw = firstMatch(html, /【内容简介】：<br\s*\/?>([\s\S]*?)<\/p>/);
  const description = introRaw ? decodeEntities(stripTags(introRaw.replace(/\s+/g, ' '))).trim() : '';

  // 字数（并入 size 后缀，便于卡片展示）
  const wordCount = firstMatch(html, /【字数】：([^<]+)<\/p>/).trim();

  // 状态（完本 / 连载）
  const status = firstMatch(html, /【状态】：([^<]+)<\/p>/);

  // TXT 大小（追加字数信息）
  const txtSize = firstMatch(html, /【TXT大小】：([^<]+)<\/p>/).trim();
  const size = wordCount ? `${txtSize} · ${wordCount}字` : txtSize;

  // 分类
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

/** 知轩藏书搜索：站点按 &page=N 分页，每页最多抓 NOVEL_PAGE_SIZE 本详情 */
async function searchZxcsNovel(keyword: string, page: number): Promise<NovelSourceResult> {
  try {
    // 1. 抓取搜索页（实测：&page=N 生效，第 1/2/3 页结果不同）
    const searchUrl = `https://${ZXCS_DOMAIN}/search?q=${encodeURIComponent(keyword)}&page=${page}`;
    const r = await fetchHtml(searchUrl, ZXCS_HEADERS);
    if (!r.ok) return { items: [], error: sanitizeError(`zxcs_http_${r.status}`), errorKind: classifySearchError(`zxcs_http_${r.status}`) ?? undefined, hasMore: false };
    const searchHtml = await r.text();

    // 2. 解析当前页书目（站点每页固定 10 条）
    const all = parseZxcsSearchResults(searchHtml);
    if (!all.length) return { items: [], error: null, hasMore: false };
    const slice = all.slice(0, NOVEL_PAGE_SIZE);
    const hasMore = all.length >= NOVEL_PAGE_SIZE;

    // 3. 有限并发抓详情页；单本失败只丢该本
    const items = await mapWithConcurrency(slice, DETAIL_CONCURRENCY, async (entry) => {
      try {
        const dr = await fetchHtml(`https://${ZXCS_DOMAIN}${entry.bookUrl}`, ZXCS_HEADERS);
        if (!dr.ok) return null;
        return parseZxcsDetailPage(await dr.text(), entry);
      } catch {
        return null;
      }
    });

    const found = items.filter((item): item is NovelItem => item !== null);
    return {
      items: found,
      error: found.length ? null : '详情页解析失败',
      errorKind: found.length ? undefined : 'PARSE_FAILED',
      hasMore,
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

// ─── 奇书网 (qishuxia.com) ─────────────────────────────────────────────

interface QsxSearchRow {
  bookUrl: string;
  bookId: string;
  title: string;
  category: string;
  author: string;
}

/** GBK 页面请求：处理「403 + Set-Cookie」反爬门，第二次带 cookie 重放 */
async function fetchGbkHtml(url: string, init: RequestInit = {}): Promise<string> {
  let cookie = '';
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
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
async function searchQishuNovel(keyword: string, page: number): Promise<NovelSourceResult> {
  try {
    const searchHtml = await fetchGbkHtml(`${QSX_ORIGIN}/modules/article/search.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `searchkey=${encodeGbkQuery(keyword)}`,
    });

    const all = parseQsxSearchResults(searchHtml);
    if (!all.length) return { items: [], error: null, hasMore: false };

    const start = (page - 1) * NOVEL_PAGE_SIZE;
    const slice = all.slice(start, start + NOVEL_PAGE_SIZE);
    const hasMore = all.length > start + NOVEL_PAGE_SIZE;

    const items = await mapWithConcurrency(slice, DETAIL_CONCURRENCY, async (row) => {
      try {
        return parseQsxDetailPage(await fetchGbkHtml(row.bookUrl), row);
      } catch {
        return null;
      }
    });

    const found = items.filter((item): item is NovelItem => item !== null);
    return {
      items: found,
      error: found.length ? null : '详情页解析失败',
      errorKind: found.length ? undefined : 'PARSE_FAILED',
      hasMore,
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

// ─── 搜索入口 ────────────────────────────────────────────────────────

export async function searchNovel(keyword: string, page: number): Promise<NovelSearchResult> {
  const safePage = Math.max(1, page);
  const [zxcsResult, qishuResult] = await Promise.all([
    searchZxcsNovel(keyword, safePage),
    searchQishuNovel(keyword, safePage),
  ]);

  const errors: Record<string, string | null> = {};
  if (zxcsResult.error) errors.zxcs = zxcsResult.error;
  if (qishuResult.error) errors.qishu = qishuResult.error;

  const errorKinds: Record<string, SearchErrorKind> = {};
  if (zxcsResult.errorKind) errorKinds.zxcs = zxcsResult.errorKind;
  if (qishuResult.errorKind) errorKinds.qishu = qishuResult.errorKind;

  // 跨站去重：两站 id 空间不同，靠前缀区分记录（见 data-storage 的 dedupKey）
  const novels = [...zxcsResult.items, ...qishuResult.items];

  return {
    resultType: 'novel',
    keyword,
    page: safePage,
    total: novels.length,
    hasMore: zxcsResult.hasMore || qishuResult.hasMore,
    errors,
    errorKinds,
    novels,
  };
}

