/**
 * 小说搜索服务
 * 数据源:
 *   1. Anna's Archive (https://zh.annas-archive.gl) — 第一页全部电子书结果（上限 50 条）
 *   2. 奇书网 (http://www.xqishuta.org) — 搜索第一本书，抓取详情页 txt 下载链接，置顶展示
 *
 * ⚠️ 类型契约：本文件导出的接口（NovelItem, NovelSearchResult）
 *    与 frontend/src/types/search.ts 保持结构同步。
 *
 * 设计说明：
 *   - 两个数据源并行抓取，互不阻塞：任一源失败不影响另一源返回
 *   - 奇书网结果固定置顶在第一条（仅 page=1 时抓取，避免翻页重复）
 *   - Anna's Archive 多域名故障转移；奇书网单域名直连
 */

import { fetchWithRetry } from '@/utils/fetch';
import { sanitizeError } from '@/utils/error';

// ─── Constants ───────────────────────────────────────────────────────────

/** Anna's Archive 域名列表（按优先级，失败后自动切换） */
const AA_DOMAINS = [
  'zh.annas-archive.gl',
  'zh.annas-archive.pk',
  'zh.annas-archive.gd',
  'annas-archive.gl',
  'annas-archive.pk',
  'annas-archive.gd',
];

/** 奇书网域名 */
const XQS_DOMAIN = 'www.xqishuta.org';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
} as Record<string, string>;

/** 奇书网请求头（加 Referer 防盗链） */
const XQS_HEADERS = {
  ...FETCH_HEADERS,
  'Referer': `http://${XQS_DOMAIN}/`,
} as Record<string, string>;

/** 每次返回的结果数上限（取 Anna's Archive 第一页全部结果，上限 50 防极端情况） */
const PAGE_LIMIT = 50;
/** 详情页描述抓取并发上限（结果数增大后需提高并发避免长尾等待） */
const DESC_CONCURRENCY = 10;
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
  /** 详情页/下载页 URL（https://zh.annas-archive.gl/md5/<md5>） */
  detailUrl: string;
}

export interface NovelSearchResult {
  resultType: 'novel';
  keyword: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  novels: NovelItem[];
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

// ─── 多域名故障转移 fetch ───────────────────────────────────────────────

async function fetchWithFailover(
  pathBuilder: (domain: string) => string,
  timeoutMs: number = FETCH_TIMEOUT,
): Promise<{ html: string; domain: string }> {
  let lastErr = '';
  for (const domain of AA_DOMAINS) {
    const url = pathBuilder(domain);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetchWithRetry(url, {
        headers: FETCH_HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (r.ok) {
        const html = await r.text();
        if (html.length > 1000) return { html, domain };
      }
      lastErr = `HTTP ${r.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'unknown';
    }
  }
  throw new Error(lastErr);
}

// ─── Anna's Archive ────────────────────────────────────────────────────

/** 从详情页 HTML 提取描述 */
function extractDescription(html: string): string {
  // 描述在 js-md5-top-box-description 容器内，"描述" 标签后的 <div class="mb-1">
  const re = /描述<\/div><div class="mb-1">([\s\S]*?)<\/div>/;
  const raw = firstMatch(html, re);
  if (!raw) return '';
  // 描述可能含 <br>，转为换行后去标签
  return stripTags(raw.replace(/<br\s*\/?>/g, '\n')).trim();
}

/** 并发抓取多条结果的描述（限制并发，失败时 description 留空） */
async function fetchDescriptions(items: NovelItem[]): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];

  const processOne = async (item: NovelItem): Promise<void> => {
    try {
      const { html } = await fetchWithFailover(
        (d) => `https://${d}/md5/${item.id}`,
        10000,
      );
      item.description = extractDescription(html);
    } catch {
      // 描述抓取失败不影响主结果
    }
  };

  for (let i = 0; i < DESC_CONCURRENCY; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await processOne(item);
      }
    })());
  }
  await Promise.all(workers);
}

