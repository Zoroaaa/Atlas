import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isJavDetailJobEnabled, runJavDetailJobBatch } from '../jav-detail-job';

const mocks = vi.hoisted(() => ({
  withCronLock: vi.fn(),
  fetchDetail: vi.fn(),
  enrich: vi.fn(),
}));

vi.mock('../cron-lock', () => ({
  withCronLock: mocks.withCronLock,
}));

vi.mock('../jav-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../jav-utils')>();
  return { ...actual, fetchJavbusDetailWithMagnets: mocks.fetchDetail };
});

vi.mock('../data-storage', () => ({
  enrichDataRecordFromDetail: mocks.enrich,
}));

interface WriteCall {
  sql: string;
  args: unknown[];
}

const JOB_ROW = {
  id: 'job-1',
  status: 'running',
  batch_size: 5,
  total: 1,
  processed: 0,
  completed: 0,
  partial: 0,
  absent: 0,
  transient_failed: 0,
  skipped: 0,
  last_error: null,
  created_by: null,
  filter_missing: null,
  created_at: 1,
  updated_at: 1,
  finished_at: null,
};

interface FakeDbOptions {
  running: boolean;
  configValue?: string | null;
  dueRecords?: Array<{ id: string; code: string; title: string }>;
}

/** 按 SQL 形状返回结果的最小 D1 桩，同时记录所有写语句 */
function createFakeDb(options: FakeDbOptions) {
  const writes: WriteCall[] = [];
  const queries: string[] = [];

  const db = {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      queries.push(normalized);

      // gate 直接 prepare().first()，不经过 bind；其余查询走 bind()
      const build = (...args: unknown[]) => ({
        first: async () => {
          // 空转门控
          if (
            normalized.startsWith('SELECT 1 AS one') &&
            normalized.includes('detail_fetch_jobs')
          ) {
            return options.running ? { one: 1 } : null;
          }
          // 运行中任务
          if (normalized.startsWith('SELECT * FROM detail_fetch_jobs')) {
            return options.running ? JOB_ROW : null;
          }
          // 开关
          if (normalized.includes('SELECT value FROM system_config')) {
            return { value: options.configValue ?? null };
          }
          // 详情元数据：统一返回 complete，便于 processOne 判定为 completed
          if (normalized.includes('FROM jav_detail_meta')) {
            return {
              status: 'complete',
              missing_mask: 0,
              attempts: 0,
              transient_failures: 0,
              next_retry_at: 0,
              retry_exhausted: 0,
              last_error: null,
              fetched_at: 1,
            };
          }
          // 收尾判断：没有更多到期记录
          return null;
        },
        all: async () => ({ results: options.dueRecords ?? [] }),
        run: async () => {
          writes.push({ sql: normalized, args });
          return { success: true };
        },
      });

      return { ...build(), bind: (...args: unknown[]) => build(...args) };
    },
  } as unknown as D1Database;

  return { db, writes, queries };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withCronLock.mockImplementation(async (_db, _key, _ttl, fn) => fn());
  mocks.fetchDetail.mockResolvedValue({
    ok: true,
    data: { detail: {}, magnets: [], magnetFetchFailed: false },
  });
  mocks.enrich.mockResolvedValue(undefined);
});

describe('开关解析', () => {
  it.each(['0', 'false', '否', 'no', 'off', 'DISABLED'])('把 %s 识别为关闭', async (value) => {
    const { db } = createFakeDb({ running: false, configValue: value });
    expect(await isJavDetailJobEnabled(db)).toBe(false);
  });

  it.each(['1', 'true', '是', 'yes', 'on'])('把 %s 识别为开启', async (value) => {
    const { db } = createFakeDb({ running: false, configValue: value });
    expect(await isJavDetailJobEnabled(db)).toBe(true);
  });
});

describe('runJavDetailJobBatch 空转门控', () => {
  it('开关关闭 + 全部任务 done：直接短路，不读配置、不抢锁、不抓取', async () => {
    const { db, writes, queries } = createFakeDb({ running: false, configValue: '否' });

    const result = await runJavDetailJobBatch(db);

    expect(result).toEqual({ ran: false, processed: 0 });
    expect(writes).toHaveLength(0);
    expect(mocks.withCronLock).not.toHaveBeenCalled();
    expect(mocks.fetchDetail).not.toHaveBeenCalled();
    // 没有 running 任务时连开关都不需要读
    expect(queries.some((q) => q.includes('FROM system_config'))).toBe(false);
  });

  it('开关关闭 + 最后一条任务 running：在取锁和抓取前短路，任务保持 running', async () => {
    const { db, writes } = createFakeDb({ running: true, configValue: '否' });

    const result = await runJavDetailJobBatch(db);

    expect(result).toEqual({ ran: false, processed: 0 });
    expect(mocks.withCronLock).not.toHaveBeenCalled();
    expect(mocks.fetchDetail).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it('开关关闭 + value=false 同样短路（兼容旧取值）', async () => {
    const { db, writes } = createFakeDb({ running: true, configValue: 'false' });

    expect(await runJavDetailJobBatch(db)).toEqual({ ran: false, processed: 0 });
    expect(writes).toHaveLength(0);
    expect(mocks.fetchDetail).not.toHaveBeenCalled();
  });

  it('开关打开 + running 但没有到期记录：进入批次并收尾标记 done', async () => {
    const { db, writes } = createFakeDb({ running: true, configValue: '1', dueRecords: [] });

    const result = await runJavDetailJobBatch(db);

    expect(result).toEqual({ ran: true, processed: 0 });
    expect(mocks.withCronLock).toHaveBeenCalledTimes(1);
    const finish = writes.find((w) => w.sql.includes("SET status = 'done'"));
    expect(finish).toBeTruthy();
  });

  it('开关打开 + running + 有到期记录：真正发起抓取并推进进度', async () => {
    const { db, writes } = createFakeDb({
      running: true,
      configValue: '1',
      dueRecords: [{ id: 'rec-1', code: 'MIMK-020', title: '测试' }],
    });

    const result = await runJavDetailJobBatch(db);

    expect(result).toEqual({ ran: true, processed: 1 });
    expect(mocks.fetchDetail).toHaveBeenCalledTimes(1);
    expect(mocks.enrich).toHaveBeenCalledTimes(1);

    const progress = writes.find((w) => w.sql.includes('processed = processed + 1'));
    expect(progress).toBeTruthy();
    // 最后一条且无更多到期记录：finished 标记为 1
    expect(progress?.args[7]).toBe(1);
    expect(progress?.args[8]).toBe(1);
  });
});
