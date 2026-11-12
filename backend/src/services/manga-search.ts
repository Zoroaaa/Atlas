/**
 * 漫画搜索服务
 * 元数据: MangaDex（主）+ MangaUpdates（第二源，补年份/评分/简介/类型/封面）
 *
 * ⚠️ 类型契约：本文件导出的接口（MangaItem, MangaSearchResult）
 *    与 frontend/src/types/search.ts 保持结构同步。
 *    修改任一端时，请同步更新另一端。
 */

import { fetchWithRetry } from '@/utils/fetch';
import { classifySearchError, sanitizeError, type SearchErrorKind } from '@/utils/error';

// ─── Constants ───────────────────────────────────────────────────────────

const MD_BASE = 'https://api.mangadex.org';
const COVER_BASE = 'https://uploads.mangadex.org/covers';
const MU_API = 'https://api.mangaupdates.com/v1/series/search';
const UA = 'Atlas/1.0 (https://github.com/Zoroaaa)';

// ─── Types ──────────────────────────────────────────────────────────────

interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    description: Record<string, string>;
    status: string;
    year: number | null;
    tags: { attributes: { name: Record<string, string> } }[];
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
  cover: string;
  status: string;
  tags: string[];
  year?: string;
  rating?: number;
  description?: string;
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
}

// ─── MangaDex ───────────────────────────────────────────────────────────

async function fetchMangaDex(keyword: string, page: number): Promise<{ items: MangaItem[]; total: number }> {
  const limit = 20;
  const offset = (page - 1) * limit;
  // includes[]=author 与 cover_art 同一次请求返回，不增加请求数
  const url = `${MD_BASE}/manga?title=${encodeURIComponent(keyword)}&limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&order[relevance]=desc`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetchWithRetry(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
    if (!r.ok) throw new Error(`MangaDex ${r.status}`);

    const data = await r.json() as { data: MdManga[]; total: number };
    const items: MangaItem[] = data.data.map(m => {
      const title = m.attributes.title.zh || m.attributes.title.en || m.attributes.title['ja-ro'] || Object.values(m.attributes.title)[0] || '';
      const cover = m.relationships.find(rel => rel.type === 'cover_art');
      const authorRel = m.relationships.find(rel => rel.type === 'author');
      return {
        id: m.id,
        title,
        cover: cover?.attributes?.fileName ? `${COVER_BASE}/${m.id}/${cover.attributes.fileName}.256.jpg` : '',
        status: m.attributes.status,
        tags: m.attributes.tags.map(t => t.attributes.name.zh || t.attributes.name.en).filter(Boolean).slice(0, 5),
        year: m.attributes.year ? String(m.attributes.year) : undefined,
        author: authorRel?.attributes?.name || undefined,
        source: 'mangadex' as const,
      };
    });
    return { items, total: data.total };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── MangaUpdates（第二元数据源）────────────────────────────────────────

async function fetchMangaUpdates(keyword: string, page: number): Promise<MuHit[]> {
  const r = await fetchWithRetry(MU_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ search: keyword, perpage: 20, page }),
    signal: AbortSignal.timeout(10000),
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

// ─── Search ─────────────────────────────────────────────────────────────

export async function searchManga(
  keyword: string,
  page: number,
  skip: Set<string> = new Set(),
): Promise<MangaSearchResult> {
  const [mdRes, muRes] = await Promise.allSettled([
    skip.has('mangadex') ? Promise.resolve({ items: [] as MangaItem[], total: 0 }) : fetchMangaDex(keyword, page),
    skip.has('mangaupdates') ? Promise.resolve([] as MuHit[]) : fetchMangaUpdates(keyword, page),
  ]);

  const errors: Record<string, string | null> = {};
  const errorKinds: Record<string, SearchErrorKind> = {};

  if (mdRes.status === 'rejected') {
    const raw = mdRes.reason instanceof Error ? mdRes.reason.message : String(mdRes.reason);
    errors.mangadex = sanitizeError(raw);
    errorKinds.mangadex = classifySearchError(raw) ?? 'SOURCE_UNAVAILABLE';
    console.error('[manga-search] MangaDex API error:', errors.mangadex);
  }

  if (mdRes.status === 'fulfilled' && !skip.has('mangadex')) {
    const mdTotal = mdRes.value.total;
    const hasMore = page * 20 < mdTotal;
    // 主源成功时，MangaUpdates 只做补全；它失败不影响结果，不向用户报错
    if (muRes.status === 'fulfilled') {
      return {
        resultType: 'manga',
        keyword,
        page,
        total: mdTotal,
        hasMore,
        errors,
        errorKinds,
        manga: enrichWithMangaUpdates(mdRes.value.items, muRes.value),
      };
    }
    return {
      resultType: 'manga',
      keyword,
      page,
      total: mdTotal,
      hasMore,
      errors,
      errorKinds,
      manga: mdRes.value.items,
    };
  }

  // 主源失败：MangaUpdates 作为降级源
  if (muRes.status === 'fulfilled' && muRes.value.length > 0) {
    const items = muRes.value.slice(0, 20).map(muRecordToItem);
    return {
      resultType: 'manga',
      keyword,
      page,
      total: items.length,
      hasMore: muRes.value.length >= 20,
      errors,
      errorKinds,
      manga: items,
    };
  }

  if (muRes.status === 'rejected') {
    const raw = muRes.reason instanceof Error ? muRes.reason.message : String(muRes.reason);
    errors.mangaupdates = sanitizeError(raw);
    errorKinds.mangaupdates = classifySearchError(raw) ?? 'SOURCE_UNAVAILABLE';
  }

  return {
    resultType: 'manga',
    keyword,
    page,
    total: 0,
    errors,
    errorKinds,
    manga: [],
  };
}