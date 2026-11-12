/**
 * 跨语言实体解析（L2）
 *
 * 输入一个用户写法，输出「同一实体在不同语言下的写法」。
 *
 * 解析顺序：
 *   1. 本地 entity_aliases（最快、可离线）
 *   2. Wikipedia langlinks / Wikidata labels+aliases（免费、无 key，仅当允许联网）
 *   3. 确定性变体兜底（L1 已生成）
 *
 * 设计约束：
 *   - 永不抛错：外部源失败时退化为确定性变体。
 *   - 不做在线机器翻译：专名对应关系必须来自可信数据源或人工词表。
 *   - JAV 等敏感类目默认 allowNetwork=false，避免把用户查询发给第三方。
 */
import { token_set_ratio } from 'fuzzball';
import type { EntityType } from '@/repositories/entity-alias-repository';
import {
  findAliasRows,
  listAliasRowsByCanonical,
  upsertAliasRows,
  type EntityAliasInput,
} from '@/repositories/entity-alias-repository';
import {
  aliasKey,
  buildQueryVariants,
  detectScript,
  normalizeDisplay,
  toVariantLang,
  type QueryVariant,
  type VariantLang,
} from '@/services/query-normalizer';
import { normalizeActressKeyword } from '@/services/actress-name-map';

export interface ResolveOptions {
  entityType?: EntityType;
  /** 是否允许在本地未命中时访问 Wikipedia/Wikidata；默认 false */
  allowNetwork?: boolean;
  /** 跳过 isolate 内缓存（管理端刚灌入别名后需要立即看到新结果） */
  bypassCache?: boolean;
}

export interface ResolvedQuery {
  variants: QueryVariant[];
  canonicalIds: string[];
  from: 'deterministic' | 'database' | 'network';
}

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 300;
const NETWORK_TIMEOUT_MS = 5000;
const NETWORK_MATCH_THRESHOLD = 60;

interface CacheEntry {
  expiresAt: number;
  result: ResolvedQuery;
}

const cache = new Map<string, CacheEntry>();

function readCache(key: string): ResolvedQuery | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function writeCache(key: string, result: ResolvedQuery): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
}

