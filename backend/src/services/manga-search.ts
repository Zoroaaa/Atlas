/**
 * 漫画搜索服务：MangaDex 为主源，MangaUpdates 为第二元数据源与主源失败时的降级源。
 *
 * 类型契约：MangaItem / MangaSearchResult 与 frontend/src/types/search.ts 同步。
 * MangaUpdates 只做标题全等补全，避免把衍生作的简介/评分串到主作上。
 */

import { fetchWithRetry } from '@/utils/fetch';
import { classifySearchError, sanitizeError, type SearchErrorKind } from '@/utils/error';
import { createDeadline, budgetFor } from '@/utils';
import { buildDiagnostics, logSearchDiagnostics, type SearchDiagnostics, type SourceStat } from '@/utils/search-metrics';
import { isMangaActionable } from '@/services/search-actionable';
import { toSimplifiedChinese } from '@/services/query-normalizer';

// ── 常量 ─────────────────────────────────────────────────

const MD_BASE = 'https://api.mangadex.org';
const COVER_BASE = 'https://uploads.mangadex.org/covers';
const MU_API = 'https://api.mangaupdates.com/v1/series/search';
const UA = 'Atlas/1.0 (https://github.com/Zoroaaa)';

// ── 类型 ─────────────────────────────────────────────────

interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    /** 别名表：中文名常只出现在这里（title 可能只有 ja-ro） */
    altTitles?: Record<string, string>[];
    description: Record<string, string>;
    status: string;
    year: number | null;
    tags: { attributes: { name: Record<string, string> } }[];
    /** 有译文标记的语言列表，用于判断「有没有中文可读」 */
    availableTranslatedLanguages?: string[];
    /** 章节号字符串，可能为空串 */
    lastChapter?: string;
    latestUploadedChapter?: string;
    /** ISO 时间，作为「最近更新」展示（不用逐个查章节 UUID） */
    updatedAt?: string;
    /** 官方/生肉外链：raw = 日文官方，engtl = 英文官方 */
    links?: Record<string, string>;
  };
  relationships: { id: string; type: string; attributes?: { fileName?: string; name?: string } }[];
}

interface MuRecord {
  title: string;
  url: string;
  year: string;
  description: string;
  type: string;
  bayesian_rating?: number;
  image?: { url?: { original?: string; thumb?: string } };
  genres?: { genre: string }[];
}

interface MuHit {
  hit_title: string;
  record: MuRecord;
}

export interface MangaItem {
  id: string;
  title: string;
  /** 原始主标题（title 字段里的最佳值），用于排查「为什么显示这个名字」 */
  rawTitle?: string;
  cover: string;
  status: string;
  tags: string[];
  year?: string;
  rating?: number;
  description?: string;
  /** 可读语言标签（MangaDex 的 availableTranslatedLanguages） */
  readableLanguages?: string[];
  /** 已知章节数；为 0 表示该作品在源站没有章节 */
  chapterCount?: number;
  /** 是否没有中文译本：true 时前端应提示「暂无中文译本」而不是让用户白点 */
  noChineseChapters?: boolean;
  /** 最近更新时间（源站时间，YYYY-MM-DD） */
  lastUpdated?: string;
  /** 官方或生肉外链 */
  officialLinks?: Array<{ label: string; url: string }>;
  /** 作者（MangaDex 的 author 关系，随同一次请求返回，无额外成本） */
  author?: string;
  /** 本条数据来自哪个元数据源 */
  source?: 'mangadex' | 'mangaupdates';
  /** 原站详情页（MangaUpdates 结果用） */
  detailUrl?: string;
}

export interface MangaSearchResult {
  resultType: 'manga';
  keyword: string;
  page: number;
  total: number;
  /** 是否还有下一页（前端「加载更多」依据；不再用「本页满 20 条」猜） */
  hasMore?: boolean;
  /** 已脱敏的用户可见错误 */
  errors: Record<string, string | null>;
  /** 按源的失败语义 */
  errorKinds?: Record<string, SearchErrorKind>;
  manga: MangaItem[];
  /** 诊断指标：耗时、预算、各源状态、可操作率。前端不渲染 */
  diagnostics?: SearchDiagnostics;
}

