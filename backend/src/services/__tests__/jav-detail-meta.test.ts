import { describe, expect, it } from 'vitest';
import {
  DETAIL_RETRY_DAILY_CAP,
  DETAIL_RETRY_DELAY_MS,
  nextStaggeredRetryAt,
  resetJavDetailRetry,
} from '../jav-detail-meta';

interface WriteCall {
  sql: string;
  args: unknown[];
}

/** 最小 D1 桩：只覆盖 resetJavDetailRetry 用到的读一行 / 写一行 */
function createFakeDb(metaRow: Record<string, unknown> | null) {
  const writes: WriteCall[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            first: async () => (sql.includes('FROM jav_detail_meta') ? metaRow : null),
            run: async () => {
              writes.push({ sql: sql.replace(/\s+/g, ' ').trim(), args });
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, writes };
}

const DAY = 24 * 60 * 60 * 1000;
const CST_OFFSET = 8 * 60 * 60 * 1000;

/** 东八区自然日 0 点的时间戳 */
function cstDayStart(timestamp: number): number {
  return Math.floor((timestamp + CST_OFFSET) / DAY) * DAY - CST_OFFSET;
}

/**
 * 错峰查询的最小 D1 桩：按各自然日已排条数返回分组结果。
 * used[i] 表示「起点后第 i 个东八区自然日」已排了多少条。
 */
function createStaggeredDb(origin: number, used: number[]) {
  const binds: unknown[][] = [];
  const db = {
    prepare: () => ({
      bind: (...args: unknown[]) => {
        binds.push(args);
        const rangeStart = Number(args[0]);
        return {
          all: async () => {
            const startIndex = Math.round((rangeStart - origin) / DAY);
            const results: Array<{ day_index: number; n: number }> = [];
            for (let i = 0; i < 200; i++) {
              const absolute = startIndex + i;
              if (absolute >= used.length) break;
              results.push({ day_index: i, n: used[absolute] });
            }
            return { results };
          },
        };
      },
    }),
  } as unknown as D1Database;
  return { db, binds };
}

describe('resetJavDetailRetry', () => {
  it('清零源站缺失/暂时失败次数，清掉耗尽与下次重试时间，保留缺失掩码', async () => {
    const { db, writes } = createFakeDb({
      status: 'partial',
      missing_mask: 8,
      attempts: 3,
      transient_failures: 2,
      next_retry_at: 123456,
      retry_exhausted: 1,
      last_error: '磁力接口暂时不可用',
      fetched_at: 111,
    });

    const meta = await resetJavDetailRetry(db, 'rec-1');

    expect(meta).toMatchObject({
      status: 'pending',
      missingMask: 8,
      attempts: 0,
      transientFailures: 0,
      nextRetryAt: 0,
      retryExhausted: 0,
      lastError: null,
    });

    const insert = writes.find((w) => w.sql.includes('INSERT INTO jav_detail_meta'));
    expect(insert).toBeTruthy();
    // 记录 ID、状态、missing_mask、attempts、transient_failures、next_retry_at、retry_exhausted、last_error
    expect(insert?.args.slice(0, 8)).toEqual(['rec-1', 'pending', 8, 0, 0, 0, 0, null]);

    const update = writes.find((w) => w.sql.includes('UPDATE data_records'));
    expect(update?.args).toEqual([0, 'rec-1']);
  });

  it('30 天重试按单日上限错峰：目标日已满 60 条时顺延一天', async () => {
    const now = Date.UTC(2026, 0, 1, 8, 0, 0);
    const origin = cstDayStart(now + DETAIL_RETRY_DELAY_MS);
    const { db } = createStaggeredDb(origin, [DETAIL_RETRY_DAILY_CAP, DETAIL_RETRY_DAILY_CAP]);

    const next = await nextStaggeredRetryAt(db, now);

    expect(next).toBe(now + DETAIL_RETRY_DELAY_MS + 2 * DAY);
  });

  it('目标日未排满时保持标准 30 天', async () => {
    const now = Date.UTC(2026, 0, 1, 8, 0, 0);
    const origin = cstDayStart(now + DETAIL_RETRY_DELAY_MS);
    const { db } = createStaggeredDb(origin, [DETAIL_RETRY_DAILY_CAP - 1]);

    expect(await nextStaggeredRetryAt(db, now)).toBe(now + DETAIL_RETRY_DELAY_MS);
  });

  it('超过单段扫描范围仍继续向后找空位，不把剩余记录堆到同一天', async () => {
    const now = Date.UTC(2026, 0, 1, 8, 0, 0);
    const origin = cstDayStart(now + DETAIL_RETRY_DELAY_MS);
    const used = Array.from({ length: 90 }, () => DETAIL_RETRY_DAILY_CAP);
    const { db, binds } = createStaggeredDb(origin, used);

    const next = await nextStaggeredRetryAt(db, now);

    expect(next).toBe(now + DETAIL_RETRY_DELAY_MS + 90 * DAY);
    // 第一段 90 天全满，第二段第一条即空位
    expect(binds).toHaveLength(2);
  });

  it('按东八区自然日分桶，而不是 UTC 日', async () => {
    // 东八区 23:30，UTC 仍是当天 15:30：分桶起点必须落在东八区 0 点
    const now = Date.UTC(2026, 0, 1, 15, 30);
    const origin = cstDayStart(now + DETAIL_RETRY_DELAY_MS);
    const { db, binds } = createStaggeredDb(origin, []);

    await nextStaggeredRetryAt(db, now);

    expect(binds[0][0]).toBe(origin);
    expect(Number(binds[0][0]) % DAY).toBe(DAY - CST_OFFSET);
  });

  it('完整记录重置后仍保持 complete，不会重新掉回待补全', async () => {
    const { db, writes } = createFakeDb({
      status: 'complete',
      missing_mask: 0,
      attempts: 0,
      transient_failures: 0,
      next_retry_at: 0,
      retry_exhausted: 0,
      last_error: null,
      fetched_at: 222,
    });

    const meta = await resetJavDetailRetry(db, 'rec-2');
    expect(meta.status).toBe('complete');

    const update = writes.find((w) => w.sql.includes('UPDATE data_records'));
    expect(update?.args).toEqual([1, 'rec-2']);
  });
});
