import { describe, expect, it } from 'vitest';
import { cycleKeyOf, cycleStartMs } from '../ranking-import';

const at = (iso: string) => Date.parse(iso);

describe('榜单快照周期', () => {
  it('周榜按东八区 ISO 周归档', () => {
    const ts = at('2026-11-17T04:00:00Z'); // 2026-11-17 12:00 CST 周二
    expect(cycleKeyOf('weekly', ts)).toBe('week:2026-W47');
    expect(cycleStartMs('weekly', ts)).toBe(at('2026-11-15T16:00:00Z')); // 周一 00:00 CST
  });

  it('周榜在周一零点切换周期', () => {
    const sunday = at('2026-11-22T15:59:00Z'); // 周日 23:59 CST
    const monday = at('2026-11-22T16:00:00Z'); // 周一 00:00 CST
    expect(cycleKeyOf('weekly', sunday)).toBe('week:2026-W47');
    expect(cycleKeyOf('weekly', monday)).toBe('week:2026-W48');
    expect(cycleStartMs('weekly', monday)).toBe(at('2026-11-22T16:00:00Z'));
  });

  it('月榜与 TOP250 按自然月归档', () => {
    const ts = at('2026-11-17T04:00:00Z');
    expect(cycleKeyOf('monthly', ts)).toBe('month:2026-11');
    expect(cycleKeyOf('top250', ts)).toBe('month:2026-11');
    expect(cycleStartMs('monthly', ts)).toBe(at('2026-10-31T16:00:00Z'));
    expect(cycleStartMs('top250', ts)).toBe(at('2026-10-31T16:00:00Z'));
  });

  it('年度榜按年份归档', () => {
    const ts = at('2026-11-17T04:00:00Z');
    expect(cycleKeyOf('yearly', ts, 2019)).toBe('year:2019');
    expect(cycleStartMs('yearly', ts, 2019)).toBe(at('2018-12-31T16:00:00Z'));
  });

  it('UTC 月末在东八区已进入下个月', () => {
    const ts = at('2026-10-31T16:30:00Z'); // 2026-11-01 00:30 CST
    expect(cycleKeyOf('monthly', ts)).toBe('month:2026-11');
    expect(cycleStartMs('monthly', ts)).toBe(at('2026-10-31T16:00:00Z'));
  });
});
