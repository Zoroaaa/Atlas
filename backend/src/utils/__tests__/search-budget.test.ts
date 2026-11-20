/**
 * 时间预算与诊断指标的单元测试。
 *
 * 只测可确定的部分：预算耗尽判定、slice 下限、诊断字段口径。
 * 不测真实计时（依赖系统时钟会让测试在 CI 上抖动）。
 */
import { describe, it, expect } from 'vitest';
import { createDeadline, budgetFor, MIN_SLICE_MS, SEARCH_BUDGET_MS } from '@/utils/search-budget';
import { buildDiagnostics, actionableRate } from '@/utils/search-metrics';

describe('createDeadline', () => {
  it('预算为 0 时立即过期', () => {
    const d = createDeadline(0);
    expect(d.expired()).toBe(true);
    expect(d.remaining()).toBe(0);
  });

  it('剩余时间永不为负', () => {
    const d = createDeadline(1);
    expect(d.remaining()).toBeGreaterThanOrEqual(0);
  });

  it('slice 不低于下限，避免 AbortSignal 立刻触发', () => {
    const d = createDeadline(0);
    expect(d.slice(15_000)).toBe(MIN_SLICE_MS);
  });

  it('slice 取「剩余」与「上限」的较小值', () => {
    const d = createDeadline(60_000);
    // 上限小于剩余 → 用上限
    expect(d.slice(1_000)).toBe(1_000);
    // 上限大于剩余 → 不超过剩余
    expect(d.slice(60_000)).toBeLessThanOrEqual(60_000);
  });
});

describe('budgetFor', () => {
  it('已知类别返回登记值', () => {
    expect(budgetFor('anime_sources')).toBe(SEARCH_BUDGET_MS.anime_sources);
    expect(budgetFor('movie_sources')).toBe(SEARCH_BUDGET_MS.movie_sources);
  });

  it('未知类别回落到默认值', () => {
    expect(budgetFor('jav_sources')).toBe(SEARCH_BUDGET_MS.default);
  });

  it('动漫预算必须大于 Mikan 的磁力解析预算 7s，否则中文源恒被截断', () => {
    expect(SEARCH_BUDGET_MS.anime_sources).toBeGreaterThan(7_000);
  });
});

describe('buildDiagnostics', () => {
  it('补齐可选字段并取整耗时', () => {
    const d = buildDiagnostics({
      category: 'movie_sources',
      keyword: 'dune',
      page: 1,
      elapsedMs: 1234.56,
      budgetMs: 10_000,
      works: 3,
      resources: 10,
      actionable: 8,
      sources: { tpb: { state: 'ok', count: 10 } },
    });
    expect(d.elapsedMs).toBe(1235);
    expect(d.deadlineHit).toBe(false);
    expect(d.ungrouped).toBe(0);
  });

  it('degraded 与 empty 必须分开，否则源站故障会伪装成「没有资源」', () => {
    const d = buildDiagnostics({
      category: 'movie_sources',
      keyword: 'her',
      page: 1,
      elapsedMs: 100,
      budgetMs: 10_000,
      works: 1,
      resources: 0,
      actionable: 0,
      sources: { tpb: { state: 'degraded', count: 0 } },
    });
    expect(d.sources.tpb.state).toBe('degraded');
    expect(d.sources.tpb.state).not.toBe('empty');
  });
});

describe('actionableRate', () => {
  it('分母为 0 时返回 0，不产生 NaN', () => {
    expect(actionableRate({ actionable: 0, resources: 0 })).toBe(0);
  });

  it('保留三位小数', () => {
    expect(actionableRate({ actionable: 1, resources: 3 })).toBe(0.333);
  });
});
