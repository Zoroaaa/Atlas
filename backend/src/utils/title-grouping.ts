/**
 * 作品级资源归组：把多源搜索返回的资源列表按标题相似度归到作品下。
 *
 * 只依赖标题做启发式匹配，不读取资源自身元数据；召回优先，同系列资源可能被归到一起。
 */

// ── 标题归一化 ──────────────────────────────────────────────────────

/**
 * 将资源标题归一化为可比较的核心作品名：去掉发布组、规格、集数与版本标记后，
 * 只保留字母数字与空格。结果不可逆，仅用于相似度比较。
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';

  let s = title;

  // 发布组/字幕组的方括号标记，如 [Lilith-Raws]
  s = s.replace(/\[[^\]]*\]/g, ' ');

  // 圆括号内的规格说明，如 (1080p)、(BD)
  s = s.replace(/\([^)]*\)/g, ' ');

  // 集数标记：EP01 / 第01话 / - 01 / vol.01 / 01-12
  s = s.replace(/ep\.?\s*\d+/gi, ' ');
  s = s.replace(/第\s*\d+\s*[话集話]/g, ' ');
  s = s.replace(/[\s._-]\d{1,3}(?![\d-])/g, ' ');
  s = s.replace(/vol\.?\s*\d+/gi, ' ');
  s = s.replace(/\d{1,3}\s*[-~]\s*\d{1,3}/g, ' ');

  // 分辨率与 4K/2K 标记
  s = s.replace(/\b\d{3,4}p\b/gi, ' ');
  s = s.replace(/\b4k\b/gi, ' ');
  s = s.replace(/\b2k\b/gi, ' ');

  // 编码与封装格式（x264 / hevc / av1 / mp4 / mkv 等）
  s = s.replace(/\b[xh]\.?26[45]\b/gi, ' ');
  s = s.replace(/\bhevc\b/gi, ' ');
  s = s.replace(/\bav1?\b/gi, ' ');
  s = s.replace(/\b(mp4|mkv|webm|avi|mov|flv)\b/gi, ' ');

  // 版本号与发行标记（v2 / batch / web-dl / remux 等）
  s = s.replace(/\bv\d+\b/gi, ' ');
  s = s.replace(/\b(batch|multi|dual|sub|raw|bd|dvd|web-?dl|remux|encode|repack)\b/gi, ' ');

  // 只保留字母数字与空格，转小写并压缩空白
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.toLowerCase();
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// ── 相似度匹配 ──────────────────────────────────────────────────────

/**
 * 判断归一化后的资源标题是否属于该作品：精确 → 互相包含 → 前两个词包含。
 * 短于 3 字符的标题不参与包含匹配，避免单字名误命中。
 */
export function isTitleMatch(normalizedResource: string, normalizedSubject: string): boolean {
  if (!normalizedResource || !normalizedSubject) return false;

  if (normalizedResource === normalizedSubject) return true;

  // 包含匹配：3 字符下限用于压制过短标题带来的误命中
  if (normalizedSubject.length >= 3 && normalizedResource.includes(normalizedSubject)) return true;
  if (normalizedResource.length >= 3 && normalizedSubject.includes(normalizedResource)) return true;

  // 续作（作品名 S2 / 第二季）通常只差后缀，用作品名前两个词做包含判定
  const subjectWords = normalizedSubject.split(' ').filter(w => w.length >= 2);
  const resourceWords = normalizedResource.split(' ').filter(w => w.length >= 2);
  if (subjectWords.length > 0 && resourceWords.length > 0) {
    const firstTwoSubject = subjectWords.slice(0, 2).join(' ');
    if (firstTwoSubject.length >= 3 && normalizedResource.includes(firstTwoSubject)) return true;
  }

  return false;
}

// ── 归组主函数 ──────────────────────────────────────────────────────

/** 归组配置 */
export interface GroupConfig<S, R> {
  /** 从作品中提取候选标题列表（如 [中文名, 日文名]） */
  subjectTitles: (subject: S) => string[];
  /** 从资源中提取标题 */
  resourceTitle: (resource: R) => string;
  /** 资源唯一标识（用于去重，通常是 magnet 或 id） */
  resourceId: (resource: R) => string;
}

/** 归组结果：未命中任何作品的资源进入 ungrouped */
export interface GroupedResult<S, R> {
  /** 作品及其匹配到的资源 */
  groups: Array<{
    subject: S;
    resources: R[];
  }>;
  /** 未匹配到任何作品的资源（单独展示） */
  ungrouped: R[];
}

/** 将资源按作品归组：每条资源只归入第一个命中的作品，groups 按资源数降序。 */
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
      // 作品可能有多个译名，任一命中即认领
      if (titles.some(t => isTitleMatch(normR, t))) {
        matched.push(r);
        assigned.add(id);
      }
    }
    groups.push({ subject, resources: matched });
  }

  const ungrouped = resources.filter(r => !assigned.has(config.resourceId(r)));

  groups.sort((a, b) => b.resources.length - a.resources.length);

  return { groups, ungrouped };
}
