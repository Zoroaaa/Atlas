/**
 * 关注女优路由：关注管理 + 关注动态
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { authMiddleware } from '@/middleware/auth';
import { FOLLOW } from '@/constants';
import { resolveStar, syncWatch } from '@/services/follow-service';

export const followRoutes = new Hono<{ Bindings: Env }>();

followRoutes.use('*', authMiddleware);

const KEY_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

interface FollowRow {
  key: string;
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
      `SELECT f.watch_key AS key, a.name, a.avatar, f.created_at, f.notify_in_app,
              a.last_checked_at, a.fail_count,
              (SELECT COUNT(*) FROM actress_works w
                WHERE w.watch_key = f.watch_key AND w.first_detected_at > f.last_viewed_at) AS unread
       FROM user_follows f
       JOIN actress_watch a ON a.key = f.watch_key
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`
    ).bind(user.userId).all<FollowRow>();

    const follows = (rows.results || []).map((r) => ({
      key: r.key,
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

// 关注：传 key（来自女优资料）或 name（如热门女优，只有名字，后端解析 key）
followRoutes.post('/', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json<{ key?: unknown; name?: unknown; avatar?: unknown }>().catch(() => ({} as Record<string, unknown>));
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    let key = typeof body.key === 'string' ? body.key.trim() : '';
    let avatar = typeof body.avatar === 'string' && body.avatar.length <= 500 ? body.avatar : undefined;

    if (!name && !key) return c.json(error('VALIDATION_ERROR', '缺少女优名称'), 400);
    if (key && !KEY_PATTERN.test(key)) return c.json(error('VALIDATION_ERROR', '女优标识无效'), 400);

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
      return c.json(error('FOLLOW_LIMIT', `最多关注 ${FOLLOW.MAX_PER_USER} 位`), 400);
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

followRoutes.patch('/:key', async (c) => {
  const user = c.get('user');
  const key = c.req.param('key');

  try {
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

followRoutes.delete('/:key', async (c) => {
  const user = c.get('user');
  const key = c.req.param('key');

  try {
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
  actress_name: string;
  last_viewed_at: number;
}

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

    // 可选：只看某一位女优（控制台"关注动态"的筛选）
    const actressParam = c.req.query('actress') || '';
    const actressFilter = KEY_PATTERN.test(actressParam);

    const base = `FROM actress_works w
       JOIN user_follows f ON f.watch_key = w.watch_key AND f.user_id = ?
       JOIN actress_watch a ON a.key = w.watch_key
       WHERE ${cond}${actressFilter ? ' AND w.watch_key = ?' : ''}`;
    const baseArgs: unknown[] = actressFilter ? [user.userId, today, actressParam] : [user.userId, today];

    const [rows, totalRow] = await Promise.all([
      c.env.DB.prepare(
        `SELECT w.code, w.title, w.cover, w.release_date, w.first_detected_at, w.watch_key,
                a.name AS actress_name, f.last_viewed_at
         ${base} ORDER BY ${order} LIMIT ? OFFSET ?`
      ).bind(...baseArgs, pageSize, (page - 1) * pageSize).all<FeedRow>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS count ${base}`).bind(...baseArgs).first<{ count: number }>(),
    ]);

    return c.json(success({
      items: (rows.results || []).map((r) => ({
        code: r.code,
        title: r.title,
        cover: r.cover ?? undefined,
        releaseDate: r.release_date ?? undefined,
        actressKey: r.watch_key,
        actressName: r.actress_name,
        isUnread: r.first_detected_at > r.last_viewed_at,
      })),
      total: totalRow?.count ?? 0,
      page,
      pageSize,
    }));
  } catch (err) {
    console.error('Get follow feed error:', err);
    return c.json(error('SERVER_ERROR', '获取关注动态失败'), 500);
  }
});
