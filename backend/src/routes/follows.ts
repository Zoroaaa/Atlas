/**
 * 关注女优路由：关注管理 + 关注动态
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { authMiddleware } from '@/middleware/auth';
import { FOLLOW } from '@/constants';
import {
  resolveStar,
  syncWatch,
  entityTypeFromKey,
  entityPathFromKey,
  FOLLOW_ENTITY_TYPES,
  type FollowEntityType,
} from '@/services/follow-service';
import { normalizeJavbusEntityPath } from '@/services/jav-utils';

export const followRoutes = new Hono<{ Bindings: Env }>();

followRoutes.use('*', authMiddleware);

/** 女优：JavBus star slug；实体：`<类型>:<JavBus 路径去掉开头斜杠>` */
const KEY_PATTERN = /^(?:[A-Za-z0-9_-]{1,40}|(?:director|studio|label|series|tag):[A-Za-z0-9][A-Za-z0-9/_-]{0,140})$/;



interface FollowRow {
  key: string;
  entity_type: string;
  entity_key: string;
  name: string;
  avatar: string | null;
  created_at: number;
  notify_in_app: number;
  last_checked_at: number;
  fail_count: number;
  unread: number;
}

// 我的关注列表（≤ MAX_PER_USER，一次返回）
followRoutes.get('/', async (c) => {
  const user = c.get('user');

  try {
    const rows = await c.env.DB.prepare(
      `SELECT f.watch_key AS key, t.entity_type, t.entity_key, t.name, t.avatar,
              f.created_at, f.notify_in_app, t.last_checked_at, t.fail_count,
              (SELECT COUNT(*) FROM actress_works w
                WHERE w.watch_key = f.watch_key AND w.first_detected_at > f.last_viewed_at) AS unread
       FROM user_follows f
       JOIN follow_targets t ON t.watch_key = f.watch_key
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`
    ).bind(user.userId).all<FollowRow>();

    const follows = (rows.results || []).map((r) => ({
      key: r.key,
      entityType: (r.entity_type || 'actress') as FollowEntityType,
      entityKey: r.entity_key,
      name: r.name,
      avatar: r.avatar ?? undefined,
      createdAt: r.created_at,
      notifyInApp: r.notify_in_app === 1,
      lastCheckedAt: r.last_checked_at,
      checkFailing: r.fail_count >= 3,
      unread: r.unread,
    }));

    return c.json(success({
      follows,
      unread: follows.reduce((sum, f) => sum + f.unread, 0),
      limit: FOLLOW.MAX_PER_USER,
    }));
  } catch (err) {
    console.error('Get follows error:', err);
    return c.json(error('SERVER_ERROR', '获取关注列表失败'), 500);
  }
});

// 关注：女优传 key/name；实体传 entityType + key（`<类型>:<路径去掉开头斜杠>`）+ name
followRoutes.post('/', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json<{
      key?: unknown; name?: unknown; avatar?: unknown; entityType?: unknown;
    }>().catch(() => ({} as Record<string, unknown>));
    const rawEntityType = typeof body.entityType === 'string' ? body.entityType.trim() : '';
    const entityType = rawEntityType && FOLLOW_ENTITY_TYPES.includes(rawEntityType as FollowEntityType)
      ? rawEntityType as FollowEntityType
      : undefined;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    let key = typeof body.key === 'string' ? body.key.trim() : '';
    let avatar = typeof body.avatar === 'string' && body.avatar.length <= 500 ? body.avatar : undefined;

    if (!name && !key) return c.json(error('VALIDATION_ERROR', '缺少关注对象名称'), 400);
    if (key && !KEY_PATTERN.test(key)) return c.json(error('VALIDATION_ERROR', '关注对象标识无效'), 400);

    // 实体关注：key 必须是合法 JavBus 实体列表页路径，避免把任意 URL 当成抓取目标
    if (entityType && entityType !== 'actress') {
      if (!key) return c.json(error('VALIDATION_ERROR', '缺少实体标识'), 400);
      if (entityTypeFromKey(key) !== entityType || !name) {
        return c.json(error('VALIDATION_ERROR', '实体参数无效'), 400);
      }
      const path = normalizeJavbusEntityPath(entityPathFromKey(key) ?? '');
      if (!path) return c.json(error('VALIDATION_ERROR', '实体链接无效'), 400);
      key = `${entityType}:${path.slice(1)}`;
    }

    let finalName = name;
    if (!key) {
      let star;
      try {
        star = await resolveStar(name);
      } catch (err) {
        console.error('Resolve star failed:', err);
        return c.json(error('UPSTREAM_ERROR', '女优资料源暂时不可用，请稍后重试'), 502);
      }
      if (!star) return c.json(error('NOT_FOUND', '没有找到这位女优'), 404);
      key = star.key;
      finalName = star.name;
      avatar = avatar ?? star.avatar;
    }
    if (!finalName) finalName = key;

    const existing = await c.env.DB.prepare(
      'SELECT 1 AS ok FROM user_follows WHERE user_id = ? AND watch_key = ?'
    ).bind(user.userId, key).first();
    if (existing) return c.json(success({ key, name: finalName, alreadyFollowing: true }));

    const countRow = await c.env.DB.prepare(
      'SELECT COUNT(*) AS count FROM user_follows WHERE user_id = ?'
    ).bind(user.userId).first<{ count: number }>();
    if ((countRow?.count ?? 0) >= FOLLOW.MAX_PER_USER) {
      return c.json(error('FOLLOW_LIMIT', `最多关注 ${FOLLOW.MAX_PER_USER} 个对象`), 400);
    }

    const now = Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO actress_watch (key, name, avatar, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET name = excluded.name, avatar = COALESCE(excluded.avatar, actress_watch.avatar)`
      ).bind(key, finalName, avatar ?? null, now),
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO user_follows (user_id, watch_key, created_at, last_viewed_at)
         VALUES (?, ?, ?, ?)`
      ).bind(user.userId, key, now, now),
    ]);

    // 立刻抓一次建立基线（只发 1 次子请求），关注动态马上有内容；失败不影响关注，交给定时任务补
    const sync = await syncWatch(c.env.DB, key);

    return c.json(success({ key, name: finalName, baselinePending: !sync.ok }));
  } catch (err) {
    console.error('Follow error:', err);
    return c.json(error('SERVER_ERROR', '关注失败'), 500);
  }
});

