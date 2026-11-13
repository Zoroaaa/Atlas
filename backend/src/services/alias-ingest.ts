/**
 * 别名灌入：从已有元数据源批量补齐 entity_aliases。
 *
 * 只做「拉取 + 归一化 + 落库」，不做在线翻译。
 * 所有函数 best-effort：单个源失败返回 0，不影响其他源。
 */
import {
  upsertAliasRows,
  type EntityAliasInput,
  type EntityType,
} from '@/repositories/entity-alias-repository';
import { toSourceSearchText, toVariantLang } from '@/services/query-normalizer';

const UA = 'Atlas/1.0 (alias-ingest)';
const TIMEOUT_MS = 8000;

type MediaType = 'movie' | 'tv';

export interface IngestCount {
  source: string;
  written: number;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

// ─── TMDB ──────────────────────────────────────────────────────────────

/** TMDB alternative_titles 的 iso_3166_1 → 变体语言 */
const TMDB_REGION_LANG: Record<string, string> = {
  CN: 'zh',
  TW: 'zh-TW',
  HK: 'zh-TW',
  JP: 'ja',
  US: 'en',
  GB: 'en',
};

interface TmdbAltTitlesResponse {
  titles?: Array<{ iso_3166_1?: string; title?: string }>;
}

/** 按 TMDB id 灌入别名（movie/tv 均适用） */
export async function ingestTmdbAliases(
  db: D1Database,
  mediaType: MediaType,
  tmdbId: number,
  apiKey: string | undefined
): Promise<number> {
  if (!apiKey || !tmdbId) return 0;
  const url =
    `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/alternative_titles` +
    `?api_key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson<TmdbAltTitlesResponse>(url);
  if (!data?.titles?.length) return 0;

  const canonicalId = `tmdb:${mediaType}:${tmdbId}`;
  const inputs: EntityAliasInput[] = [];
  for (const item of data.titles) {
    const lang = item.iso_3166_1 ? TMDB_REGION_LANG[item.iso_3166_1] : undefined;
    // 清洗厂牌前缀与消歧后缀：Marvel Studios' Iron Man -> Iron Man
    const alias = toSourceSearchText(item.title?.trim() ?? '');
    if (!lang || !alias || alias.length < 2) continue;
    inputs.push({ entityType: 'work', canonicalId, lang, alias, source: 'tmdb', confidence: 0.9 });
  }
  return upsertAliasRows(db, inputs);
}

interface TmdbSearchResponse {
  results?: Array<{ id?: number; media_type?: string }>;
}

/** 按关键词找到 TMDB 作品并灌入别名（供管理端手动触发） */
export async function ingestTmdbByKeyword(
  db: D1Database,
  keyword: string,
  apiKey: string | undefined
): Promise<number> {
  if (!apiKey) return 0;
  const url =
    `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(keyword)}&language=zh-CN&page=1&include_adult=false`;
  const data = await fetchJson<TmdbSearchResponse>(url);
  const items = (data?.results ?? [])
    .filter((item): item is { id: number; media_type: 'movie' | 'tv' } =>
      typeof item.id === 'number' && (item.media_type === 'movie' || item.media_type === 'tv')
    )
    .slice(0, 3);
  let written = 0;
  for (const item of items) {
    written += await ingestTmdbAliases(db, item.media_type, item.id, apiKey);
  }
  return written;
}

// ─── Bangumi ───────────────────────────────────────────────────────────

interface BangumiSearchResponse {
  results?: number;
  list?: Array<{ id?: number; name?: string; name_cn?: string }>;
}

export async function ingestBangumiByKeyword(
  db: D1Database,
  keyword: string
): Promise<number> {
  const url =
    `https://api.bgm.tv/search/subject/${encodeURIComponent(keyword)}` +
    `?type=2&responseGroup=large&max_results=3`;
  const data = await fetchJson<BangumiSearchResponse>(url);
  if (!data?.list?.length) return 0;
  return ingestBangumiSubjects(db, data.list);
}