// ── 标题/简介/可读性 ─────────────────────────────────────

/**
 * 选展示标题。
 *
 * 为什么要看 altTitles：实测 Top20 里 0/20 的 title 含中文、19/20 只有 ja-ro，
 * 中文名只存在于 altTitles（多为 zh-hk 繁体）。只看 title 会让中文用户看到罗马音。
 * 繁体统一转简体：zh-hk 是繁体，简中用户读起来同样别扭。
 */
export function pickMangaTitle(
  title: Record<string, string>,
  altTitles: Record<string, string>[] | undefined,
): string {
  const zh = title.zh || altTitles?.find(a => a.zh)?.zh;
  if (zh) return zh;

  const zhHk = title['zh-hk'] || altTitles?.find(a => a['zh-hk'])?.['zh-hk'];
  if (zhHk) return toSimplifiedChinese(zhHk);

  const en = title.en || altTitles?.find(a => a.en)?.en;
  if (en) return en;

  // 罗马音（ja-ro）通常无空格且是全大写转写，可读性最差，放在英文之后
  const romaji = title['ja-ro'] || altTitles?.find(a => a['ja-ro'])?.['ja-ro'];
  if (romaji) return romaji;

  const ja = title.ja || altTitles?.find(a => a.ja)?.ja;
  if (ja) return ja;

  return Object.values(title)[0] || '';
}

/** 选简介：中文优先，繁体转简体，最后英文 */
export function pickMangaDescription(description: Record<string, string> | undefined): string | undefined {
  if (!description) return undefined;
  if (description.zh) return description.zh;
  if (description['zh-hk']) return toSimplifiedChinese(description['zh-hk']);
  if (description.en) return description.en;
  const first = Object.values(description)[0];
  return first || undefined;
}

/** 章节号可能是 '110.5' 或空串；空串表示源站没有章节 */
function parseChapterCount(lastChapter: string | undefined): number | undefined {
  if (lastChapter === undefined || lastChapter === null) return undefined;
  const value = parseFloat(lastChapter);
  return Number.isFinite(value) ? value : 0;
}

/** 官方/生肉外链：MangaDex 的 links 里只有 raw / engtl 是可直接阅读的入口 */
function pickOfficialLinks(links: Record<string, string> | undefined): Array<{ label: string; url: string }> | undefined {
  if (!links) return undefined;
  const out: Array<{ label: string; url: string }> = [];
  if (links.raw) out.push({ label: '官方生肉', url: links.raw });
  if (links.engtl) out.push({ label: '官方英文', url: links.engtl });
  return out.length ? out : undefined;
}

// ── MangaDex ─────────────────────────────────────────────

