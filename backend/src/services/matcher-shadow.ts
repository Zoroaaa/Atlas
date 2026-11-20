/**
 * 归属判定影子对比：同一次搜索内同时跑旧实现与新实现，只记录差异，不改变输出。
 *
 * 为什么要在请求内双跑而不是离线回放：抓取结果高度依赖源站当时的返回，
 * 离线无法复现；双跑的成本是几百次字符串比较（亚毫秒），换来的是真实分布上的差异数据。
 */

export interface GroupedLike<S, R> {
  groups: Array<{ subject: S; resources: R[] }>;
  ungrouped: R[];
}

export interface ShadowSummary {
  /** 旧实现未归属、新实现归属了（召回提升） */
  gained: number;
  /** 旧实现归属、新实现未归属（精度优先带来的"漏"，需人工看是否合理） */
  lost: number;
  /** 归属到了不同作品（改判） */
  moved: number;
  /** 总资源数 */
  total: number;
}

function assignmentOf<S, R>(
  grouped: GroupedLike<S, R>,
  subjectId: (subject: S) => string,
  resourceId: (resource: R) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of grouped.groups) {
    const id = subjectId(group.subject);
    for (const resource of group.resources) map.set(resourceId(resource), id);
  }
  return map;
}

/** 计算两套实现的归属差异；只统计，不返回改写后的结果 */
export function compareGrouping<S, R>(
  v1: GroupedLike<S, R>,
  v2: GroupedLike<S, R>,
  subjectId: (subject: S) => string,
  resourceId: (resource: R) => string,
): ShadowSummary {
  const before = assignmentOf(v1, subjectId, resourceId);
  const after = assignmentOf(v2, subjectId, resourceId);
  let gained = 0;
  let lost = 0;
  let moved = 0;

  for (const [resource, subject] of after) {
    const previous = before.get(resource);
    if (!previous) gained++;
    else if (previous !== subject) moved++;
  }
  for (const resource of before.keys()) {
    if (!after.has(resource)) lost++;
  }

  return { gained, lost, moved, total: Math.max(before.size, after.size) };
}

/**
 * 输出一行影子日志。
 *
 * 只在有差异时打，避免每次搜索都刷一条「0 差异」把日志淹掉；
 * 差异才是要看的：lost 里混着「该归没归」和「本来就不该归」，需要配合样本判断。
 */
export function logMatcherShadow(
  category: string,
  keyword: string,
  summary: ShadowSummary,
  samples?: { gained?: string[]; lost?: string[]; moved?: string[] },
): void {
  if (summary.gained === 0 && summary.lost === 0 && summary.moved === 0) return;
  const payload = {
    category,
    keyword,
    ...summary,
    // 每类最多 3 条样本，够定位问题又不至于把日志撑爆
    gainedSamples: samples?.gained?.slice(0, 3),
    lostSamples: samples?.lost?.slice(0, 3),
    movedSamples: samples?.moved?.slice(0, 3),
  };
  console.log(`[matcher-shadow] ${JSON.stringify(payload)}`);
}