/** 直接使用搜索结果写库，避免为灌入别名重复请求 Bangumi */
export async function ingestBangumiSubjects(
  db: D1Database,
  subjects: Array<{ id?: number; name?: string; name_cn?: string; nameCN?: string }>
): Promise<number> {
  const inputs: EntityAliasInput[] = [];
  for (const item of subjects.slice(0, 3)) {
    if (!item.id) continue;
    const canonicalId = `bangumi:${item.id}`;
    // Bangumi 的 name 是原始日文标题，name_cn/nameCN 是中文标题
    if (item.name?.trim()) {
      inputs.push({
        entityType: 'work',
        canonicalId,
        lang: 'ja',
        alias: item.name.trim(),
        source: 'bangumi',
        confidence: 0.9,
      });
    }
    const nameCn = item.name_cn ?? item.nameCN;
    if (nameCn?.trim()) {
      inputs.push({
        entityType: 'work',
        canonicalId,
        lang: 'zh',
        alias: nameCn.trim(),
        source: 'bangumi',
        confidence: 0.9,
      });
    }
  }
  return upsertAliasRows(db, inputs);
}

// ─── MangaDex ──────────────────────────────────────────────────────────

interface MangaDexResponse {
  data?: Array<{
    id?: string;
    attributes?: {
      title?: Record<string, string>;
      altTitles?: Array<Record<string, string>>;
    };
  }>;
}

export async function ingestMangaDexByKeyword(
  db: D1Database,
  keyword: string
): Promise<number> {
  // MangaDex 对普通 Chrome UA 返回 403 bot challenge，必须使用自定义 UA
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(keyword)}&limit=3`;
  const data = await fetchJson<MangaDexResponse>(url);
  if (!data?.data?.length) return 0;

  const inputs: EntityAliasInput[] = [];
  for (const manga of data.data) {
    if (!manga.id) continue;
    const canonicalId = `mangadex:${manga.id}`;
    const titles = [
      ...Object.entries(manga.attributes?.title ?? {}),
      ...(manga.attributes?.altTitles ?? []).flatMap(entry => Object.entries(entry)),
    ];
    for (const [langTag, alias] of titles) {
      const lang = toVariantLang(langTag);
      const value = alias?.trim();
      if (!lang || !value) continue;
      inputs.push({
        entityType: 'work',
        canonicalId,
        lang,
        alias: value,
        source: 'mangadex',
        confidence: 0.9,
      });
    }
  }
  return upsertAliasRows(db, inputs);
}

// ─── 聚合入口 ──────────────────────────────────────────────────────────

export interface IngestReport {
  tmdb: number;
  bangumi: number;
  mangadex: number;
  failed: string[];
}

/**
 * 按关键词从各元数据源灌入别名。
 * 管理端手动调用；不在用户搜索热路径上。
 */
export async function ingestAliasesForKeyword(
  db: D1Database,
  keyword: string,
  opts: { tmdbApiKey?: string } = {}
): Promise<IngestReport> {
  const tasks: Array<{ source: keyof Omit<IngestReport, 'failed'>; run: () => Promise<number> }> = [
    { source: 'tmdb', run: () => ingestTmdbByKeyword(db, keyword, opts.tmdbApiKey) },
    { source: 'bangumi', run: () => ingestBangumiByKeyword(db, keyword) },
    { source: 'mangadex', run: () => ingestMangaDexByKeyword(db, keyword) },
  ];

  const report: IngestReport = { tmdb: 0, bangumi: 0, mangadex: 0, failed: [] };
  const results = await Promise.allSettled(tasks.map(task => task.run()));
  results.forEach((result, index) => {
    const source = tasks[index].source;
    if (result.status === 'fulfilled') {
      report[source] = result.value;
    } else {
      report.failed.push(source);
      console.error(`[alias-ingest] ${source} failed:`, result.reason);
    }
  });
  return report;
}

/** 内部类型守卫：确保 entityType 只能取合法值 */
export function isEntityType(value: string): value is EntityType {
  return value === 'work' || value === 'person' || value === 'tag';
}