/** MangaDex 搜索：offset 分页，作者与封面通过 includes 随同一次请求返回。 */
async function fetchMangaDex(keyword: string, page: number, timeoutMs = 10_000): Promise<{ items: MangaItem[]; total: number }> {
  const limit = 20;
  const offset = (page - 1) * limit;
  // includes[]=author 与 cover_art 同一次请求返回，不增加请求数
  const url = `${MD_BASE}/manga?title=${encodeURIComponent(keyword)}&limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&order[relevance]=desc`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
    if (!r.ok) throw new Error(`MangaDex ${r.status}`);

    const data = await r.json() as { data: MdManga[]; total: number };
    const items: MangaItem[] = data.data.map(m => {
      const title = pickMangaTitle(m.attributes.title, m.attributes.altTitles);
      const description = pickMangaDescription(m.attributes.description);
      const cover = m.relationships.find(rel => rel.type === 'cover_art');
      const authorRel = m.relationships.find(rel => rel.type === 'author');
      const languages = m.attributes.availableTranslatedLanguages ?? [];
      const chapterCount = parseChapterCount(m.attributes.lastChapter);
      return {
        id: m.id,
        title,
        rawTitle: Object.values(m.attributes.title)[0] || '',
        cover: cover?.attributes?.fileName ? `${COVER_BASE}/${m.id}/${cover.attributes.fileName}.256.jpg` : '',
        status: m.attributes.status,
        tags: m.attributes.tags.map(t => t.attributes.name.zh || t.attributes.name.en).filter(Boolean).slice(0, 5),
        year: m.attributes.year ? String(m.attributes.year) : undefined,
        description,
        author: authorRel?.attributes?.name || undefined,
        readableLanguages: languages.length ? languages : undefined,
        chapterCount,
        // 语言列表为空时无法判断，保持 undefined，不误报「无中文」
        noChineseChapters: languages.length > 0
          ? !languages.some(lang => lang === 'zh' || lang === 'zh-hk')
          : undefined,
        lastUpdated: m.attributes.updatedAt ? m.attributes.updatedAt.slice(0, 10) : undefined,
        officialLinks: pickOfficialLinks(m.attributes.links),
        source: 'mangadex' as const,
      };
    });
    return { items, total: data.total };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── MangaUpdates（第二元数据源）─────────────────────────

/** MangaUpdates 搜索；接口按 page/perpage 分页，返回 results 可能为空。 */
async function fetchMangaUpdates(keyword: string, page: number, timeoutMs = 10_000): Promise<MuHit[]> {
  const r = await fetchWithRetry(MU_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ search: keyword, perpage: 20, page }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`MangaUpdates ${r.status}`);
  const data = await r.json() as { results?: MuHit[] };
  return data.results || [];
}

/** 标题归一化：去掉括号补充说明（如 "(Official Colored)"），只保留字母/数字/汉字 */
function normalizeTitle(value: string): string {
  return value
    .replace(/（[^）]*）|\([^)]*\)|【[^】]*】|\[[^]]*\]/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** MangaUpdates 命中 → 统一 MangaItem；id 用 mu: 前缀避免与 MangaDex UUID 冲突。 */
function muRecordToItem(hit: MuHit): MangaItem {
  const rec = hit.record;
  return {
    id: `mu:${rec.url || rec.title}`,
    title: rec.title,
    cover: rec.image?.url?.original || rec.image?.url?.thumb || '',
    status: '',
    tags: (rec.genres || []).map(g => g.genre).filter(Boolean).slice(0, 5),
    year: rec.year || undefined,
    rating: typeof rec.bayesian_rating === 'number' ? Math.round(rec.bayesian_rating * 100) / 100 : undefined,
    description: rec.description || undefined,
    source: 'mangaupdates',
    detailUrl: rec.url || undefined,
  };
}

/**
 * 用 MangaUpdates 补全 MangaDex 结果。
 * 只认归一化后的标题全等：曾用「长度≥4 就互相包含」的模糊匹配，
 * 实测会把 One Piece 的简介/评分硬塞给 One Piece Academy 等所有衍生作。
 */
function enrichWithMangaUpdates(items: MangaItem[], hits: MuHit[]): MangaItem[] {
  const index = new Map<string, MuRecord>();
  for (const hit of hits) {
    for (const title of [hit.record.title, hit.hit_title]) {
      const key = normalizeTitle(title);
      if (key && !index.has(key)) index.set(key, hit.record);
    }
  }

  return items.map(item => {
    const rec = index.get(normalizeTitle(item.title));
    if (!rec) return item;

    return {
      ...item,
      cover: item.cover || rec.image?.url?.original || rec.image?.url?.thumb || '',
      year: item.year || rec.year || undefined,
      rating: item.rating ?? (typeof rec.bayesian_rating === 'number' ? Math.round(rec.bayesian_rating * 100) / 100 : undefined),
      description: item.description || rec.description || undefined,
      tags: item.tags.length > 0 ? item.tags : (rec.genres || []).map(g => g.genre).filter(Boolean).slice(0, 5),
    };
  });
}

// ── 搜索入口 ─────────────────────────────────────────────

/**
 * 漫画搜索主入口：MangaDex 成功时 MangaUpdates 仅补全元数据；
 * MangaDex 失败时用 MangaUpdates 结果降级。
 */
