/**
 * 关注女优：JavBus 女优主页抓取 + 新作检测
 *
 * 检测方式：对比"已知番号集合"，不依赖日期（JavBus 收录有延迟，日期不可靠）。
 * 首次抓取只建立基线，不通知，避免一关注就收到一堆旧作。
 */
import { FOLLOW } from '@/constants';
import { getHtml, parseActressList, parseGrid, type JavItem } from '@/services/jav-utils';
import { normalizeActressKeyword } from '@/services/actress-name-map';
import { emitNotification } from '@/services/notification-service';
import { generateId } from '@/utils';
import { inspectJavCode } from '@codeseek/shared/utils';

const JAVBUS_BASE = 'https://www.javbus.com';

export interface ResolvedStar {
  key: string;
  name: string;
  avatar?: string;
}

/** 按名字在 JavBus 查女优 key；未匹配返回 null，资料源异常时抛出 */
export async function resolveStar(name: string): Promise<ResolvedStar | null> {
  const normalized = normalizeActressKeyword(name);
  const html = await getHtml(`${JAVBUS_BASE}/searchstar/${encodeURIComponent(normalized)}`, 15000);
  if (!html) throw new Error('女优资料源无响应');
  if (html.length < 500 || !/id="waterfall"/.test(html)) throw new Error('女优资料源返回异常内容');

  const list = parseActressList(html, 10);
  if (list.length === 0) return null;
  // 只接受名字精确匹配（或唯一结果），宁可提示未找到，也不能悄悄关注成另一个人
  const hit = list.find((e) => e.name === name || e.name === normalized) ?? (list.length === 1 ? list[0] : undefined);
  if (!hit) return null;
  return { key: hit.key, name: hit.name, avatar: hit.cover };
}

/** 抓取女优主页第一页作品（新→旧）。资料源异常时抛出，真正没有作品返回 [] */
export async function fetchStarWorks(key: string): Promise<JavItem[]> {
  const html = await getHtml(`${JAVBUS_BASE}/star/${encodeURIComponent(key)}`, 15000);
  if (!html) throw new Error('JavBus 无响应');
  if (html.length < 500 || !/id="waterfall"/.test(html)) throw new Error('JavBus 返回异常内容');
  return parseGrid(html, 'javbus-star');
}

/**
 * 把抓到的作品写进本地库（data_records / data_record_sources）：
 * - 库里没有的：新增（detail_completed=0，之后由每小时的补全任务补详情）
 * - 库里已有的：只补空缺的演员/发行日期，不覆盖已有数据
 * 失败不影响新作检测。
 */
async function saveWorksToLibrary(
  db: D1Database,
  works: JavItem[],
  actressName: string,
  now: number
): Promise<void> {
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

  const actorsJson = JSON.stringify([actressName]);
  const statements: D1PreparedStatement[] = [];

  for (const item of items) {
    const key = `jav:${item.code}`;
    const row = byKey.get(key);

    if (row) {
      const needActors = !row.actors || row.actors === '[]';
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
           SELECT ?, id, 'JavBus', 'info', ?, ?, ?
           FROM data_records WHERE record_type = 'jav' AND dedup_key = ?`
        )
        .bind(
          generateId(), `https://www.javbus.com/${item.code}`,
          JSON.stringify({ via: 'follow', actress: actressName }), now, key
        )
    );
  }

  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
}

interface WatchRow {
  key: string;
  name: string;
  baseline_done: number;
}

export interface SyncResult {
  ok: boolean;
  baseline: boolean;
  newCount: number;
}

