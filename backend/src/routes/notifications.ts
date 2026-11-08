/**
 * 通知路由：站内收件箱 + 偏好
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { authMiddleware } from '@/middleware/auth';
import { NOTIFICATION } from '@/constants';
import {
  getEmailInfo,
  getPreferences,
  getSettings,
  getUnreadCount,
  isNotificationType,
  setPreference,
  setSettings,
} from '@/services/notification-service';
import {
  appUrls,
  buildTestEmail,
  createUnsubscribeToken,
  pickLang,
  sendEmail,
  unsubscribeHeaders,
} from '@/services/email-notification';
import { checkRateLimitD1 } from '@/utils/rate-limit';
import { EMAIL } from '@/constants';

export const notificationRoutes = new Hono<{ Bindings: Env }>();

notificationRoutes.use('*', authMiddleware);

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: string;
  created_at: number;
  read_at: number | null;
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// 收件箱（服务端分页，可只看未读）
notificationRoutes.get('/', async (c) => {
  const user = c.get('user');

  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const pageSize = Math.min(
      NOTIFICATION.MAX_PAGE_SIZE,
      Math.max(1, parseInt(c.req.query('pageSize') || '20', 10) || 20)
    );
    const unreadOnly = c.req.query('unreadOnly') === '1';
    const where = unreadOnly ? 'user_id = ? AND read_at IS NULL' : 'user_id = ?';

    const [rows, totalRow, unread] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, type, title, body, payload, created_at, read_at FROM notifications
         WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      ).bind(user.userId, pageSize, (page - 1) * pageSize).all<NotificationRow>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM notifications WHERE ${where}`)
        .bind(user.userId).first<{ count: number }>(),
      getUnreadCount(c.env.DB, user.userId),
    ]);

    return c.json(success({
      items: (rows.results || []).map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        payload: parsePayload(r.payload),
        createdAt: r.created_at,
        isRead: r.read_at !== null,
      })),
      total: totalRow?.count ?? 0,
      unread,
      page,
      pageSize,
    }));
  } catch (err) {
    console.error('Get notifications error:', err);
    return c.json(error('SERVER_ERROR', '获取通知失败'), 500);
  }
});

notificationRoutes.get('/unread-count', async (c) => {
  const user = c.get('user');
  try {
    return c.json(success({ unread: await getUnreadCount(c.env.DB, user.userId) }));
  } catch (err) {
    console.error('Get unread count error:', err);
    return c.json(error('SERVER_ERROR', '获取未读数失败'), 500);
  }
});

// 标记已读：传 ids 只标记这些，不传则全部已读
notificationRoutes.post('/read', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json<{ ids?: unknown }>().catch(() => ({} as { ids?: unknown }));
    const now = Date.now();

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids = body.ids.filter((id): id is string => typeof id === 'string').slice(0, 100);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        await c.env.DB.prepare(
          `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${placeholders})`
        ).bind(now, user.userId, ...ids).run();
      }
    } else {
      await c.env.DB.prepare(
        'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL'
      ).bind(now, user.userId).run();
    }

    return c.json(success({ unread: await getUnreadCount(c.env.DB, user.userId) }));
  } catch (err) {
    console.error('Mark notifications read error:', err);
    return c.json(error('SERVER_ERROR', '标记已读失败'), 500);
  }
});

// 清除已读通知
notificationRoutes.delete('/read', async (c) => {
  const user = c.get('user');
  try {
    await c.env.DB.prepare('DELETE FROM notifications WHERE user_id = ? AND read_at IS NOT NULL').bind(user.userId).run();
    return c.json(success({ unread: await getUnreadCount(c.env.DB, user.userId) }));
  } catch (err) {
    console.error('Clear read notifications error:', err);
    return c.json(error('SERVER_ERROR', '清除失败'), 500);
  }
});

notificationRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  try {
    await c.env.DB.prepare('DELETE FROM notifications WHERE user_id = ? AND id = ?')
      .bind(user.userId, c.req.param('id')).run();
    return c.json(success({ unread: await getUnreadCount(c.env.DB, user.userId) }));
  } catch (err) {
    console.error('Delete notification error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});

async function preferencesPayload(db: D1Database, userId: string) {
  const [preferences, email, settings] = await Promise.all([
    getPreferences(db, userId),
    getEmailInfo(db, userId),
    getSettings(db, userId),
  ]);
  return { preferences, email, settings };
}

notificationRoutes.get('/preferences', async (c) => {
  const user = c.get('user');
  try {
    return c.json(success(await preferencesPayload(c.env.DB, user.userId)));
  } catch (err) {
    console.error('Get notification preferences error:', err);
    return c.json(error('SERVER_ERROR', '获取通知偏好失败'), 500);
  }
});

notificationRoutes.put('/preferences', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json<{ type?: unknown; inApp?: unknown; email?: unknown }>().catch(() => ({} as Record<string, unknown>));
    if (!isNotificationType(body.type)) {
      return c.json(error('VALIDATION_ERROR', '通知类型无效'), 400);
    }
    // 邮箱未验证时不允许开启邮件通知：否则用户以为开了，实际永远收不到
    if (body.email === true && !(await getEmailInfo(c.env.DB, user.userId)).verified) {
      return c.json(error('EMAIL_NOT_VERIFIED', '请先验证邮箱后再开启邮件通知'), 400);
    }
    await setPreference(c.env.DB, user.userId, body.type, {
      inApp: typeof body.inApp === 'boolean' ? body.inApp : undefined,
      email: typeof body.email === 'boolean' ? body.email : undefined,
    });
    return c.json(success(await preferencesPayload(c.env.DB, user.userId)));
  } catch (err) {
    console.error('Set notification preference error:', err);
    return c.json(error('SERVER_ERROR', '保存通知偏好失败'), 500);
  }
});

notificationRoutes.put('/settings', async (c) => {
  const user = c.get('user');
  try {
    const body = await c.req.json<{ emailHideDetails?: unknown }>().catch(() => ({} as Record<string, unknown>));
    if (typeof body.emailHideDetails !== 'boolean') {
      return c.json(error('VALIDATION_ERROR', '参数无效'), 400);
    }
    await setSettings(c.env.DB, user.userId, { emailHideDetails: body.emailHideDetails });
    return c.json(success(await preferencesPayload(c.env.DB, user.userId)));
  } catch (err) {
    console.error('Set notification settings error:', err);
    return c.json(error('SERVER_ERROR', '保存失败'), 500);
  }
});

// 发送测试邮件（立即发送，不经过队列；每人每分钟 1 次）
notificationRoutes.post('/email/test', async (c) => {
  const user = c.get('user');

  try {
    const row = await c.env.DB
      .prepare('SELECT email, email_verified, settings FROM users WHERE id = ?')
      .bind(user.userId)
      .first<{ email: string | null; email_verified: number; settings: string | null }>();
    if (!row?.email || row.email_verified !== 1) {
      return c.json(error('EMAIL_NOT_VERIFIED', '请先验证邮箱'), 400);
    }

    const limit = await checkRateLimitD1(c.env.DB, `notify-test:${user.userId}`, EMAIL.TEST_RATE_LIMIT_MS, 1);
    if (!limit.allowed) {
      return c.json(error('RATE_LIMITED', '操作太频繁，请稍后再试'), 429);
    }

    const urls = appUrls(c.env);
    const unsubscribeUrl = `${urls.backend}/api/email/unsubscribe?token=${encodeURIComponent(await createUnsubscribeToken(c.env.JWT_SECRET, user.userId))}`;
    const content = buildTestEmail(pickLang(row.settings), urls.frontend, unsubscribeUrl);
    const result = await sendEmail(c.env, { to: row.email, ...content, headers: unsubscribeHeaders(unsubscribeUrl) });

    if (!result.ok) {
      console.error('Send test email failed:', result.error);
      return c.json(error('SEND_FAILED', '邮件发送失败，请稍后重试'), 502);
    }
    return c.json(success({ sent: true }));
  } catch (err) {
    console.error('Test email error:', err);
    return c.json(error('SERVER_ERROR', '发送失败'), 500);
  }
});
