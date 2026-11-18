/**
 * 关注动态「即将发售」同步：给外部同步脚本返回待刷新对象，并接收回传结果写入
 * follow_upcoming / follow_upcoming_sources。
 *
 * 数据由 GitHub Actions 每 30 分钟调用 JavDB App API 抓取，Worker 不直接访问 JavDB。
 */
import { FOLLOW } from '@/constants';
import { inspectJavCode } from '@codeseek/shared/utils';
import { normalizeJavdbCover } from '@/services/javdb-cover';
import { upsertWorksToLibrary } from '@/services/library-writer';

export interface UpcomingTarget {
  watchKey: string;
  entityType: string;
  entityKey: string;
  name: string;
  javdbEntityId?: string;
  lastSyncedAt: number;
  lastAttemptAt: number;
  failCount: number;
}

interface TargetRow {
  watch_key: string;
  entity_type: string;
  entity_key: string;
  name: string;
  javdb_entity_id: string | null;
  last_synced_at: number;
  last_attempt_at: number;
  fail_count: number;
}

/** 东八区当天 YYYY-MM-DD（可选偏移天数） */
export function shanghaiDate(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** 本轮需要同步的关注对象：只含有实际关注者的女优/导演/制作商/系列 */
export async function listUpcomingTargets(
  db: D1Database,
  limit: number
): Promise<UpcomingTarget[]> {
  const batch = Math.min(FOLLOW.UPCOMING_BATCH_MAX, Math.max(1, limit));
  // 失败次数按 2 的幂退避（指数上限 UPCOMING_MAX_BACKOFF_EXP），避免坏目标被反复抓取；
  // 条件写在 SQL 里，保证多实例轮转时也不会重复取到同一批
  const rows = await db
    .prepare(
      `SELECT t.watch_key, t.entity_type, t.entity_key, t.name,
              s.javdb_entity_id,
              COALESCE(s.last_synced_at, 0) AS last_synced_at,
              COALESCE(s.last_attempt_at, 0) AS last_attempt_at,
              COALESCE(s.fail_count, 0) AS fail_count
       FROM follow_targets t
       LEFT JOIN follow_upcoming_sources s ON s.watch_key = t.watch_key
       WHERE t.entity_type IN ('actress', 'director', 'studio', 'series')
         AND EXISTS (SELECT 1 FROM user_follows f WHERE f.watch_key = t.watch_key)
         AND COALESCE(s.last_attempt_at, 0)
             <= ? - (? * (1 << MIN(COALESCE(s.fail_count, 0), ?)))
       ORDER BY COALESCE(s.last_synced_at, 0) ASC,
                COALESCE(s.last_attempt_at, 0) ASC
       LIMIT ?`
    )
    .bind(
      Date.now(),
      FOLLOW.UPCOMING_MIN_INTERVAL_MS,
      FOLLOW.UPCOMING_MAX_BACKOFF_EXP,
      batch
    )
    .all<TargetRow>();

  return (rows.results || []).map((row) => ({
    watchKey: row.watch_key,
    entityType: row.entity_type || 'actress',
    entityKey: row.entity_key,
    name: row.name,
    javdbEntityId: row.javdb_entity_id ?? undefined,
    lastSyncedAt: row.last_synced_at,
    lastAttemptAt: row.last_attempt_at,
    failCount: row.fail_count,
  }));
}

export interface UpcomingImportTarget {
  watchKey: string;
  entityType?: string;
  ok: boolean;
  javdbEntityId?: string;
  error?: string;
  works?: Array<{
    code: string;
    title?: string;
    cover?: string;
    releaseDate: string;
  }>;
}

export interface UpcomingImportResult {
  targets: number;
  works: number;
  failed: number;
}

interface NormalizedWork {
  code: string;
  title: string;
  cover: string | null;
  releaseDate: string;
}



async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
}

