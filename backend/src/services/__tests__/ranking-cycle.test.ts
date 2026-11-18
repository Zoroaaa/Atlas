import { describe, expect, it } from 'vitest';
import { parseRankingCycleKey, rankingCycleOf } from '../ranking-cycle';

const at = (iso: string) => Date.parse(iso);

describe('榜单周期与终榜标记', () => {
  it('周榜按 ISO 周分组，周一到周六为历史快照，周日为终榜', () => {
    const monday = at('2026-11-16T04:00:00Z'); // 2026-11-16 12:00 CST 周一
    const sunday = at('2026-11-22T04:00:00Z'); // 2026-11-22 12:00 CST 周日
    expect(rankingCycleOf('weekly', monday)).toEqual({ cycleKey: 'week:2026-W47', isFinal: false });
    expect(rankingCycleOf('weekly', sunday)).toEqual({ cycleKey: 'week:2026-W47', isFinal: true });
  });

  it('周榜跨年时使用 ISO 周年份', () => {
    const ts = at('2025-12-29T04:00:00Z'); // 2025-12-29 12:00 CST 周一，属于 2026 年第 1 周
    expect(rankingCycleOf('weekly', ts).cycleKey).toBe('week:2026-W01');
  });

  it('月榜按自然月分组，月末为终榜', () => {
    expect(rankingCycleOf('monthly', at('2026-11-17T04:00:00Z'))).toEqual({
      cycleKey: 'month:2026-11',
      isFinal: false,
    });
    expect(rankingCycleOf('monthly', at('2026-11-30T04:00:00Z'))).toEqual({
      cycleKey: 'month:2026-11',
      isFinal: true,
    });
  });

  it('年度榜按刷新年分组，12 月为终榜；TOP250 不分周期', () => {
    expect(rankingCycleOf('yearly', at('2026-06-10T04:00:00Z'))).toEqual({
      cycleKey: 'year:2026',
      isFinal: false,
    });
    expect(rankingCycleOf('yearly', at('2026-12-10T04:00:00Z'))).toEqual({
      cycleKey: 'year:2026',
      isFinal: true,
    });
    expect(rankingCycleOf('top250', at('2026-11-17T04:00:00Z'))).toEqual({
      cycleKey: null,
      isFinal: false,
    });
  });
});

describe('周期筛选范围', () => {
  it('周周期换算为东八区周一 0 点到下周一 0 点', () => {
    const range = parseRankingCycleKey('week:2026-W47');
    expect(range).not.toBeNull();
    expect(range?.listType).toBe('weekly');
    expect(range?.startAt).toBe(at('2026-11-15T16:00:00Z')); // 2026-11-16 00:00 CST
    expect(range?.endAt).toBe(at('2026-11-22T16:00:00Z')); // 2026-11-23 00:00 CST
  });

  it('月周期换算为东八区自然月', () => {
    const range = parseRankingCycleKey('month:2026-11');
    expect(range?.startAt).toBe(at('2026-10-31T16:00:00Z')); // 2026-11-01 00:00 CST
    expect(range?.endAt).toBe(at('2026-11-30T16:00:00Z')); // 2026-12-01 00:00 CST
  });

  it('年度周期按刷新年计算，非法周期返回 null', () => {
    const range = parseRankingCycleKey('year:2026');
    expect(range?.startAt).toBe(at('2025-12-31T16:00:00Z')); // 2026-01-01 00:00 CST
    expect(range?.endAt).toBe(at('2026-12-31T16:00:00Z')); // 2027-01-01 00:00 CST
    expect(parseRankingCycleKey('unknown')).toBeNull();
    expect(parseRankingCycleKey('month:2026-13')).toBeNull();
  });
});