/** 解析单条结果块 HTML */
function parseNovelItem(block: string, domain: string): NovelItem | null {
  const md5 = firstMatch(block, /href="\/md5\/([a-f0-9]{32})"/);
  if (!md5) return null;

  const title = firstMatch(block, /<a[^>]*js-vim-focus[^>]*>([\s\S]*?)<\/a>/);
  const author = firstMatch(block, /<a[^>]*><span[^>]*icon-\[mdi--user-edit\][^>]*><\/span>([\s\S]*?)<\/a>/);
  const publisher = firstMatch(block, /<a[^>]*><span[^>]*icon-\[mdi--company\][^>]*><\/span>([\s\S]*?)<\/a>/);
  const cover = firstMatch(block, /<img[^>]*src="([^"]+)"/);

  const infoMatch = block.match(/<div class="text-gray-800[^"]*"[^>]*>([\s\S]*?)(?:<a\s|<script)/);
  const infoRaw = infoMatch ? stripTags(infoMatch[1]).trim() : '';
  const segments = infoRaw.split('·').map(s => s.trim()).filter(Boolean);

  return {
    id: md5,
    title: title || '未知书名',
    author,
    description: '',
    publisher,
    cover,
    language: segments[0] || '',
    format: segments[1] || '',
    size: segments[2] || '',
    year: segments[3] || '',
    category: segments[4] || '',
    source: segments[5] || '',
    detailUrl: `https://${domain}/md5/${md5}`,
  };
}

// ─── 奇书网 (xqishuta.org) ─────────────────────────────────────────────

/**
 * 奇书网搜索流程：
 *   1. 抓取搜索页 → 解析第一本书的书名/作者/详情页URL
 *   2. 抓取详情页 → 提取 txt 下载链接、封面、简介、文件大小等
 *
 * 详情页 txt 下载链接在 script 标签内：
 *   get_down_url('/ShtmlXXXX.html','http://dzs.xqishuta.org/XX/XXXX/书名.txt','书名')
 */

/** 从搜索页 HTML 提取第一本书 */
function parseXqishutaSearchResult(html: string): { title: string; author: string; bookUrl: string } | null {
  const match = html.match(
    /<td class="even"><a href="(\/Shtml\d+\.html)">([\s\S]*?)<\/a><\/td>\s*<td class="odd">([\s\S]*?)<\/td>/,
  );
  if (!match) return null;
  return {
    bookUrl: match[1],
    title: decodeEntities(stripTags(match[2]).trim()),
    author: decodeEntities(stripTags(match[3]).trim()),
  };
}

/** 从详情页 HTML 提取书籍详情和 txt 下载链接 */
function parseXqishutaDetailPage(
  html: string,
  searchResult: { title: string; author: string; bookUrl: string },
): NovelItem | null {
  // 书籍 ID
  const idMatch = searchResult.bookUrl.match(/\/Shtml(\d+)\.html/);
  const bookId = idMatch ? idMatch[1] : '';

  // txt 下载链接（script 内 get_down_url 第二个参数）
  const downloadMatch = html.match(/get_down_url\([^,]+,'([^']+)'/);
  const downloadUrl = downloadMatch ? downloadMatch[1] : '';
  if (!downloadUrl) return null;

  // 封面
  const coverMatch = html.match(/<div class="detail_pic"><img src="([^"]+)"/);
  const cover = coverMatch ? `http://${XQS_DOMAIN}${coverMatch[1]}` : '';

  // 文件大小
  const sizeMatch = html.match(/文件大小：([\s\S]*?)<\/li>/);
  const size = sizeMatch ? stripTags(sizeMatch[1]).trim() : '';

  // 书籍类型（格式）
  const typeMatch = html.match(/书籍类型：([\s\S]*?)<\/li>/);
  const format = typeMatch ? stripTags(typeMatch[1]).trim() : 'TXT';

  // 更新年份
  const dateMatch = html.match(/更新日期：(\d{4})-/);
  const year = dateMatch ? dateMatch[1] : '';

  // 连载状态
  const statusMatch = html.match(/连载状态：([\s\S]*?)<\/li>/);
  const category = statusMatch ? stripTags(statusMatch[1]).trim() : '';

  // 简介（showInfo 内第一个 <p>）
  const descMatch = html.match(/<div class="showInfo">\s*<p>([\s\S]*?)<\/p>/);
  const description = descMatch
    ? decodeEntities(stripTags(descMatch[1].replace(/&mdash;/g, '—'))).trim()
    : '';

  return {
    id: bookId,
    title: searchResult.title,
    author: searchResult.author,
    description,
    publisher: '奇书网',
    cover,
    language: '中文',
    format,
    size,
    year,
    category,
    source: '奇书网',
    detailUrl: downloadUrl,
  };
}

