/**
 * 搜索诊断指标：每次搜索输出一行结构化日志，供 wrangler tail / Logpush 聚合。
 *
 * 约束：只打日志，不写 D1 —— 搜索是最高频路径，任何同步写入都会放大 D1 写压力。
 * 字段名一旦上线即成为报表口径，改名等于改报表：新增字段可以，重命名/删除不行。
 */

/**
 * 源状态三态 + 两态：
 * - ok/empty 是正常结果；failed/timeout 是失败；
 * - degraded 是「HTTP 200 但返回结构表明它在降级」，必须与 empty 分开统计，
 *   否则源站故障会伪装成「没有资源」而永远不可见（apibay 就是这种）。
 */
export type SourceState = 'ok' | 'empty' | 'degraded' | 'failed' | 'timeout' | 'skipped';

export interface SourceStat {
  state: SourceState;
  /** 该源贡献的条目数（含后续被判为不可用的条目） */
  count: number;
  /** 该源耗时；未实际发起请求时不填 */
  ms?: number;
}

export interface SearchDiagnostics {
  category: string;
  keyword: string;
  page: number;
  elapsedMs: number;
  budgetMs: number;
  /** 是否因预算耗尽而没有跑完全部源/页 */
  deadlineHit: boolean;
  /** 作品数（元数据条目） */
  works: number;
  /** 资源数（去重后） */
  resources: number;
  /** 可直接消费的资源数（有磁力/网盘/可读章节/下载直链） */
  actionable: number;
  /** 未归属到任何作品的资源数 */
  ungrouped: number;
  sources: Record<string, SourceStat>;
}

export interface DiagnosticsInput {
  category: string;
  keyword: string;
  page: number;
  elapsedMs: number;
  budgetMs: number;
  deadlineHit?: boolean;
  works: number;
  resources: number;
  actionable: number;
  ungrouped?: number;
  sources: Record<string, SourceStat>;
}

/** 组装诊断信息；四个 search 服务共用，保证口径一致 */
export function buildDiagnostics(input: DiagnosticsInput): SearchDiagnostics {
  return {
    category: input.category,
    keyword: input.keyword,
    page: input.page,
    elapsedMs: Math.round(input.elapsedMs),
    budgetMs: input.budgetMs,
    deadlineHit: input.deadlineHit === true,
    works: input.works,
    resources: input.resources,
    actionable: input.actionable,
    ungrouped: input.ungrouped ?? 0,
    sources: input.sources,
  };
}

/** 单行 JSON 日志；前缀固定，便于日志平台按 `[search-metrics]` 过滤 */
export function logSearchDiagnostics(d: SearchDiagnostics): void {
  // 只记规模与状态，不记具体资源名/磁力：日志不是数据副本
  console.log(`[search-metrics] ${JSON.stringify(d)}`);
}

/** 汇总「可操作率」，用于日志里直接看趋势（分母为 0 时返回 0） */
export function actionableRate(d: Pick<SearchDiagnostics, 'actionable' | 'resources'>): number {
  if (d.resources <= 0) return 0;
  return Math.round((d.actionable / d.resources) * 1000) / 1000;
}