/** 写入一轮 JavDB 即将发售快照 */
export async function importUpcomingSnapshot(
  db: D1Database,
  payload: { targets: UpcomingImportTarget[] }
): Promise<UpcomingImportResult> {
  const now = Date.now();
  const today = shanghaiDate();

  // 只接受仍然存在的关注对象，避免外键失败或脏 key
  const keys = Array.from(new Set(payload.targets.map((target) => target.watchKey)));
  const placeholders = keys.map(() => '?').join(',');
  const known = keys.length > 0
    ? await db
        .prepare(`SELECT key FROM actress_watch WHERE key IN (${placeholders})`)
        .bind(...keys)
        .all<{ key: string }>()
    : { results: [] as Array<{ key: string }> };
  const knownKeys = new Set((known.results || []).map((row) => row.key));

  const statements: D1PreparedStatement[] = [];
  let works = 0;
  let failed = 0;

  for (const target of payload.targets) {
    if (!knownKeys.has(target.watchKey)) continue;
    const entityType = target.entityType || 'actress';

    if (!target.ok) {
      failed++;
      statements.push(
        db
          .prepare(
            `INSERT INTO follow_upcoming_sources
               (watch_key, entity_type, javdb_entity_id, last_synced_at, last_attempt_at,
                fail_count, last_error, updated_at)
             VALUES (?, ?, NULL, 0, ?, 1, ?, ?)
             ON CONFLICT(watch_key) DO UPDATE SET
               entity_type = excluded.entity_type,
               last_attempt_at = excluded.last_attempt_at,
               fail_count = follow_upcoming_sources.fail_count + 1,
               last_error = excluded.last_error,
               updated_at = excluded.updated_at`
          )
          .bind(target.watchKey, entityType, now, (target.error || 'sync failed').slice(0, 300), now)
      );
      continue;
    }

    const normalized: NormalizedWork[] = [];
    const seen = new Set<string>();
    for (const raw of target.works ?? []) {
      const info = inspectJavCode(raw.code);
      if (!info.recognized || seen.has(info.code)) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.releaseDate)) continue;
      // 只保存未发售/今天发售作品；更早已发售的交给 JavBus 新作链路
      if (raw.releaseDate < today) continue;
      seen.add(info.code);
      normalized.push({
        code: info.code,
        title: (raw.title || info.code).trim().slice(0, 300) || info.code,
        cover: normalizeJavdbCover(raw.cover),
        releaseDate: raw.releaseDate,
      });
      if (normalized.length >= FOLLOW.UPCOMING_MAX_WORKS) break;
    }

    statements.push(
      db
        .prepare(
          `INSERT INTO follow_upcoming_sources
             (watch_key, entity_type, javdb_entity_id, last_synced_at, last_attempt_at,
              fail_count, last_error, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
           ON CONFLICT(watch_key) DO UPDATE SET
             entity_type = excluded.entity_type,
             javdb_entity_id = COALESCE(excluded.javdb_entity_id, follow_upcoming_sources.javdb_entity_id),
             last_synced_at = excluded.last_synced_at,
             last_attempt_at = excluded.last_attempt_at,
             fail_count = 0,
             last_error = NULL,
             updated_at = excluded.updated_at`
        )
        .bind(target.watchKey, entityType, target.javdbEntityId ?? null, now, now, now)
    );

    // 即将发售作品也进本地库（只新增，已入库完全不更新）：
    // 这样搜索、详情、数据存储页都能看到这条占位记录，并带「详情不完整」标记。
    if (normalized.length > 0) {
      await upsertWorksToLibrary(
        db,
        normalized.map((work) => ({
          code: work.code,
          title: work.title,
          cover: work.cover ?? undefined,
          date: work.releaseDate,
          source: 'javdb',
        })),
        {
          sourceName: 'JavDB',
          sourceType: 'info',
          sourceData: { via: 'upcoming', watchKey: target.watchKey },
          sourceUrlOf: (item) => `https://javdb.com/search?q=${encodeURIComponent(item.code)}`,
          now,
        }
      ).catch((err) => console.error('[follow-upcoming] save works to library failed:', err));
    }

    for (const work of normalized) {
      works++;
      statements.push(
        db
          .prepare(
            `INSERT INTO follow_upcoming
               (watch_key, code, title, cover, release_date, source, first_detected_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, 'javdb', ?, ?)
             ON CONFLICT(watch_key, code) DO UPDATE SET
               title = excluded.title,
               cover = COALESCE(excluded.cover, follow_upcoming.cover),
               release_date = excluded.release_date,
               last_seen_at = excluded.last_seen_at`
          )
          .bind(target.watchKey, work.code, work.title, work.cover, work.releaseDate, now, now)
      );
    }

    // 本轮未再出现的作品视为已下架/已发售，直接移除
    statements.push(
      db
        .prepare('DELETE FROM follow_upcoming WHERE watch_key = ? AND last_seen_at < ?')
        .bind(target.watchKey, now)
    );
  }

  // 发售日过去一周的记录不再有展示意义，顺手清理
  statements.push(
    db
      .prepare('DELETE FROM follow_upcoming WHERE release_date < ?')
      .bind(shanghaiDate(-7))
  );

  await runBatches(db, statements);

  return {
    targets: payload.targets.length,
    works,
    failed,
  };
}
