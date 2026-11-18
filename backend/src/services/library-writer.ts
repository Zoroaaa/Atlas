/**
 * 作品写本地库（data_records / data_record_sources）的公共实现。
 *
 * 关注动态、推荐标签、实体浏览共用同一套语义：
 * - 库里没有的：新增（detail_completed=0，之后由补全任务补详情）
 * - 库里已有的：不更新任何业务字段，仅补一条来源归属（INSERT OR IGNORE）
 *
 * 2026-11 起定时同步统一改为「只插入不更新」：外部列表页只负责发现新番号，
 * 已入库作品的数据不再被列表页的标题/日期/演员覆盖。缺的详情交给用户查看详情、
 * 搜索近 3 个月作品或补全任务处理。
 *
 * 标签归属不能写进 data_records.tags：详情补全会覆盖为真实标签；
 * 归属信息放在 data_record_sources.source_data。
 */
import { generateId } from '@/utils';
import { inspectJavCode } from '@codeseek/shared/utils';
import type { JavItem } from '@/services/jav-utils';
import { markJavDetailPending } from './jav-detail-meta';

export interface LibraryWriteOptions {
  sourceName: string;
  sourceType: string;
  sourceData: Record<string, unknown>;
  /** 演员名列表；关注链路传女优名，标签链路不传 */
  actorNames?: string[];
  /** 来源 URL 生成器；默认 JavBus 详情页，JavDB 链路可传自己的地址 */
  sourceUrlOf?: (item: JavItem) => string | undefined;
  /**
   * 列表页自身地址（如 JavBus 女优/系列/厂商/标签页）。
   * 来源行记录该地址后，可反查「这部作品是在哪个实体页发现的」；
   * 不传时退回作品详情页地址。
   */
  attributionUrl?: string;
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
      `SELECT id, dedup_key FROM data_records
       WHERE record_type = 'jav' AND dedup_key IN (${placeholders})`
    )
    .bind(...keys)
    .all<{ id: string; dedup_key: string }>();
  const byKey = new Map((existing.results || []).map((row) => [row.dedup_key, row]));

  const actorsJson = JSON.stringify(actorNames ?? []);
  const sourceDataJson = JSON.stringify(options.sourceData);
  const statements: D1PreparedStatement[] = [];

  for (const item of items) {
    const key = `jav:${item.code}`;
    const exists = byKey.has(key);

    if (!exists) {
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
          )
      );
    }

    // 已存在的记录不改任何字段，但仍要补一条来源归属：
    // 否则后来从女优/系列/厂商/标签页发现的老作品永远不会建立归属关系。
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO data_record_sources
             (id, record_id, source_name, source_type, source_url, source_data, created_at)
           SELECT ?, id, ?, ?, ?, ?, ?
           FROM data_records WHERE record_type = 'jav' AND dedup_key = ?`
        )
        .bind(
          generateId(), options.sourceName, options.sourceType,
          options.attributionUrl
            ?? options.sourceUrlOf?.(item)
            ?? `https://www.javbus.com/${item.code}`,
          sourceDataJson, now, key
        )
    );
  }

  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }

  // 列表页写入的记录只有番号/标题/封面，显式标记详情不完整；
  // 已有 meta 行（包括已补全）不会被覆盖。
  const refreshed = await db
    .prepare(
      `SELECT id FROM data_records
       WHERE record_type = 'jav' AND dedup_key IN (${placeholders})`
    )
    .bind(...keys)
    .all<{ id: string }>();
  await markJavDetailPending(db, (refreshed.results || []).map((row) => row.id));
}