followRoutes.patch('/:key{.+}', async (c) => {
  const user = c.get('user');
  const key = c.req.param('key');

  try {
    if (!KEY_PATTERN.test(key)) return c.json(error('VALIDATION_ERROR', '关注对象标识无效'), 400);
    const body = await c.req.json<{ notifyInApp?: unknown }>().catch(() => ({} as Record<string, unknown>));
    if (typeof body.notifyInApp !== 'boolean') {
      return c.json(error('VALIDATION_ERROR', '参数无效'), 400);
    }
    await c.env.DB.prepare(
      'UPDATE user_follows SET notify_in_app = ? WHERE user_id = ? AND watch_key = ?'
    ).bind(body.notifyInApp ? 1 : 0, user.userId, key).run();
    return c.json(success({ key, notifyInApp: body.notifyInApp }));
  } catch (err) {
    console.error('Update follow error:', err);
    return c.json(error('SERVER_ERROR', '更新失败'), 500);
  }
});

followRoutes.delete('/:key{.+}', async (c) => {
  const user = c.get('user');
  const key = c.req.param('key');

  try {
    if (!KEY_PATTERN.test(key)) return c.json(error('VALIDATION_ERROR', '关注对象标识无效'), 400);
    await c.env.DB.prepare(
      'DELETE FROM user_follows WHERE user_id = ? AND watch_key = ?'
    ).bind(user.userId, key).run();
    return c.json(success({ key }));
  } catch (err) {
    console.error('Unfollow error:', err);
    return c.json(error('SERVER_ERROR', '取消关注失败'), 500);
  }
});

// 标记关注动态已读（之后发现的作品才算未读）
followRoutes.post('/viewed', async (c) => {
  const user = c.get('user');
  try {
    await c.env.DB.prepare('UPDATE user_follows SET last_viewed_at = ? WHERE user_id = ?')
      .bind(Date.now(), user.userId).run();
    return c.json(success({}));
  } catch (err) {
    console.error('Mark follows viewed error:', err);
    return c.json(error('SERVER_ERROR', '操作失败'), 500);
  }
});

interface FeedRow {
  code: string;
  title: string;
  cover: string | null;
  release_date: string | null;
  first_detected_at: number;
  watch_key: string;
  entity_type: string;
  entity_key: string;
  entity_name: string;
  last_viewed_at: number;
}

const feedItem = (r: FeedRow) => ({
  code: r.code,
  title: r.title,
  cover: r.cover ?? undefined,
  releaseDate: r.release_date ?? undefined,
  entityType: (r.entity_type || 'actress') as FollowEntityType,
  entityKey: r.entity_key,
  entityName: r.entity_name,
  // 兼容字段：历史前端只认识 actressKey/actressName
  actressKey: r.watch_key,
  actressName: r.entity_name,
  isUnread: r.first_detected_at > r.last_viewed_at,
});