function mergeVariants(...lists: QueryVariant[][]): QueryVariant[] {
  const merged = new Map<string, QueryVariant>();
  for (const list of lists) {
    for (const variant of list) {
      const key = aliasKey(variant.text);
      if (!key) continue;
      // 同一文本在不同语言下含义不同，去重必须带上语言
      const dedupeKey = `${variant.lang}|${key}`;
      const existing = merged.get(dedupeKey);
      if (!existing || variant.confidence > existing.confidence) merged.set(dedupeKey, variant);
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
}

/** 人物查询先补人工映射表/OpenCC 得到的日文名，优先级高于字面变换 */
function buildSeedVariants(keyword: string, entityType: EntityType): QueryVariant[] {
  const variants = buildQueryVariants(keyword);
  if (entityType !== 'person') return variants;

  const jp = normalizeActressKeyword(keyword);
  const jpKey = aliasKey(jp);
  const already = variants.some(
    variant => variant.lang === 'ja' && aliasKey(variant.text) === jpKey
  );
  if (jpKey && !already) {
    variants.unshift({ text: jp, lang: 'ja', transform: 'person-map', confidence: 1 });
  }
  return variants;
}

// ─── Wikipedia / Wikidata ──────────────────────────────────────────────

interface Langlink {
  lang?: string;
  title?: string;
}

interface WikipediaPage {
  pageid?: number;
  title?: string;
  langlinks?: Langlink[];
}

interface WikipediaResponse {
  query?: { pages?: WikipediaPage[] };
}

interface WikidataSearchItem {
  id?: string;
  label?: string;
  match?: { type?: string; text?: string };
  aliases?: string[];
}

interface WikidataSearchResponse {
  search?: WikidataSearchItem[];
}

interface WikidataEntity {
  labels?: Record<string, { value?: string }>;
  aliases?: Record<string, Array<{ value?: string }>>;
  sitelinks?: Record<string, { title?: string }>;
}

interface WikidataEntitiesResponse {
  entities?: Record<string, WikidataEntity>;
}

function scoreAlias(input: string, candidate: string): number {
  try {
    // 关闭 full_process：默认会剥离非 ASCII，中文/日文会被清空
    return token_set_ratio(input, candidate, { full_process: false });
  } catch {
    return 0;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Atlas/1.0 (alias-resolver)' },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchWikipediaLanglinks(
  keyword: string,
  entityType: EntityType
): Promise<{ canonicalId: string; variants: QueryVariant[]; inputs: EntityAliasInput[] } | null> {
  const script = detectScript(keyword);
  const wiki = script === 'ja' ? 'ja' : 'zh';
  const url =
    `https://${wiki}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&prop=langlinks&titles=${encodeURIComponent(keyword)}&redirects=1&lllimit=max`;
  const data = await fetchJson<WikipediaResponse>(url);
  const page = data?.query?.pages?.[0];
  if (!page?.title || !page.langlinks?.length) return null;

  const sourceLang: VariantLang = wiki === 'ja' ? 'ja' : 'zh';
  const variants: QueryVariant[] = [
    { text: page.title, lang: sourceLang, transform: 'wikipedia', confidence: 0.9 },
  ];
  for (const link of page.langlinks) {
    const lang = link.lang ? toVariantLang(link.lang) : null;
    const title = link.title?.trim();
    if (!lang || !title) continue;
    variants.push({ text: title, lang, transform: 'wikipedia-langlink', confidence: 0.9 });
  }

  const canonicalId = `wikipedia:${wiki}:${page.title}`;
  const inputs: EntityAliasInput[] = variants.map(variant => ({
    entityType,
    canonicalId,
    lang: variant.lang,
    alias: variant.text,
    source: 'wikipedia',
    confidence: 0.9,
  }));
  return { canonicalId, variants, inputs };
}

async function fetchWikidataAliases(
  keyword: string,
  entityType: EntityType
): Promise<{ canonicalId: string; variants: QueryVariant[]; inputs: EntityAliasInput[] } | null> {
  const script = detectScript(keyword);
  const language = script === 'ja' ? 'ja' : 'zh';
  const searchUrl =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&formatversion=2` +
    `&search=${encodeURIComponent(keyword)}&language=${language}&uselang=${language}&type=item&limit=5`;
  const search = await fetchJson<WikidataSearchResponse>(searchUrl);
  const candidates = search?.search ?? [];

  let best: { id: string; score: number } | null = null;
  for (const item of candidates) {
    if (!item.id) continue;
    const names = [item.label, item.match?.text, ...(item.aliases ?? [])].filter(
      (name): name is string => Boolean(name)
    );
    const score = Math.max(0, ...names.map(name => scoreAlias(keyword, name)));
    if (!best || score > best.score) best = { id: item.id, score };
  }
  if (!best || best.score < NETWORK_MATCH_THRESHOLD) return null;

  const entityUrl =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&formatversion=2` +
    `&ids=${encodeURIComponent(best.id)}&props=labels|aliases|sitelinks` +
    `&languages=zh|zh-hans|zh-hant|ja|en&sitefilter=zhwiki|jawiki|enwiki`;
  const data = await fetchJson<WikidataEntitiesResponse>(entityUrl);
  const entity = data?.entities?.[best.id];
  if (!entity) return null;

  const variants: QueryVariant[] = [];
  for (const [lang, label] of Object.entries(entity.labels ?? {})) {
    const mapped = toVariantLang(lang);
    const value = label.value?.trim();
    if (mapped && value) {
      variants.push({ text: value, lang: mapped, transform: 'wikidata-label', confidence: 0.8 });
    }
  }
  for (const [lang, aliases] of Object.entries(entity.aliases ?? {})) {
    const mapped = toVariantLang(lang);
    if (!mapped) continue;
    for (const alias of aliases) {
      const value = alias.value?.trim();
      if (value) {
        variants.push({ text: value, lang: mapped, transform: 'wikidata-alias', confidence: 0.75 });
      }
    }
  }
  const sitelinkMap: Array<[string, VariantLang]> = [
    ['zhwiki', 'zh'],
    ['jawiki', 'ja'],
    ['enwiki', 'en'],
  ];
  for (const [site, lang] of sitelinkMap) {
    const title = entity.sitelinks?.[site]?.title?.trim();
    if (title) {
      variants.push({ text: title, lang, transform: 'wikidata-sitelink', confidence: 0.8 });
    }
  }
  if (variants.length === 0) return null;

  const canonicalId = `wikidata:${best.id}`;
  const inputs: EntityAliasInput[] = variants.map(variant => ({
    entityType,
    canonicalId,
    lang: variant.lang,
    alias: variant.text,
    source: 'wikidata',
    confidence: variant.confidence,
  }));
  return { canonicalId, variants, inputs };
}

async function enrichFromNetwork(
  db: D1Database,
  keyword: string,
  entityType: EntityType
): Promise<ResolvedQuery | null> {
  const results = await Promise.allSettled([
    fetchWikipediaLanglinks(keyword, entityType),
    fetchWikidataAliases(keyword, entityType),
  ]);

  const hits: Array<{
    canonicalId: string;
    variants: QueryVariant[];
    inputs: EntityAliasInput[];
  }> = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) hits.push(result.value);
  }
  if (hits.length === 0) return null;

  const inputs = hits.flatMap(hit => hit.inputs);
  // 把用户输入本身也记为该实体的别名，下次直接命中
  for (const hit of hits) {
    inputs.push({
      entityType,
      canonicalId: hit.canonicalId,
      lang: detectScript(keyword) === 'ja' ? 'ja' : 'zh',
      alias: normalizeDisplay(keyword),
      source: 'network',
      confidence: 0.65,
    });
  }
  await upsertAliasRows(db, inputs).catch(err => {
    console.error('[alias-resolver] persist aliases failed:', err);
    return 0;
  });

  return {
    variants: mergeVariants(...hits.map(hit => hit.variants)),
    canonicalIds: hits.map(hit => hit.canonicalId),
    from: 'network',
  };
}

/**
 * 校验一个候选别名是否指向同一实体。
 *
 * 做法：拿候选名去 Wikidata 搜索，取候选实体的多语言 labels/aliases，
 * 再与原始输入比对。只有 Wikidata 侧确认「原始写法」出现在同一实体上才通过。
 * 这是 AI 候选唯一允许的入库前置条件。
 */
export async function verifyAliasCandidate(
  sourceKeyword: string,
  candidate: string,
  lang: 'ja' | 'en'
): Promise<boolean> {
  const searchUrl =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&formatversion=2` +
    `&search=${encodeURIComponent(candidate)}&language=${lang}&uselang=${lang}&type=item&limit=3`;
  const search = await fetchJson<WikidataSearchResponse>(searchUrl);
  const ids = (search?.search ?? [])
    .map(item => item.id)
    .filter((id): id is string => Boolean(id))
    .slice(0, 3);
  if (ids.length === 0) return false;

  const entityUrl =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&formatversion=2` +
    `&ids=${encodeURIComponent(ids.join('|'))}&props=labels|aliases` +
    `&languages=zh|zh-hans|zh-hant|ja|en`;
  const data = await fetchJson<WikidataEntitiesResponse>(entityUrl);
  for (const entity of Object.values(data?.entities ?? {})) {
    const names: string[] = [];
    for (const label of Object.values(entity.labels ?? {})) {
      if (label.value) names.push(label.value);
    }
    for (const aliases of Object.values(entity.aliases ?? {})) {
      for (const alias of aliases) {
        if (alias.value) names.push(alias.value);
      }
    }
    if (names.some(name => scoreAlias(sourceKeyword, name) >= NETWORK_MATCH_THRESHOLD)) {
      return true;
    }
  }
  return false;
}

// ─── 对外入口 ──────────────────────────────────────────────────────────

/** 仅查本地别名表（不联网），用于搜索结果卡片等高频路径 */
export async function lookupQueryVariants(
  db: D1Database,
  keyword: string,
  entityType: EntityType = 'work'
): Promise<QueryVariant[]> {
  const deterministic = buildSeedVariants(keyword, entityType);
  const keys = deterministic.map(variant => aliasKey(variant.text)).filter(Boolean);
  if (keys.length === 0) return deterministic;

  try {
    const rows = await findAliasRows(db, keys, entityType);
    if (rows.length === 0) return deterministic;
    const canonicalIds = Array.from(new Set(rows.map(row => row.canonical_id)));
    const allRows = await listAliasRowsByCanonical(db, entityType, canonicalIds);
    const fromDb: QueryVariant[] = [];
    for (const row of allRows) {
      const lang = toVariantLang(row.lang);
      if (!lang) continue;
      fromDb.push({
        text: row.alias,
        lang,
        transform: `db:${row.source}`,
        confidence: row.confidence,
      });
    }
    return mergeVariants(deterministic, fromDb);
  } catch (err) {
    console.error('[alias-resolver] lookup failed:', err);
    return deterministic;
  }
}

/**
 * 完整解析：本地 → 可选联网 → 确定性变体。
 * 任何外部失败都不会抛错，最差情况等价于 buildQueryVariants。
 */
export async function resolveQuery(
  db: D1Database,
  keyword: string,
  options: ResolveOptions = {}
): Promise<ResolvedQuery> {
  const entityType = options.entityType ?? 'work';
  const cacheKey = `${entityType}|${aliasKey(keyword)}`;
  if (!options.bypassCache) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  const deterministic = buildSeedVariants(keyword, entityType);
  const keys = deterministic.map(variant => aliasKey(variant.text)).filter(Boolean);

  let result: ResolvedQuery = {
    variants: deterministic,
    canonicalIds: [],
    from: 'deterministic',
  };

  if (keys.length > 0) {
    try {
      const rows = await findAliasRows(db, keys, entityType);
      if (rows.length > 0) {
        const canonicalIds = Array.from(new Set(rows.map(row => row.canonical_id)));
        const allRows = await listAliasRowsByCanonical(db, entityType, canonicalIds);
        const fromDb: QueryVariant[] = [];
        for (const row of allRows) {
          const lang = toVariantLang(row.lang);
          if (!lang) continue;
          fromDb.push({
            text: row.alias,
            lang,
            transform: `db:${row.source}`,
            confidence: row.confidence,
          });
        }
        result = {
          variants: mergeVariants(deterministic, fromDb),
          canonicalIds,
          from: 'database',
        };
      }
    } catch (err) {
      console.error('[alias-resolver] db lookup failed:', err);
    }
  }

  if (result.from === 'deterministic' && options.allowNetwork) {
    const script = detectScript(keyword);
    if (script === 'han' || script === 'ja') {
      const network = await enrichFromNetwork(db, keyword, entityType).catch(() => null);
      if (network) {
        result = {
          variants: mergeVariants(deterministic, network.variants),
          canonicalIds: network.canonicalIds,
          from: 'network',
        };
      }
    }
  }

  writeCache(cacheKey, result);
  return result;
}

/**
 * 女优名解析：只查本地 person 别名（不联网）。
 * 命中日文别名时直接使用，否则回退到人工映射表 + OpenCC。
 */
export async function resolveActressKeyword(db: D1Database, keyword: string): Promise<string> {
  try {
    const rows = await findAliasRows(db, [aliasKey(keyword)], 'person');
    const ja = rows.find(row => toVariantLang(row.lang) === 'ja');
    if (ja?.alias) return ja.alias;
  } catch (err) {
    console.error('[alias-resolver] actress lookup failed:', err);
  }
  return normalizeActressKeyword(keyword);
}
