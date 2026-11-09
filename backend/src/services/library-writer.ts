/**
 * 作品写本地库（data_records / data_record_sources）的公共实现。
 *
 * 关注女优与推荐标签共用同一套语义：
 * - 库里没有的：新增（detail_completed=0，之后由每小时补全任务补详情）
 * - 库里已有的：只补空缺的演员/发行日期，不覆盖标题/封面/标签
 *
 * 标签归属不能写进 data_records.tags：详情补全会无条件覆盖为真实标签；
 * 归属信息放在 data_record_sources.source_data。
 */
import { generateId } from '@/utils';
import { inspectJavCode } from '@codeseek/shared/utils';
import type { JavItem } from '@/services/jav-utils';

export interface LibraryWriteOptions {
  sourceName: string;
  sourceType: string;
  sourceData: Record<string, unknown>;
  /** 演员名列表；关注链路传女优名，标签链路不传 */
  actorNames?: string[];
  now?: number;
}

export async function upsertWorksToLibrary(
  db: D1Database,
  works: JavItem[],
  options: LibraryWriteOptions
): Promise<void> {
  const now = options.now ?? Date.now();
  const actorNames = options.actorNames;

  const seen = new Set<string>();
  const items: JavItem[] = [];
  for (const work of works) {
    const info = inspectJavCode(work.code);
    if (!info.recognized || seen.has(info.code)) continue;
    seen.add(info.code);
    items.push({ ...work, code: info.code });
  }
  if (items.length === 0) return;

  const keys = items.map((item) => `jav:${item.code}`);
  const placeholders = keys.map(() => '?').join(',');
  const existing = await db
    .prepare(
      `SELECT id, dedup_key, actors, release_date FROM data_records
       WHERE record_type = 'jav' AND dedup_key IN (${placeholders})`
    )
    .bind(...keys)
    .all<{ id: string; dedup_key: string; actors: string | null; release_date: string | null }>();
  const byKey = new Map((existing.results || []).map((row) => [row.dedup_key, row]));

  const actorsJson = JSON.stringify(actorNames ?? []);
  const sourceDataJson = JSON.stringify(options.sourceData);
  const statements: D1PreparedStatement[] = [];

  for (const item of items) {
    const key = `jav:${item.code}`;
    const row = byKey.get(key);

    if (row) {
      const needActors = Boolean(actorNames?.length) && (!row.actors || row.actors === '[]');
      const needDate = !row.release_date && Boolean(item.date);
      if (needActors || needDate) {
        statements.push(
          db
            .prepare('UPDATE data_records SET actors = ?, release_date = ?, last_updated_at = ? WHERE id = ?')
            .bind(needActors ? actorsJson : row.actors, needDate ? item.date! : row.release_date, now, row.id)
        );
      }
      continue;
    }

    const recordId = generateId();
    statements.push(
      db
        .prepare(
          `INSERT INTO data_records
             (id, record_type, dedup_key, title, cover, code, actors, duration,
              release_date, publisher, tags, rating, content_data, detail_completed,
              status, source_count, first_seen_at, last_updated_at)
           VALUES (?, 'jav', ?, ?, ?, ?, ?, NULL, ?, NULL, '[]', NULL, '{}', 0, 'active', 0, ?, ?)
           ON CONFLICT(record_type, dedup_key) DO NOTHING`
        )
        .bind(
          recordId, key, (item.title || item.code).slice(0, 300), item.cover ?? null,
          item.code, actorsJson, item.date ?? null, now, now
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO data_record_sources
             (id, record_id, source_name, source_type, source_url, source_data, created_at)
           SELECT ?, id, ?, ?, ?, ?, ?
           FROM data_records WHERE record_type = 'jav' AND dedup_key = ?`
        )
        .bind(
          generateId(), options.sourceName, options.sourceType,
          `https://www.javbus.com/${item.code}`, sourceDataJson, now, key
        )
    );
  }

  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
}
