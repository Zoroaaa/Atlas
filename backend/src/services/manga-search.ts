/**
 * 漫画搜索服务
 * 元数据: MangaDex API
 *
 * ⚠️ 类型契约：本文件导出的接口（MangaItem, MangaSearchResult）
 *    与 frontend/src/types/search.ts 保持结构同步。
 *    修改任一端时，请同步更新另一端。
 */

import { fetchWithRetry } from '@/utils/fetch';
import { sanitizeError } from '@/utils/error';

// ─── Constants ───────────────────────────────────────────────────────────

const MD_BASE = 'https://api.mangadex.org';
const COVER_BASE = 'https://uploads.mangadex.org/covers';
const UA = 'Atlas/1.0 (https://github.com/Zoroaaa)';

// ─── Types ──────────────────────────────────────────────────────────────

interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    description: Record<string, string>;
    status: string;
    tags: { attributes: { name: Record<string, string> } }[];
  };
  relationships: { id: string; type: string; attributes?: { fileName: string } }[];
}

export interface MangaItem {
  id: string;
  title: string;
  cover: string;
  status: string;
  tags: string[];
}

export interface MangaSearchResult {
  resultType: 'manga';
  keyword: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  manga: MangaItem[];
}

// ─── MangaDex API Search ───────────────────────────────────────────────

export async function searchManga(keyword: string, page: number): Promise<MangaSearchResult> {
  const limit = 20;
  const offset = (page - 1) * limit;
  const url = `${MD_BASE}/manga?title=${encodeURIComponent(keyword)}&limit=${limit}&offset=${offset}&includes[]=cover_art&order[relevance]=desc`;

  try {
    // 使用 AbortSignal 实现超时控制 (10秒)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const r = await fetchWithRetry(url, {
      headers: {
        'User-Agent': UA,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!r.ok) {
      throw new Error(`MangaDex ${r.status}`);
    }

    const data = await r.json() as { data: MdManga[]; total: number };

    const items: MangaItem[] = data.data.map(m => {
      const title = m.attributes.title.zh || m.attributes.title.en || m.attributes.title['ja-ro'] || Object.values(m.attributes.title)[0] || '';
      const cover = m.relationships.find(rel => rel.type === 'cover_art');
      return {
        id: m.id,
        title,
        cover: cover?.attributes?.fileName ? `${COVER_BASE}/${m.id}/${cover.attributes.fileName}.256.jpg` : '',
        status: m.attributes.status,
        tags: m.attributes.tags.map(t => t.attributes.name.zh || t.attributes.name.en).filter(Boolean).slice(0, 5),
      };
    });

    return {
      resultType: 'manga',
      keyword,
      page,
      total: data.total,
      errors: {},
      manga: items,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'unknown';
    console.error('[manga-search] MangaDex API error:', sanitizeError(errorMessage));

    return {
      resultType: 'manga',
      keyword,
      page,
      total: 0,
      errors: { mangadex: errorMessage },
      manga: [],
    };
  }
}