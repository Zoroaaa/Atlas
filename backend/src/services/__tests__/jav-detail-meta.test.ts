import { describe, expect, it } from 'vitest';
import { resetJavDetailRetry } from '../jav-detail-meta';

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
