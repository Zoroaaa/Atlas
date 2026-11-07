/**
 * 统一通知服务
 *
 * 所有功能只调用 emitNotification：是否写入站内、以后是否发邮件，由偏好决定。
 * (user_id, dedup_key) 唯一，重复调用是安全的（幂等）。
 */
import { generateId } from '@/utils';
import { NOTIFICATION } from '@/constants';

export type NotificationType = typeof NOTIFICATION.TYPES[number];

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  dedupKey: string;
}

export interface NotificationPreference {
  type: NotificationType;
  inApp: boolean;
  email: boolean;
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION.TYPES as readonly string[]).includes(value);
}

/** 写入站内通知；用户关闭了该类型的站内通知则跳过。返回是否真正写入 */
export async function emitNotification(db: D1Database, input: NotificationInput): Promise<boolean> {
  const pref = await db
    .prepare('SELECT in_app FROM notification_preferences WHERE user_id = ? AND type = ?')
    .bind(input.userId, input.type)
    .first<{ in_app: number }>();
  if (pref && pref.in_app === 0) return false;

  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO notifications (id, user_id, type, title, body, payload, dedup_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      generateId(),
      input.userId,
      input.type,
      input.title,
      input.body ?? '',
      JSON.stringify(input.payload ?? {}),
      input.dedupKey,
      Date.now()
    )
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function getUnreadCount(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** 每种类型的偏好（未设置的用默认：站内开、邮件关） */
export async function getPreferences(db: D1Database, userId: string): Promise<NotificationPreference[]> {
  const rows = await db
    .prepare('SELECT type, in_app, email FROM notification_preferences WHERE user_id = ?')
    .bind(userId)
    .all<{ type: string; in_app: number; email: number }>();
  const byType = new Map((rows.results || []).map((r) => [r.type, r]));

  return NOTIFICATION.TYPES.map((type) => {
    const row = byType.get(type);
    return { type, inApp: row ? row.in_app === 1 : true, email: row ? row.email === 1 : false };
  });
}

export async function setPreference(
  db: D1Database,
  userId: string,
  type: NotificationType,
  patch: { inApp?: boolean; email?: boolean }
): Promise<void> {
  const current = (await getPreferences(db, userId)).find((p) => p.type === type)!;
  const inApp = patch.inApp ?? current.inApp;
  const email = patch.email ?? current.email;
  await db
    .prepare(
      `INSERT INTO notification_preferences (user_id, type, in_app, email, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, type) DO UPDATE SET in_app = excluded.in_app, email = excluded.email, updated_at = excluded.updated_at`
    )
    .bind(userId, type, inApp ? 1 : 0, email ? 1 : 0, Date.now())
    .run();
}