/** 奇书网搜索：抓取第一本书 + 详情页 txt 下载链接 */
async function searchXqishutaNovel(keyword: string): Promise<{ item: NovelItem | null; error: string | null }> {
  try {
    // 1. 抓取搜索页
    const searchUrl = `http://${XQS_DOMAIN}/search.html?searchkey=${encodeURIComponent(keyword)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const r = await fetchWithRetry(searchUrl, { headers: XQS_HEADERS, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) return { item: null, error: `HTTP ${r.status}` };
    const searchHtml = await r.text();

    // 2. 解析第一本书
    const firstResult = parseXqishutaSearchResult(searchHtml);
    if (!firstResult) return { item: null, error: null }; // 无搜索结果不算错误

    // 3. 抓取详情页
    const detailUrl = `http://${XQS_DOMAIN}${firstResult.bookUrl}`;
    const detailController = new AbortController();
    const detailTimeoutId = setTimeout(() => detailController.abort(), FETCH_TIMEOUT);
    const dr = await fetchWithRetry(detailUrl, { headers: XQS_HEADERS, signal: detailController.signal });
    clearTimeout(detailTimeoutId);
    if (!dr.ok) return { item: null, error: `详情页 HTTP ${dr.status}` };
    const detailHtml = await dr.text();

    // 4. 解析详情页
    const item = parseXqishutaDetailPage(detailHtml, firstResult);
    return { item, error: item ? null : '未找到 txt 下载链接' };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'unknown';
    console.error('[novel-search] xqishuta error:', sanitizeError(errorMessage));
    return { item: null, error: errorMessage };
  }
}

// ─── Anna's Archive 搜索（提取为独立函数） ─────────────────────────────

async function searchAnnasArchive(keyword: string, page: number): Promise<{ novels: NovelItem[]; error: string | null }> {
  try {
    const { html, domain } = await fetchWithFailover(
      (d) => `https://${d}/search?q=${encodeURIComponent(keyword)}${page > 1 ? `&page=${page}` : ''}`,
    );

    const parts = html.split(/<div class="flex\s+pt-3 pb-3 border-b/);
    const blocks = parts.slice(1);

    const novels: NovelItem[] = [];
    for (const block of blocks) {
      if (novels.length >= PAGE_LIMIT) break;
      const item = parseNovelItem(block, domain);
      if (item) novels.push(item);
    }

    if (novels.length > 0) {
      await fetchDescriptions(novels);
    }

    return { novels, error: null };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'unknown';
    console.error('[novel-search] Anna\'s Archive error:', sanitizeError(errorMessage));
    return { novels: [], error: errorMessage };
  }
}

// ─── 搜索入口（双源并行，奇书网置顶） ─────────────────────────────────

export async function searchNovel(keyword: string, page: number): Promise<NovelSearchResult> {
  const safePage = Math.max(1, page);

  // 奇书网仅 page=1 时抓取（翻页不重复置顶）
  const [aaResult, xqsResult] = await Promise.all([
    searchAnnasArchive(keyword, safePage),
    safePage === 1 ? searchXqishutaNovel(keyword) : Promise.resolve({ item: null, error: null }),
  ]);

  const novels: NovelItem[] = [];
  const errors: Record<string, string | null> = {};

  // 奇书网结果置顶
  if (xqsResult.item) {
    novels.push(xqsResult.item);
  }
  if (xqsResult.error) {
    errors.xqishuta = xqsResult.error;
  }

  // Anna's Archive 结果
  novels.push(...aaResult.novels);
  if (aaResult.error) {
    errors.annas_archive = aaResult.error;
  }

  return {
    resultType: 'novel',
    keyword,
    page: safePage,
    total: novels.length,
    errors,
    novels,
  };
}
