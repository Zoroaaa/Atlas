import { describe, expect, it } from 'vitest';
import { enrichDataRecordFromDetail } from '../data-storage';

interface WriteCall {
  sql: string;
  args: unknown[];
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** 最小 D1 桩：详情读取返回指定旧记录，其余读操作返回 null，写操作全部记录 */
function createFakeDb(existingRow: Record<string, unknown> | null) {
  const writes: WriteCall[] = [];
  const make = (sql: string, args: unknown[] = []) => ({
    sql: normalize(sql),
    args,
    bind: (...next: unknown[]) => make(sql, next),
    first: async () => (sql.includes('FROM data_records') ? existingRow : null),
    all: async () => ({ results: [] }),
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

const MAGNET = {
  name: 'ABC-123',
  size: '1GB',
  date: '2024-01-01',
  magnet: 'magnet:?xt=urn:btih:0123456789abcdef',
  isHD: false,
};

const EXISTING_ROW = {
  id: 'rec-1',
  title: '已有标题',
  cover: 'https://www.javbus.com/pics/cover/old.jpg',
  publisher: '发行商A',
  actors: JSON.stringify(['演员A']),
  tags: JSON.stringify(['标签A']),
  content_data: JSON.stringify({
    code: 'ABC-123',
    title: '已有标题',
    cover: 'https://www.javbus.com/pics/cover/old.jpg',
    detailUrl: 'https://www.javbus.com/ABC-123',
    director: '导演A',
    maker: '制作商A',
    actresses: ['演员A'],
    tags: ['标签A'],
    directorLinks: [{ kind: 'director', name: '导演A', path: '/director/o7' }],
  }),
};

describe('enrichDataRecordFromDetail 字段合并', () => {
  it('残缺详情不覆盖已有的演员、标签、导演、制作商与标题', async () => {
    const { db, writes } = createFakeDb(EXISTING_ROW);

    await enrichDataRecordFromDetail(db, {
      // 模拟解析降级：只给出番号级标题，演员/标签/实体全部为空
      detail: {
        code: 'ABC-123',
        title: 'ABC-123',
        tags: [],
        actresses: [],
        detailUrl: 'https://www.javbus.com/ABC-123',
      },
      magnets: [MAGNET],
    });

    const update = writes.find(
      (write) => write.sql.includes('UPDATE data_records') && write.sql.includes('SET title')
    );
    expect(update).toBeTruthy();
    const args = update!.args;
    expect(args[0]).toBe('已有标题');
    expect(args[2]).toBe(JSON.stringify(['演员A']));
    expect(args[5]).toBe('发行商A');
    expect(args[6]).toBe(JSON.stringify(['标签A']));

    const content = JSON.parse(String(args[7])) as Record<string, unknown>;
    expect(content.director).toBe('导演A');
    expect(content.maker).toBe('制作商A');
    expect(content.actresses).toEqual(['演员A']);
    expect(content.tags).toEqual(['标签A']);
    expect(content.directorLinks).toEqual([
      { kind: 'director', name: '导演A', path: '/director/o7' },
    ]);

    // 合并后导演/制作商/发行商与磁力都在，不能被本次残缺数据降级成 partial
    const completed = writes.find((write) => write.sql.includes('SET detail_completed = 1'));
    expect(completed?.args).toEqual(['rec-1']);
  });

  it('完整详情正常覆盖旧字段', async () => {
    const { db, writes } = createFakeDb(EXISTING_ROW);

    await enrichDataRecordFromDetail(db, {
      detail: {
        code: 'ABC-123',
        title: '真实标题',
        tags: ['标签B'],
        actresses: ['演员B'],
        publisher: '发行商B',
        directors: ['导演B'],
        makers: ['制作商B'],
        detailUrl: 'https://www.javbus.com/ABC-123',
      },
      magnets: [MAGNET],
    });

    const update = writes.find(
      (write) => write.sql.includes('UPDATE data_records') && write.sql.includes('SET title')
    );
    const args = update!.args;
    expect(args[0]).toBe('真实标题');
    expect(args[2]).toBe(JSON.stringify(['演员B']));
    expect(args[5]).toBe('发行商B');
    expect(args[6]).toBe(JSON.stringify(['标签B']));

    const content = JSON.parse(String(args[7])) as Record<string, unknown>;
    expect(content.director).toBe('导演B');
    expect(content.maker).toBe('制作商B');
  });

  it('新记录仍按详情完整写入', async () => {
    const { db, writes } = createFakeDb(null);

    await enrichDataRecordFromDetail(db, {
      detail: {
        code: 'ABC-123',
        title: '新作品',
        tags: ['标签C'],
        actresses: ['演员C'],
        detailUrl: 'https://www.javbus.com/ABC-123',
      },
      magnets: [MAGNET],
    });

    const insert = writes.find((write) => write.sql.includes('INSERT INTO data_records'));
    expect(insert).toBeTruthy();
    expect(insert!.args[1]).toBe('jav:ABC-123');
    expect(insert!.args[2]).toBe('新作品');
    expect(insert!.args[5]).toBe(JSON.stringify(['演员C']));
    expect(insert!.args[9]).toBe(JSON.stringify(['标签C']));
  });
});