/** 抓取一位女优并落库；发现新作时通知所有开启了站内提醒的关注者 */
export async function syncWatch(db: D1Database, key: string): Promise<SyncResult> {
  const watch = await db
    .prepare('SELECT key, name, baseline_done FROM actress_watch WHERE key = ?')
    .bind(key)
    .first<WatchRow>();
  if (!watch) return { ok: false, baseline: false, newCount: 0 };

  const now = Date.now();
  let works: JavItem[];
  try {
    works = await fetchStarWorks(key);
  } catch (err) {
    console.error(`[follow] fetch star ${key} failed:`, err);
    await db
      .prepare('UPDATE actress_watch SET last_checked_at = ?, fail_count = fail_count + 1 WHERE key = ?')
      .bind(now, key)
      .run();
    return { ok: false, baseline: false, newCount: 0 };
  }

  const known = await db
    .prepare('SELECT code FROM actress_works WHERE watch_key = ?')
    .bind(key)
    .all<{ code: string }>();
  const knownCodes = new Set((known.results || []).map((r) => r.code));

  const seen = new Set<string>();
  const fresh = works.filter((w) => {
    if (!w.code || knownCodes.has(w.code) || seen.has(w.code)) return false;
    seen.add(w.code);
    return true;
  });

  if (fresh.length > 0) {
    await db.batch(
      fresh.map((w) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO actress_works (watch_key, code, title, cover, release_date, first_detected_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(key, w.code, w.title || w.code, w.cover ?? null, w.date ?? null, now)
      )
    );
  }

  await db
    .prepare(
      'UPDATE actress_watch SET last_checked_at = ?, last_ok_at = ?, fail_count = 0, baseline_done = 1 WHERE key = ?'
    )
    .bind(now, now, key)
    .run();

  // 顺便把拉到的作品写进本地库（含已知作品：补齐此前缺失的条目）；失败不影响检测
  try {
    await saveWorksToLibrary(db, works, watch.name, now);
  } catch (err) {
    console.error(`[follow] save works to library failed for ${key}:`, err);
  }

  const baseline = watch.baseline_done === 0;
  if (baseline || fresh.length === 0) {
    return { ok: true, baseline, newCount: baseline ? 0 : fresh.length };
  }

  await notifyFollowers(db, watch, fresh);
  return { ok: true, baseline: false, newCount: fresh.length };
}

async function notifyFollowers(db: D1Database, watch: WatchRow, fresh: JavItem[]): Promise<void> {
  const followers = await db
    .prepare('SELECT user_id FROM user_follows WHERE watch_key = ? AND notify_in_app = 1')
    .bind(watch.key)
    .all<{ user_id: string }>();

  const codes = fresh.map((w) => w.code);
  const preview = fresh.slice(0, 5).map((w) => `${w.code} ${w.title || ''}`.trim());
  const body = preview.join('\n') + (fresh.length > preview.length ? `\n…共 ${fresh.length} 部` : '');
  const payload = {
    key: watch.key,
    name: watch.name,
    count: fresh.length,
    works: fresh.slice(0, 10).map((w) => ({ code: w.code, title: w.title, cover: w.cover, date: w.date })),
  };

  for (const follower of followers.results || []) {
    try {
      await emitNotification(db, {
        userId: follower.user_id,
        type: 'follow.new_work',
        title: `${watch.name} 有 ${fresh.length} 部新作`,
        body,
        payload,
        dedupKey: `follow_new:${watch.key}:${fresh.length}:${codes[0]}`,
      });
    } catch (err) {
      console.error('[follow] emit notification failed:', err);
    }
  }
}

/** 定时任务：检查最久没检查的一批（有关注者的）女优，失败按指数退避 */
export async function runWatchCheck(db: D1Database): Promise<{ checked: number; failed: number }> {
  const due = await db
    .prepare(
      `SELECT w.key FROM actress_watch w
       WHERE EXISTS (SELECT 1 FROM user_follows f WHERE f.watch_key = w.key)
         AND w.last_checked_at <= ? - (? * (1 << MIN(w.fail_count, ?)))
       ORDER BY w.last_checked_at ASC
       LIMIT ?`
    )
    .bind(Date.now(), FOLLOW.WATCH_MIN_INTERVAL_MS, FOLLOW.WATCH_MAX_BACKOFF_EXP, FOLLOW.WATCH_BATCH)
    .all<{ key: string }>();

  const keys = (due.results || []).map((r) => r.key);
  let failed = 0;

  for (let i = 0; i < keys.length; i += FOLLOW.WATCH_CONCURRENCY) {
    const chunk = keys.slice(i, i + FOLLOW.WATCH_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((key) => syncWatch(db, key)));
    for (const r of results) {
      if (r.status === 'rejected' || !r.value.ok) failed++;
    }
  }

  return { checked: keys.length, failed };
}
