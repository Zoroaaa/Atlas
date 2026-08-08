/**
 * 作品级资源归组工具
 *
 * 解决问题：多源聚合搜索返回的"作品元数据"和"资源列表"是分离的，
 * 用户需要自己判断哪个磁链属于哪部作品。
 *
 * 本模块通过标题归一化 + 相似度匹配，将资源按作品归组。
 *
 * 使用方式：
 *   import { groupResourcesBySubject } from '@/utils/title-grouping';
 *   const grouped = groupResourcesBySubject(subjects, resources, {
 *     subjectTitles: (s) => [s.nameCN, s.name],
 *     resourceTitle: (r) => r.title,
 *     resourceId: (r) => r.magnet,
 *   });
 */

// ─── 标题归一化 ──────────────────────────────────────────────────────

/**
 * 将资源标题归一化为可比较的核心作品名
 *
 * 处理规则（按顺序）：
 *   1. 去除方括号内容 [字幕组] [1080p]
 *   2. 去除圆括号内容 (1080p) (BD)
 *   3. 去除集数标记 EP01, 第01话, - 01, _01, vol.01, 01-12
 *   4. 去除分辨率 1080p, 720p, 4k, 2160p, 480p, 360p
 *   5. 去除编码 x264, x265, h264, h265, hevc, av1, h.264
 *   6. 去除封装 mp4, mkv, webm, avi
 *   7. 去除版本标记 v2, v3, v1, batch, multi, dual, sub, raw
 *   8. 去除特殊字符，转小写，trim
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';

  let s = title;

  // 1. 去除方括号 [xxx]
  s = s.replace(/\[[^\]]*\]/g, ' ');

  // 2. 去除圆括号 (xxx)
  s = s.replace(/\([^)]*\)/g, ' ');

  // 3. 去除集数标记
  //    EP01, EP.01, Ep.1, Episode 1
  s = s.replace(/ep\.?\s*\d+/gi, ' ');
  //    第01话, 第1话, 第01集, 第1集
  s = s.replace(/第\s*\d+\s*[话集話]/g, ' ');
  //    - 01, _01, .01 (前面是空格或分隔符)
  s = s.replace(/[\s._-]\d{1,3}(?![\d-])/g, ' ');
  //    vol.01, vol 1, volume 1
  s = s.replace(/vol\.?\s*\d+/gi, ' ');
  //    01-12, 01~12 (集数范围)
  s = s.replace(/\d{1,3}\s*[-~]\s*\d{1,3}/g, ' ');

  // 4. 去除分辨率
  s = s.replace(/\b\d{3,4}p\b/gi, ' ');
  s = s.replace(/\b4k\b/gi, ' ');
  s = s.replace(/\b2k\b/gi, ' ');

  // 5. 去除编码
  s = s.replace(/\b[xh]\.?26[45]\b/gi, ' ');
  s = s.replace(/\bhevc\b/gi, ' ');
  s = s.replace(/\bav1?\b/gi, ' ');

  // 6. 去除封装格式
  s = s.replace(/\b(mp4|mkv|webm|avi|mov|flv)\b/gi, ' ');

  // 7. 去除版本/标记
  s = s.replace(/\bv\d+\b/gi, ' ');
  s = s.replace(/\b(batch|multi|dual|sub|raw|bd|dvd|web-?dl|remux|encode|repack)\b/gi, ' ');

  // 8. 清理：去特殊字符，转小写，合并空格
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.toLowerCase();
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// ─── 相似度匹配 ──────────────────────────────────────────────────────

/**
 * 判断归一化后的资源标题是否匹配作品名
 *
 * 策略（按优先级）：
 *   1. 精确匹配（归一化后完全相等）
 *   2. 包含匹配（资源标题包含作品名，或作品名包含资源标题的核心部分）
 *   3. 首词匹配（资源标题的第一个有效词等于作品名的第一个有效词）
 */
export function isTitleMatch(normalizedResource: string, normalizedSubject: string): boolean {
  if (!normalizedResource || !normalizedSubject) return false;

  // 1. 精确匹配
  if (normalizedResource === normalizedSubject) return true;

  // 2. 包含匹配（注意短标题需 >= 3 字符避免误匹配）
  if (normalizedSubject.length >= 3 && normalizedResource.includes(normalizedSubject)) return true;
  if (normalizedResource.length >= 3 && normalizedSubject.includes(normalizedResource)) return true;

  // 3. 首词匹配（处理 "作品名 S2" / "作品名 第二季" 这类续作）
  const subjectWords = normalizedSubject.split(' ').filter(w => w.length >= 2);
  const resourceWords = normalizedResource.split(' ').filter(w => w.length >= 2);
  if (subjectWords.length > 0 && resourceWords.length > 0) {
    // 作品名前两个词都出现在资源标题中
    const firstTwoSubject = subjectWords.slice(0, 2).join(' ');
    if (firstTwoSubject.length >= 3 && normalizedResource.includes(firstTwoSubject)) return true;
  }

  return false;
}

// ─── 归组主函数 ──────────────────────────────────────────────────────

/**
 * 归组配置
 */
export interface GroupConfig<S, R> {
  /** 从作品中提取候选标题列表（如 [中文名, 日文名]） */
  subjectTitles: (subject: S) => string[];
  /** 从资源中提取标题 */
  resourceTitle: (resource: R) => string;
  /** 资源唯一标识（用于去重，通常是 magnet 或 id） */
  resourceId: (resource: R) => string;
}

/**
 * 归组结果
 */
export interface GroupedResult<S, R> {
  /** 作品及其匹配到的资源 */
  groups: Array<{
    subject: S;
    resources: R[];
  }>;
  /** 未匹配到任何作品的资源（单独展示） */
  ungrouped: R[];
}

/**
 * 将资源按作品归组
 *
 * @param subjects 作品列表
 * @param resources 资源列表
 * @param config 归组配置
 * @returns 归组结果（groups 已按资源数降序排列）
 */
export function groupResourcesBySubject<S, R>(
  subjects: S[],
  resources: R[],
  config: GroupConfig<S, R>,
): GroupedResult<S, R> {
  if (subjects.length === 0 || resources.length === 0) {
    return { groups: [], ungrouped: resources };
  }

  // 预计算每个作品的归一化标题候选
  const subjectNormalized = subjects.map(s => ({
    subject: s,
    titles: config.subjectTitles(s)
      .map(t => normalizeTitle(t))
      .filter(t => t.length > 0),
  }));

  const assigned = new Set<string>();
  const groups: Array<{ subject: S; resources: R[] }> = [];

  for (const { subject, titles } of subjectNormalized) {
    const matched: R[] = [];
    for (const r of resources) {
      const id = config.resourceId(r);
      if (assigned.has(id)) continue;

      const normR = normalizeTitle(config.resourceTitle(r));
      // 作品任一标题匹配即可
      if (titles.some(t => isTitleMatch(normR, t))) {
        matched.push(r);
        assigned.add(id);
      }
    }
    groups.push({ subject, resources: matched });
  }

  // 未匹配的资源
  const ungrouped = resources.filter(r => !assigned.has(config.resourceId(r)));

  // 按资源数降序排列
  groups.sort((a, b) => b.resources.length - a.resources.length);

  return { groups, ungrouped };
}
