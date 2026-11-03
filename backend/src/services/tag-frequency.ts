/**
 * 标签覆盖率统计
 *
 * 目的：把"高画质""单体作品"这类几乎每部都有的标签从推荐依据里剔除。
 * 注意这不是 IDF 降权：被剔除的标签直接不参与匹配，剩余标签仍按命中数排序
 * （5 个命中 5 个 > 命中 4 个）。
 */
import { RECOMMEND } from '@/constants';
import { getJavTagRows } from '@/repositories/recommendation-repository';
import {
  getCachedJson,
  parseValueList,
  putCachedJson,
  valueKey,
} from './recommendation-utils';

export interface TagFrequency {
  /** 有标签的 active JAV 记录数 */
  total: number;
  /** 标签小写 key → 出现该标签的记录数 */
  df: Record<string, number>;
}

const CACHE_KEY = 'tag-frequency-v1';

/**
 * 技术/发行属性标签：它们描述画质、字幕、发行形式，不描述内容偏好。
 * 不管占比高低，都不应成为推荐依据。
 */
const TECHNICAL_TAGS = new Set(
  [
    '高画质', '高画質', '高畫質', '高清', 'hd', '4k',
    '单体作品', '単体作品', '單體作品',
    '中文字幕', '字幕',
    '无码', '無碼', '有码', '有碼',
    '独家', '獨家',
  ].map(valueKey)
);

export async function getTagFrequency(db: D1Database): Promise<TagFrequency> {
  const cached = await getCachedJson<TagFrequency>(CACHE_KEY);
  if (cached) return cached;

  const rows = await getJavTagRows(db);
  let total = 0;
  const df: Record<string, number> = {};

  for (const raw of rows) {
    const tags = parseValueList(raw);
    if (tags.length === 0) continue;
    total++;
    for (const tag of tags) {
      const key = valueKey(tag);
      if (!key) continue;
      df[key] = (df[key] || 0) + 1;
    }
  }

  const frequency = { total, df };
  await putCachedJson(CACHE_KEY, frequency, RECOMMEND.TAG_STATS_CACHE_TTL);
  return frequency;
}

/**
 * 是否应从推荐依据中剔除：
 *   1. 技术/发行属性标签（画质、字幕、有码/无码等）；
 *   2. 出现在超过阈值作品中的大众标签。
 */
export function isIgnoredTagKey(key: string, frequency: TagFrequency): boolean {
  if (TECHNICAL_TAGS.has(key)) return true;
  if (frequency.total < RECOMMEND.MIN_TAG_CORPUS) return false;
  const count = frequency.df[key] || 0;
  return count / frequency.total >= RECOMMEND.UBIQUITOUS_TAG_RATIO;
}

export function isIgnoredTag(tag: string, frequency: TagFrequency): boolean {
  return isIgnoredTagKey(valueKey(tag), frequency);
}

export function filterDiscriminatingTags(
  tags: string[],
  frequency: TagFrequency
): string[] {
  return tags.filter((tag) => !isIgnoredTag(tag, frequency));
}
