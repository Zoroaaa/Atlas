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
    const counts = [DETAIL_RETRY_DAILY_CAP, DETAIL_RETRY_DAILY_CAP, 0];
    let call = 0;
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ n: counts[Math.min(call++, counts.length - 1)] }),
        }),
      }),
    } as unknown as D1Database;

    const next = await nextStaggeredRetryAt(db, now);

    expect(next).toBe(now + DETAIL_RETRY_DELAY_MS + 2 * 24 * 60 * 60 * 1000);
  });

  it('目标日未排满时保持标准 30 天', async () => {
    const now = Date.UTC(2026, 0, 1, 8, 0, 0);
    const db = {
      prepare: () => ({
        bind: () => ({ first: async () => ({ n: DETAIL_RETRY_DAILY_CAP - 1 }) }),
      }),
    } as unknown as D1Database;

    expect(await nextStaggeredRetryAt(db, now)).toBe(now + DETAIL_RETRY_DELAY_MS);
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
