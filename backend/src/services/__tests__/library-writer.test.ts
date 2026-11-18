import { describe, expect, it } from 'vitest';
import { upsertWorksToLibrary } from '../library-writer';

interface WriteCall {
  sql: string;
  args: unknown[];
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** 最小 D1 桩：按顺序返回两次 SELECT 结果，batch/run 全部记录 */
function createFakeDb(
  existingRows: Array<{ id: string; dedup_key: string }>,
  refreshedRows: Array<{ id: string }>
) {
  const writes: WriteCall[] = [];
  const allResults = [existingRows, refreshedRows];
  let allIndex = 0;

  const make = (sql: string, args: unknown[] = []) => ({
    sql: normalize(sql),
    args,
    bind: (...next: unknown[]) => make(sql, next),
    all: async () => ({ results: allResults[allIndex++] ?? [] }),
    first: async () => null,
    run: async () => {
      writes.push({ sql: normalize(sql), args });
      return { success: true };
    },
  });

  const db = {
    prepare: (sql: string) => make(sql),
    batch: async (statements: Array<{ sql: string; args: unknown[] }>) => {
      for (const statement of statements) {
        writes.push({ sql: statement.sql, args: statement.args });
      }
      return [];
    },
  } as unknown as D1Database;

  return { db, writes };
}

const WORKS = [{ code: 'ABC-123', title: '作品标题', source: 'javbus' }];

describe('upsertWorksToLibrary 归属写入', () => {
  it('已入库作品只补来源归属，不更新任何业务字段', async () => {
    const { db, writes } = createFakeDb(
      [{ id: 'rec-1', dedup_key: 'jav:ABC-123' }],
      [{ id: 'rec-1' }]
    );

    await upsertWorksToLibrary(db, WORKS, {
      sourceName: 'JavBus',
      sourceType: 'entity',
      sourceData: { via: 'entity', entityPath: '/series/abc' },
      attributionUrl: 'https://www.javbus.com/series/abc',
    });

    expect(writes.some((write) => write.sql.includes('INSERT INTO data_records'))).toBe(false);
    expect(writes.some((write) => write.sql.includes('UPDATE data_records'))).toBe(false);

    const source = writes.find((write) =>
      write.sql.includes('INSERT OR IGNORE INTO data_record_sources')
    );
    expect(source).toBeTruthy();
    expect(source!.args[1]).toBe('JavBus');
    expect(source!.args[2]).toBe('entity');
    expect(source!.args[3]).toBe('https://www.javbus.com/series/abc');
    expect(source!.args[6]).toBe('jav:ABC-123');
  });

  it('新作品同时插入记录与归属来源', async () => {
    const { db, writes } = createFakeDb([], [{ id: 'rec-new' }]);

    await upsertWorksToLibrary(db, WORKS, {
      sourceName: 'JavBus',
      sourceType: 'genre',
      sourceData: { via: 'genre', genreKey: '2a' },
      attributionUrl: 'https://www.javbus.com/genre/2a',
    });

    const record = writes.find((write) => write.sql.includes('INSERT INTO data_records'));
    expect(record).toBeTruthy();
    expect(record!.args[1]).toBe('jav:ABC-123');

    const source = writes.find((write) =>
      write.sql.includes('INSERT OR IGNORE INTO data_record_sources')
    );
    expect(source!.args[3]).toBe('https://www.javbus.com/genre/2a');
  });

  it('未提供归属 URL 时退回作品详情页地址', async () => {
    const { db, writes } = createFakeDb(
      [{ id: 'rec-1', dedup_key: 'jav:ABC-123' }],
      [{ id: 'rec-1' }]
    );

    await upsertWorksToLibrary(db, WORKS, {
      sourceName: 'JavBus',
      sourceType: 'info',
      sourceData: { via: 'follow' },
    });

    const source = writes.find((write) =>
      write.sql.includes('INSERT OR IGNORE INTO data_record_sources')
    );
    expect(source!.args[3]).toBe('https://www.javbus.com/ABC-123');
  });
});
