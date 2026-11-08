/**
 * 统一通知服务
 *
 * 所有功能只调用 emitNotification：写站内收件箱、入邮件队列，由用户的偏好决定。
 * 站内 (user_id, dedup_key) 唯一、邮件 (user_id, dedup_key) 唯一，重复调用是安全的（幂等）。
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

export interface EmailInfo {
  /** 脱敏后的邮箱，如 a***@example.com */
  address: string;
  verified: boolean;
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION.TYPES as readonly string[]).includes(value);
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const head = name.slice(0, 1);
  return `${head}***@${domain}`;
}

export interface EmitResult {
  inApp: boolean;
  email: boolean;
}

/**
 * 发出一条通知：
 * - 站内：偏好未关闭（默认开）就写入收件箱
 * - 邮件：偏好开启（默认关）且邮箱已验证，就写入邮件队列，由定时任务合并发送
 */
export async function emitNotification(db: D1Database, input: NotificationInput): Promise<EmitResult> {
  const pref = await db
    .prepare('SELECT in_app, email FROM notification_preferences WHERE user_id = ? AND type = ?')
    .bind(input.userId, input.type)
    .first<{ in_app: number; email: number }>();
  const wantsInApp = pref ? pref.in_app === 1 : true;
  const wantsEmail = pref ? pref.email === 1 : false;

  const result: EmitResult = { inApp: false, email: false };
  const now = Date.now();
  const payload = JSON.stringify(input.payload ?? {});

  if (wantsInApp) {
    const r = await db
      .prepare(
        `INSERT OR IGNORE INTO notifications (id, user_id, type, title, body, payload, dedup_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(generateId(), input.userId, input.type, input.title, input.body ?? '', payload, input.dedupKey, now)
      .run();
    result.inApp = (r.meta?.changes ?? 0) > 0;
  }

  if (wantsEmail) {
    const user = await db
      .prepare('SELECT email, email_verified FROM users WHERE id = ?')
      .bind(input.userId)
      .first<{ email: string | null; email_verified: number }>();
    if (user?.email && user.email_verified === 1) {
      const r = await db
        .prepare(
          `INSERT OR IGNORE INTO email_queue (id, user_id, type, title, body, payload, dedup_key, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
        )
        .bind(generateId(), input.userId, input.type, input.title, input.body ?? '', payload, input.dedupKey, now)
        .run();
      result.email = (r.meta?.changes ?? 0) > 0;
    }
  }

  return result;
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

export async function getEmailInfo(db: D1Database, userId: string): Promise<EmailInfo> {
  const user = await db
    .prepare('SELECT email, email_verified FROM users WHERE id = ?')
    .bind(userId)
    .first<{ email: string | null; email_verified: number }>();
  return {
    address: user?.email ? maskEmail(user.email) : '',
    verified: user?.email_verified === 1,
  };
}

export async function getSettings(db: D1Database, userId: string): Promise<{ emailHideDetails: boolean }> {
  const row = await db
    .prepare('SELECT email_hide_details FROM notification_settings WHERE user_id = ?')
    .bind(userId)
    .first<{ email_hide_details: number }>();
  return { emailHideDetails: row?.email_hide_details === 1 };
}

export async function setSettings(
  db: D1Database,
  userId: string,
  patch: { emailHideDetails?: boolean }
): Promise<void> {
  const current = await getSettings(db, userId);
  const hide = patch.emailHideDetails ?? current.emailHideDetails;
  await db
    .prepare(
      `INSERT INTO notification_settings (user_id, email_hide_details, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET email_hide_details = excluded.email_hide_details, updated_at = excluded.updated_at`
    )
    .bind(userId, hide ? 1 : 0, Date.now())
    .run();
}

/** 关闭该用户所有类型的邮件通知，并放弃队列里还没发的邮件（退订） */
export async function disableAllEmail(db: D1Database, userId: string): Promise<void> {
  const now = Date.now();
  await db.batch([
    ...NOTIFICATION.TYPES.map((type) =>
      db
        .prepare(
          `INSERT INTO notification_preferences (user_id, type, in_app, email, updated_at)
           VALUES (?, ?, 1, 0, ?)
           ON CONFLICT(user_id, type) DO UPDATE SET email = 0, updated_at = excluded.updated_at`
        )
        .bind(userId, type, now)
    ),
    db
      .prepare("UPDATE email_queue SET status = 'skipped' WHERE user_id = ? AND status = 'pending'")
      .bind(userId),
  ]);
}
