/**
 * 推荐系统共享工具
 *
 * 解析：data_records 存 JSON 数组，收藏/历史存逗号分隔字符串，统一收敛成 string[]。
 * 其他：番号判定、种子清洗、缓存键哈希。
 */
import { isJavCodeLike, normalizeJavCode } from '@codeseek/shared/utils';
import type { JavRecommendationItem } from '@/types';

/** 推荐 item 需要的库字段（JavRecordRow / RankingRow 都满足） */
export interface RecommendationRecordLike {
  code: string;
  title: string;
  cover?: string | null;
  actors?: string | null;
  tags?: string | null;
  publisher?: string | null;
  rating?: string | null;
}

/** 是否是 JAV 作品番号（宽识别：标准/日期/下划线/多段/HEYZO 等） */
export function isJavWorkCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return isJavCodeLike(normalizeJavCode(code));
}

/** 统一番号（无效格式原样返回，由调用方决定是否使用） */
export { normalizeJavCode };

/** 解析演员/标签/发行商字段（兼容 JSON 数组与逗号分隔） */
export function parseValueList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return dedupeValues(parsed.map((v) => String(v)));
      }
    } catch {
      // 落到分隔符解析
    }
  }

  return dedupeValues(trimmed.split(/[,，、]/));
}

/** 去空、去引号、按小写 key 去重（保留首次出现的展示值） */
export function dedupeValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.replace(/^["'“”]+|["'“”]+$/g, '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/** 值匹配 key：去空白、小写 */
export function valueKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 种子清洗：去重、去 SQL LIKE 通配符、限长、限量。
 * 这里不拒绝中文/日文标点，只去掉会扩大 LIKE 匹配范围的 % 和 _。
 */
export function cleanSeedValues(values: string[] | undefined, max: number): string[] {
  if (!values) return [];
  const cleaned = values
    .map((v) => v.replace(/[%_]/g, '').trim().slice(0, 100))
    .filter(Boolean);
  return dedupeValues(cleaned).slice(0, max);
}

/** Cache API 读 JSON（内部键，单地域缓存） */
export async function getCachedJson<T>(key: string): Promise<T | null> {
  try {
    const cache = caches.default;
    const response = await cache.match(new Request(`https://internal/recommend/${key}`));
    if (!response) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Cache API 写 JSON */
export async function putCachedJson(
  key: string,
  data: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    const cache = caches.default;
    await cache.put(
      new Request(`https://internal/recommend/${key}`),
      new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttlSeconds}`,
        },
      })
    );
  } catch (err) {
    console.error('[recommend] cache put failed:', err);
  }
}

/** 将库记录转成推荐 item（不含 score/reason，由打分环节补） */
export function recordToRecommendationItem(
  row: RecommendationRecordLike
): Omit<JavRecommendationItem, 'score' | 'reason'> {
  return {
    code: row.code,
    title: row.title || row.code,
    cover: row.cover || undefined,
    actors: parseValueList(row.actors),
    tags: parseValueList(row.tags),
    publisher: row.publisher || undefined,
    rating: row.rating || undefined,
  };
}