// 关注动态：tab=new（已发售，新→旧）/ upcoming（未发售，近→远）
followRoutes.get('/feed', async (c) => {
  const user = c.get('user');

  try {
    const tab = c.req.query('tab') === 'upcoming' ? 'upcoming' : 'new';
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const pageSize = Math.min(FOLLOW.FEED_MAX_PAGE_SIZE, Math.max(1, parseInt(c.req.query('pageSize') || '10', 10) || 10));
    // "今天"由客户端传本地日期，避免服务端按 UTC 判断发售日偏一天
    const todayParam = c.req.query('today') || '';
    const today = /^\d{4}-\d{2}-\d{2}$/.test(todayParam)
      ? todayParam
      : new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

    const cond = tab === 'upcoming'
      ? 'w.release_date IS NOT NULL AND w.release_date > ?'
      : '(w.release_date IS NULL OR w.release_date <= ?)';
    const order = tab === 'upcoming'
      ? 'w.release_date ASC, w.code ASC'
      : "COALESCE(w.release_date, '') DESC, w.first_detected_at DESC, w.code ASC";

    // 可选：只看某个关注对象（女优/导演/制作商/发行商/系列/标签，实体筛选传 entity）
    const filterParam = (c.req.query('entity') || c.req.query('actress') || '').trim();
    const entityFilter = KEY_PATTERN.test(filterParam);

    const base = `FROM actress_works w
       JOIN user_follows f ON f.watch_key = w.watch_key AND f.user_id = ?
       JOIN follow_targets t ON t.watch_key = w.watch_key
       WHERE ${cond}${entityFilter ? ' AND w.watch_key = ?' : ''}`;
    const baseArgs: unknown[] = entityFilter ? [user.userId, today, filterParam] : [user.userId, today];

    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT w.code, w.title, w.cover, w.release_date, w.first_detected_at, w.watch_key,
                t.entity_type, t.entity_key, t.name AS entity_name, f.last_viewed_at
         ${base} ORDER BY ${order} LIMIT ? OFFSET ?`
      ).bind(...baseArgs, pageSize, (page - 1) * pageSize),
      c.env.DB.prepare(`SELECT COUNT(*) AS count ${base}`).bind(...baseArgs),
    ]);

    const itemRows = (results[0]?.results ?? []) as unknown as FeedRow[];
    const totalRow = results[1]?.results?.[0] as unknown as { count: number } | undefined;

    return c.json(success({
      items: itemRows.map(feedItem),
      total: totalRow?.count ?? 0,
      page,
      pageSize,
    }));
  } catch (err) {
    console.error('Get follow feed error:', err);
    return c.json(error('SERVER_ERROR', '获取关注动态失败'), 500);
  }
});

interface SearchRow extends FeedRow {
  entity_names: string;
  is_unread: number;
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * 关键词集合搜索：在已关注的对象的作品集合里按关键词聚合相关作品。
 *
 * 与「按对象筛选」不同：这里不是过滤某一个关注对象，而是跨全部关注对象
 * 匹配对象名、番号、标题和本地库标签，并把同一番号聚合成一条（多个关注来源合并）。
 * GET /api/follows/search?q=&page=&pageSize=
 */
followRoutes.get('/search', async (c) => {
  const user = c.get('user');

  try {
    const q = (c.req.query('q') || '').trim().slice(0, 60);
    if (!q) return c.json(error('VALIDATION_ERROR', '请输入搜索关键词'), 400);

    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const pageSize = Math.min(FOLLOW.FEED_MAX_PAGE_SIZE, Math.max(1, parseInt(c.req.query('pageSize') || '10', 10) || 10));
    const pattern = `%${escapeLike(q)}%`;

    const base = `FROM actress_works w
       JOIN user_follows f ON f.watch_key = w.watch_key AND f.user_id = ?
       JOIN follow_targets t ON t.watch_key = w.watch_key
       LEFT JOIN data_records dr ON dr.record_type = 'jav' AND dr.code = w.code
       WHERE (t.name LIKE ? ESCAPE '\\' OR w.title LIKE ? ESCAPE '\\'
              OR w.code LIKE ? ESCAPE '\\' OR IFNULL(dr.tags, '') LIKE ? ESCAPE '\\')`;

    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT w.code, MAX(w.title) AS title, MAX(w.cover) AS cover,
                MAX(w.release_date) AS release_date, MIN(w.first_detected_at) AS first_detected_at,
                MAX(w.watch_key) AS watch_key, MAX(t.entity_type) AS entity_type,
                MAX(t.entity_key) AS entity_key,
                GROUP_CONCAT(DISTINCT t.name) AS entity_names,
                MAX(CASE WHEN w.first_detected_at > f.last_viewed_at THEN 1 ELSE 0 END) AS is_unread
         ${base}
         GROUP BY w.code
         ORDER BY COALESCE(MAX(w.release_date), '') DESC, MIN(w.first_detected_at) DESC, w.code ASC
         LIMIT ? OFFSET ?`
      ).bind(user.userId, pattern, pattern, pattern, pattern, pageSize, (page - 1) * pageSize),
      c.env.DB.prepare(
        `SELECT COUNT(DISTINCT w.code) AS count ${base}`
      ).bind(user.userId, pattern, pattern, pattern, pattern),
    ]);

    const itemRows = (results[0]?.results ?? []) as unknown as SearchRow[];
    const totalRow = results[1]?.results?.[0] as unknown as { count: number } | undefined;

    return c.json(success({
      q,
      items: itemRows.map((r) => ({
        code: r.code,
        title: r.title,
        cover: r.cover ?? undefined,
        releaseDate: r.release_date ?? undefined,
        entityType: (r.entity_type || 'actress') as FollowEntityType,
        entityKey: r.entity_key,
        entityNames: (r.entity_names || '').split(',').filter(Boolean),
        isUnread: r.is_unread === 1,
      })),
      total: totalRow?.count ?? 0,
      page,
      pageSize,
    }));
  } catch (err) {
    console.error('Search follow feed error:', err);
    return c.json(error('SERVER_ERROR', '搜索关注动态失败'), 500);
  }
});
