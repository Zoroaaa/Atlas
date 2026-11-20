/**
 * 搜索时间预算：给一次搜索套总时长上限，超预算后不再发起新的外部请求，
 * 只用已完成的结果组装响应。
 *
 * 约束：只控制「是否继续发起请求」，不强行取消在途请求 —— 取消由各处的 AbortSignal 负责，
 * 两处都做会把本来能成功的源一起丢掉。预算是「止损」，不是「中断」。
 */

/** 子请求最小超时：低于这个值 AbortSignal 会立刻触发，等于必然失败 */
export const MIN_SLICE_MS = 500;

/** 各类别单次搜索的总预算（ms） */
export const SEARCH_BUDGET_MS = {
  /**
   * 动漫最长：Mikan 的磁力要靠逐条下载 .torrent 解 infoHash，
   * 本身就有 7s 预算，压得太紧会把唯一能出磁力的中文源砍掉。
   */
  anime_sources: 12_000,
  /** 影视留出两批 TPB（各 3 关键词）+ EZTV 的空间 */
  movie_sources: 10_000,
  /** 小说要抓 2 个搜索页 + 最多 20 个详情页，靠预算截断而不是靠超时 */
  novel_sources: 10_000,
  /** 漫画只有两个并发元数据请求，预算主要用于兜住慢响应 */
  manga_sources: 9_000,
  /** 其他（JAV 等）不接入新预算体系时使用的中性值 */
  default: 10_000,
} as const;

export interface Deadline {
  /** 剩余毫秒数，永不为负 */
  remaining: () => number;
  /** 是否已超预算 */
  expired: () => boolean;
  /** 自创建起已用毫秒数 */
  elapsed: () => number;
  /** 子请求超时：取剩余预算与给定上限的较小值，并保证不低于 MIN_SLICE_MS */
  slice: (maxMs: number) => number;
}

/** 创建预算句柄；`now` 仅用于测试注入 */
export function createDeadline(budgetMs: number, now: number = Date.now()): Deadline {
  const startedAt = now;
  const deadlineAt = startedAt + Math.max(0, budgetMs);
  return {
    remaining: () => Math.max(0, deadlineAt - Date.now()),
    expired: () => Date.now() >= deadlineAt,
    elapsed: () => Date.now() - startedAt,
    slice: (maxMs: number) => Math.max(MIN_SLICE_MS, Math.min(maxMs, deadlineAt - Date.now())),
  };
}

/** 按 majorCategoryId 取预算；未登记的类别走默认值 */
export function budgetFor(categoryId: string): number {
  return (SEARCH_BUDGET_MS as Record<string, number>)[categoryId] ?? SEARCH_BUDGET_MS.default;
}
