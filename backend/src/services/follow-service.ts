/**
 * 关注女优：JavBus 女优主页抓取 + 新作检测
 *
 * 检测方式：对比"已知番号集合"，不依赖日期（JavBus 收录有延迟，日期不可靠）。
 * 首次抓取只建立基线，不通知，避免一关注就收到一堆旧作。
 */
import { FOLLOW } from '@/constants';
import { getHtml, parseActressList, parseGrid, type JavItem } from '@/services/jav-utils';
import { normalizeActressKeyword } from '@/services/actress-name-map';
import { upsertWorksToLibrary } from '@/services/library-writer';

const JAVBUS_BASE = 'https://www.javbus.com';

/** 关注对象类型：女优沿用原有逻辑，其余为 JavBus 实体列表页 */
export type FollowEntityType = 'actress' | 'director' | 'studio' | 'label' | 'series' | 'tag';

export const FOLLOW_ENTITY_TYPES: FollowEntityType[] = [
  'actress', 'director', 'studio', 'label', 'series', 'tag',
];

/**
 * 关注对象的统一 key：
 * - 女优：JavBus star slug（不含冒号）
 * - 实体：`<类型>:<JavBus 路径去掉开头斜杠>`，如 director:o7、tag:genre/2a
 *
 * 这样女优与实体共用 actress_watch / actress_works / user_follows，
 * 通知、动态聚合、取消关注、已关注态都走同一套读写路径。
 */
export function entityTypeFromKey(key: string): FollowEntityType | undefined {
  const index = key.indexOf(':');
  if (index <= 0) return 'actress';
  const type = key.slice(0, index) as FollowEntityType;
  return FOLLOW_ENTITY_TYPES.includes(type) && type !== 'actress' ? type : undefined;
}

/** 实体 key → JavBus 实体列表页路径 */
export function entityPathFromKey(key: string): string | undefined {
  const index = key.indexOf(':');
  return index > 0 ? `/${key.slice(index + 1)}` : undefined;
}

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

/** 抓取导演/制作商/发行商/系列/标签列表页第一页作品 */
export async function fetchEntityWorks(path: string): Promise<JavItem[]> {
  const html = await getHtml(`${JAVBUS_BASE}${path}`, 15000);
  if (!html) throw new Error('JavBus 无响应');
  if (html.length < 500 || !/id="waterfall"/.test(html)) throw new Error('JavBus 返回异常内容');
  return parseGrid(html, 'javbus-entity');
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
  const entityType = entityTypeFromKey(key);
  if (!entityType) return { ok: false, baseline: false, newCount: 0 };
  let works: JavItem[];
  try {
    works = entityType === 'actress'
      ? await fetchStarWorks(key)
      : await fetchEntityWorks(entityPathFromKey(key)!);
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
    await upsertWorksToLibrary(db, works, {
      sourceName: 'JavBus',
      sourceType: 'info',
      sourceData: { via: 'follow', entityType, entity: watch.name },
      actorNames: entityType === 'actress' ? [watch.name] : undefined,
      now,
    });
  } catch (err) {
    console.error(`[follow] save works to library failed for ${key}:`, err);
  }

  const baseline = watch.baseline_done === 0;
  if (baseline || fresh.length === 0) {
    return { ok: true, baseline, newCount: baseline ? 0 : fresh.length };
  }

  try {
    await notifyFollowers(db, watch, fresh);
  } catch (err) {
    // 通知失败不影响检测结果：作品已入库，本次新作下一轮不会重复推送，
    // 但也不能让通知写失败把整轮标记为抓取失败
    console.error(`[follow] notify followers failed for ${key}:`, err);
  }
  return { ok: true, baseline: false, newCount: fresh.length };
}

/**
 * 推送新作通知：站内按关注者批量写入，邮件按偏好入队。
 *
 * 用 INSERT ... SELECT 一次写完全部关注者，而不是逐人 emitNotification：
 * 单次 cron 的 D1 查询数因此与关注者数量无关（热门女优几百关注者也不会撑爆
 * 单次 invocation 的查询预算）。偏好语义与 emitNotification 保持一致：
 * 站内未设置 = 开启，邮件未设置 = 关闭且邮箱必须已验证。
 * id 只需唯一，交给 SQL 侧随机 hex，省掉逐行生成。
 */
async function notifyFollowers(db: D1Database, watch: WatchRow, fresh: JavItem[]): Promise<void> {
  const codes = fresh.map((w) => w.code);
  const preview = fresh.slice(0, 5).map((w) => `${w.code} ${w.title || ''}`.trim());
  const body = preview.join('\n') + (fresh.length > preview.length ? `\n…共 ${fresh.length} 部` : '');
  const payload = JSON.stringify({
    key: watch.key,
    entityType: entityTypeFromKey(watch.key) ?? 'actress',
    name: watch.name,
    count: fresh.length,
    works: fresh.slice(0, 10).map((w) => ({ code: w.code, title: w.title, cover: w.cover, date: w.date })),
  });
  const title = `${watch.name} 有 ${fresh.length} 部新作`;
  const dedupKey = `follow_new:${watch.key}:${fresh.length}:${codes[0]}`;
  const now = Date.now();

  // 站内：notify_in_app 是"这位女优的提醒开关"（关闭 = 静音），用户级偏好再过滤一次
  await db
    .prepare(
      `INSERT OR IGNORE INTO notifications (id, user_id, type, title, body, payload, dedup_key, created_at)
       SELECT lower(hex(randomblob(16))), f.user_id, 'follow.new_work', ?, ?, ?, ?, ?
       FROM user_follows f
       LEFT JOIN notification_preferences p
         ON p.user_id = f.user_id AND p.type = 'follow.new_work'
       WHERE f.watch_key = ? AND f.notify_in_app = 1
         AND (p.in_app IS NULL OR p.in_app = 1)`
    )
    .bind(title, body, payload, dedupKey, now, watch.key)
    .run();

  // 邮件：默认关闭，只有显式开启且邮箱已验证的才入队，由邮件摘要合并发送
  await db
    .prepare(
      `INSERT OR IGNORE INTO email_queue (id, user_id, type, title, body, payload, dedup_key, status, created_at)
       SELECT lower(hex(randomblob(16))), f.user_id, 'follow.new_work', ?, ?, ?, ?, 'pending', ?
       FROM user_follows f
       JOIN users u ON u.id = f.user_id
       LEFT JOIN notification_preferences p
         ON p.user_id = f.user_id AND p.type = 'follow.new_work'
       WHERE f.watch_key = ? AND f.notify_in_app = 1
         AND p.email = 1 AND u.email IS NOT NULL AND u.email_verified = 1`
    )
    .bind(title, body, payload, dedupKey, now, watch.key)
    .run();
}

/** 定时任务：检查最久没检查的一批（有关注者的）关注对象，失败按指数退避 */
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
