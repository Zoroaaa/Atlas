import { describe, expect, it } from 'vitest';
import { cycleKeyOf, snapshotWindowStartMs } from '../ranking-import';

const at = (iso: string) => Date.parse(iso);

describe('榜单快照键与去重窗口', () => {
  it('周榜按 ISO 周 + 东八区抓取日归档', () => {
    const ts = at('2026-11-17T04:00:00Z'); // 2026-11-17 12:00 CST 周二
    expect(cycleKeyOf('weekly', ts)).toBe('week:2026-W47:2026-11-17');
    expect(snapshotWindowStartMs(ts)).toBe(at('2026-11-16T16:00:00Z')); // 当天 0 点 CST
  });

  it('同一天重跑覆盖，次日保留为新一期', () => {
    const morning = at('2026-11-17T01:00:00Z'); // 09:00 CST
    const evening = at('2026-11-17T13:00:00Z'); // 21:00 CST
    const nextDay = at('2026-11-18T01:00:00Z'); // 次日 09:00 CST
    expect(cycleKeyOf('weekly', morning)).toBe(cycleKeyOf('weekly', evening));
    expect(cycleKeyOf('weekly', nextDay)).not.toBe(cycleKeyOf('weekly', evening));
  });

  it('周榜在周一零点切换 ISO 周', () => {
    const sunday = at('2026-11-22T15:59:00Z'); // 周日 23:59 CST
    const monday = at('2026-11-22T16:00:00Z'); // 周一 00:00 CST
    expect(cycleKeyOf('weekly', sunday)).toBe('week:2026-W47:2026-11-22');
    expect(cycleKeyOf('weekly', monday)).toBe('week:2026-W48:2026-11-23');
  });

  it('月榜与 TOP250 都按「自然月 + 抓取日」归档', () => {
    const ts = at('2026-11-17T04:00:00Z');
    expect(cycleKeyOf('monthly', ts)).toBe('month:2026-11:2026-11-17');
    expect(cycleKeyOf('top250', ts)).toBe('month:2026-11:2026-11-17');
    expect(snapshotWindowStartMs(ts)).toBe(at('2026-11-16T16:00:00Z'));
  });

  it('年度榜按「年份 + 抓取日」归档，同样按天去重', () => {
    const ts = at('2026-11-17T04:00:00Z');
    expect(cycleKeyOf('yearly', ts, 2019)).toBe('year:2019:2026-11-17');
    expect(snapshotWindowStartMs(ts)).toBe(at('2026-11-16T16:00:00Z'));
  });

  it('UTC 月末在东八区已进入下个月', () => {
    const ts = at('2026-10-31T16:30:00Z'); // 2026-11-01 00:30 CST
    expect(cycleKeyOf('monthly', ts)).toBe('month:2026-11:2026-11-01');
    expect(snapshotWindowStartMs(ts)).toBe(at('2026-10-31T16:00:00Z'));
  });
});