export async function searchManga(
  keyword: string,
  page: number,
  skip: Set<string> = new Set(),
): Promise<MangaSearchResult> {
  const budgetMs = budgetFor('manga_sources');
  const deadline = createDeadline(budgetMs);
  const [mdRes, muRes] = await Promise.allSettled([
    skip.has('mangadex')
      ? Promise.resolve({ items: [] as MangaItem[], total: 0 })
      : fetchMangaDex(keyword, page, deadline.slice(10_000)),
    skip.has('mangaupdates')
      ? Promise.resolve([] as MuHit[])
      : fetchMangaUpdates(keyword, page, deadline.slice(10_000)),
  ]);

  const errors: Record<string, string | null> = {};
  const errorKinds: Record<string, SearchErrorKind> = {};

  if (mdRes.status === 'rejected') {
    const raw = mdRes.reason instanceof Error ? mdRes.reason.message : String(mdRes.reason);
    errors.mangadex = sanitizeError(raw);
    errorKinds.mangadex = classifySearchError(raw) ?? 'SOURCE_UNAVAILABLE';
    console.error('[manga-search] MangaDex API error:', errors.mangadex);
  }

  let items: MangaItem[] = [];
  let total = 0;
  let hasMore = false;

  if (mdRes.status === 'fulfilled' && !skip.has('mangadex')) {
    const mdTotal = mdRes.value.total;
    total = mdTotal;
    // limit 固定 20，与请求参数一致；只有 MangaDex 返回 total 才能准确判断是否还有下一页
    hasMore = page * 20 < mdTotal;
    // 主源成功时，MangaUpdates 只做补全；它失败不影响结果，不向用户报错
    items = muRes.status === 'fulfilled'
      ? enrichWithMangaUpdates(mdRes.value.items, muRes.value)
      : mdRes.value.items;
  } else if (muRes.status === 'fulfilled' && muRes.value.length > 0) {
    // 主源失败：MangaUpdates 作为降级源
    items = muRes.value.slice(0, 20).map(muRecordToItem);
    total = items.length;
    // MangaUpdates 不返回总数，这里只能用本页条数猜测：
    // 最后一页恰好满 20 条时会多显示一次「加载更多」，下一页返回空数组后自然收敛。
    hasMore = muRes.value.length >= 20;
  }

  if (mdRes.status !== 'fulfilled' && muRes.status === 'rejected') {
    const raw = muRes.reason instanceof Error ? muRes.reason.message : String(muRes.reason);
    errors.mangaupdates = sanitizeError(raw);
    errorKinds.mangaupdates = classifySearchError(raw) ?? 'SOURCE_UNAVAILABLE';
  }

  const sources: Record<string, SourceStat> = {
    mangadex: {
      state: skip.has('mangadex') ? 'skipped'
        : mdRes.status === 'rejected' ? 'failed'
        : (mdRes.status === 'fulfilled' && mdRes.value.items.length > 0) ? 'ok'
        : 'empty',
      count: mdRes.status === 'fulfilled' ? mdRes.value.items.length : 0,
    },
    mangaupdates: {
      state: skip.has('mangaupdates') ? 'skipped'
        : muRes.status === 'rejected' ? 'failed'
        : (muRes.status === 'fulfilled' && muRes.value.length > 0) ? 'ok'
        : 'empty',
      count: muRes.status === 'fulfilled' ? muRes.value.length : 0,
    },
  };

  const diagnostics: SearchDiagnostics = buildDiagnostics({
    category: 'manga_sources',
    keyword,
    page,
    elapsedMs: deadline.elapsed(),
    budgetMs,
    deadlineHit: deadline.expired(),
    works: items.length,
    resources: items.length,
    actionable: items.filter(isMangaActionable).length,
    sources,
  });
  logSearchDiagnostics(diagnostics);

  return {
    resultType: 'manga',
    keyword,
    page,
    total: total || items.length,
    hasMore,
    errors,
    errorKinds,
    manga: items,
    diagnostics,
  };
}