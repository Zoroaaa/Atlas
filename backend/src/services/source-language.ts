/**
 * 搜索源语言能力注册表（L0）
 *
 * 把「哪个源按什么语言/写法检索」从散落的代码注释收敛成数据。
 * 只收录确有索引语言差异的源；未收录的源保持原有行为（原文透传），
 * 避免一次上线改变全部 100+ 源的可预期行为。
 */
import { isJavCodeLike } from '@codeseek/shared/utils';
import type { QueryVariant, VariantLang } from '@/services/query-normalizer';
import { aliasKey } from '@/services/query-normalizer';

export interface SourceProfile {
  /** 该源搜索索引主要接受的语言/写法 */
  langs: VariantLang[];
  /** 源站搜索大小写敏感（如 TPB/apibay） */
  lowercase?: boolean;
  /** 是否接受番号类精确查询（默认 true） */
  codeSearch?: boolean;
}

/**
 * 已知源的索引语言。
 * 依据：源站实际搜索行为与 docs/source-audit-2026-11-12.md 的实测记录。
 */
const PROFILES: Record<string, SourceProfile> = {
  // ── JAV：番号通用；人物/标题按日文索引检索（界面是繁体中文，但搜索索引不是）──
  javbus: { langs: ['ja'], codeSearch: true },
  javdb: { langs: ['ja'], codeSearch: true },
  javlibrary: { langs: ['ja'], codeSearch: true },
  rjav: { langs: ['en'] },
  missav: { langs: ['ja', 'en'], codeSearch: true },
  supjav: { langs: ['ja', 'en'], codeSearch: true },
  javmost: { langs: ['ja', 'en'], codeSearch: true },
  javguru: { langs: ['ja', 'en'], codeSearch: true },
  av01: { langs: ['ja', 'en'], codeSearch: true },
  jable: { langs: ['ja', 'en'], codeSearch: true },

  // ── 动漫 ──
  bangumi: { langs: ['zh', 'ja'] },
  douban_anime: { langs: ['zh'] },
  myanimelist: { langs: ['en', 'romaji', 'ja'] },
  anilist: { langs: ['en', 'romaji', 'ja'] },
  kitsu: { langs: ['en', 'romaji'] },
  livechart: { langs: ['en', 'romaji'] },
  anidb: { langs: ['en', 'romaji', 'ja'] },
  notifyanime: { langs: ['en'] },
  mikan_project: { langs: ['zh', 'ja'] },
  dmhy: { langs: ['zh', 'ja'] },
  shana_project: { langs: ['zh'] },
  nyaa_si: { langs: ['en', 'ja', 'romaji'] },
  animebytes: { langs: ['en', 'romaji'] },
  bilibili: { langs: ['zh'] },

  // ── 影视 ──
  tmdb: { langs: ['zh', 'en', 'ja'] },
  themoviedb_cn: { langs: ['zh', 'en'] },
  douban_movie: { langs: ['zh'] },
  imdb: { langs: ['en'] },
  trakt: { langs: ['en'] },
  letterboxd: { langs: ['en'] },
  rottentomatoes: { langs: ['en'] },
  metacritic: { langs: ['en'] },
  pirate_bay: { langs: ['en'], lowercase: true },
  eztv: { langs: ['en'] },
  mejortorrent: { langs: ['en'] },

  // ── 漫画 ──
  mangadex: { langs: ['en', 'ja', 'zh'] },
  mangaupdates: { langs: ['en', 'romaji'] },
  anilist_manga: { langs: ['en', 'romaji', 'ja'] },
  kitsu_manga: { langs: ['en', 'romaji'] },
  mal_manga: { langs: ['en', 'romaji'] },
  manganelo: { langs: ['en'] },
  mangakakalot: { langs: ['en'] },
  mangafire: { langs: ['en'] },
  mangasee: { langs: ['en'] },
  dmzj: { langs: ['zh'] },
  manhuagui: { langs: ['zh'] },
  bilibili_manga: { langs: ['zh'] },
  comicwalker: { langs: ['ja', 'en'] },

  // ── 小说 ──
  zxcs: { langs: ['zh'] },
  xqishuta: { langs: ['zh'] },
  zlibrary: { langs: ['zh', 'en'] },
  annas_archive: { langs: ['en', 'zh'] },
};

export function getSourceProfile(sourceId: string): SourceProfile | null {
  return PROFILES[sourceId] ?? null;
}

function mergeVariants(primary: QueryVariant[], extra: QueryVariant[]): QueryVariant[] {
  const merged = new Map<string, QueryVariant>();
  for (const variant of [...primary, ...extra]) {
    const key = aliasKey(variant.text);
    if (!key) continue;
    // 同一文本在不同语言下是不同的检索词（简繁同形、日文新字体），去重必须带语言
    const dedupeKey = `${variant.lang}|${key}`;
    const existing = merged.get(dedupeKey);
    if (!existing || variant.confidence > existing.confidence) {
      merged.set(dedupeKey, variant);
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
}

function matches(variant: QueryVariant, langs: VariantLang[]): boolean {
  if (variant.lang === 'zh-TW' && langs.includes('zh')) return true;
  if (variant.lang === 'zh' && langs.includes('zh-TW')) return true;
  return langs.includes(variant.lang);
}

export interface PickedKeyword {
  text: string;
  lang: VariantLang;
  transform: string;
}

/**
 * 为指定源挑选最可能命中的查询词。
 * 未收录的源直接返回原文，保证行为与改造前一致。
 */
export function pickKeywordForSource(
  sourceId: string,
  keyword: string,
  aliasVariants: QueryVariant[],
  deterministicVariants: QueryVariant[]
): PickedKeyword {
  const profile = getSourceProfile(sourceId);
  if (!profile) {
    return { text: keyword, lang: 'zh', transform: 'raw' };
  }

  // 番号：源站按精确编号检索，不做语言变换
  if (profile.codeSearch !== false && isJavCodeLike(keyword)) {
    return { text: keyword, lang: 'en', transform: 'code' };
  }

  const variants = mergeVariants(deterministicVariants, aliasVariants);

  // 1. 用户原文本身就是该源支持的语言 → 保持原文，不做多余变换
  const original = variants.find(variant => variant.transform === 'original');
  if (original && matches(original, profile.langs)) {
    return finish(original, profile);
  }

  // 2. 否则按源站的索引语言优先级挑词（如 MAL 的 en → romaji → ja）
  for (const lang of profile.langs) {
    const candidates = variants.filter(variant => matches(variant, [lang]));
    if (candidates.length === 0) continue;
    const best = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    return finish(best, profile);
  }

  // 3. 没有任何匹配语言：保留原文，避免把拼音/罗马音当作正式名发送
  const fallback = variants[0];
  if (!fallback) return { text: keyword, lang: 'zh', transform: 'raw' };
  return finish(fallback, profile);
}

function finish(picked: QueryVariant, profile: SourceProfile): PickedKeyword {
  const text = profile.lowercase ? picked.text.toLowerCase() : picked.text;
  return { text, lang: picked.lang, transform: picked.transform };
}
