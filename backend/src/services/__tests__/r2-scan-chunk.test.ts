import { describe, expect, it } from 'vitest';
import {
  R2_UPSERT_CHUNK_ROWS,
  upsertR2Objects,
  type R2ObjectUpsertRow,
} from '@/repositories/r2-objects-repository';

interface Captured {
  sql: string;
  args: unknown[];
}

/** 最小 D1 替身：只记录 prepare/bind/batch 的调用，不连数据库 */
function makeFakeDb() {
  const captured: Captured[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          captured.push({ sql, args });
          return this;
        },
      };
    },
    async batch(statements: unknown[]) {
      return statements.map(() => ({ success: true, results: [], meta: {} }));
    },
  };
  return { db: db as unknown as D1Database, captured };
}

function makeRows(count: number): R2ObjectUpsertRow[] {
  return Array.from({ length: count }, (_, index) => ({
    objectKey: `covers/v1/orig/jav/aa/${String(index).padStart(64, 'a')}`,
    urlHash: String(index).padStart(64, 'a'),
    namespace: 'jav',
    byteSize: 1024,
    uploadedAt: 1_700_000_000_000,
    seenAt: 1_700_000_100_000,
  }));
}

describe('upsertR2Objects 分片', () => {
  it('单语句绑定参数不超过 D1 的 100 上限', async () => {
    const { db, captured } = makeFakeDb();
    await upsertR2Objects(db, makeRows(1000), 1_800_000_000_000);

    expect(captured.length).toBeGreaterThan(1);
    for (const statement of captured) {
      expect(statement.args.length).toBeLessThanOrEqual(100);
    }
  });

  it('1000 个对象按每片 14 行切成 72 条语句，最后一片只剩 6 行', async () => {
    const { db, captured } = makeFakeDb();
    await upsertR2Objects(db, makeRows(1000), 1_800_000_000_000);

    expect(R2_UPSERT_CHUNK_ROWS).toBe(14);
    expect(captured).toHaveLength(Math.ceil(1000 / 14));
    // 7 个列 + 1 个 protect_until 占位：满片 99、末片 43
    expect(captured[0].args).toHaveLength(14 * 7 + 1);
    expect(captured[captured.length - 1].args).toHaveLength(6 * 7 + 1);
  });

  it('protectUntil 作为每条语句的最后一个绑定参数', async () => {
    const protectUntil = 1_800_000_000_000;
    const { db, captured } = makeFakeDb();
    await upsertR2Objects(db, makeRows(3), protectUntil);

    expect(captured[0].args[captured[0].args.length - 1]).toBe(protectUntil);
  });

  it('空数组不发任何语句', async () => {
    const { db, captured } = makeFakeDb();
    await upsertR2Objects(db, [], 1_800_000_000_000);
    expect(captured).toHaveLength(0);
  });

  it('增量模式退化为 DO NOTHING，且不多绑 protect_until', async () => {
    const { db, captured } = makeFakeDb();
    await upsertR2Objects(db, makeRows(20), 1_800_000_000_000, 'incremental');

    expect(captured).toHaveLength(2);
    for (const statement of captured) {
      expect(statement.sql).toContain('ON CONFLICT(object_key) DO NOTHING');
      expect(statement.sql).not.toContain('DO UPDATE');
      // 只有 7 列 × 行数，没有额外的 protect_until 占位
      expect(statement.args.length % 7).toBe(0);
      expect(statement.args.length).toBeLessThanOrEqual(14 * 7);
      expect(statement.args).not.toContain(1_800_000_000_000);
    }
  });

  it('全量模式对 reclaimed_at 非空的行打保护期', async () => {
    const { db, captured } = makeFakeDb();
    await upsertR2Objects(db, makeRows(1), 1_800_000_000_000, 'full');

    expect(captured[0].sql).toContain('WHEN r2_objects.reclaimed_at IS NOT NULL');
    expect(captured[0].args[captured[0].args.length - 1]).toBe(1_800_000_000_000);
  });
});
