/**
 * 统一 Resend 邮件发送器
 *
 * 验证码、通知摘要、反馈回复三类邮件共用：
 * - 同一条 HTTP 发送通道
 * - 同一套 email_send_logs 记录字段
 * - 同一套“哪些邮件计入验证码发送限流”的口径
 *
 * 各业务模块只负责模板渲染与触发时机，邮件文案不变。
 */
import { generateId, hashToken } from '@/utils';
import { CONFIG, DB_CONFIG_KEYS } from '@/constants';
import { ConfigService } from './config';
import type { Env } from '@/types';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  /** 覆盖默认发件人（一般不用） */
  fromName?: string;
  fromEmail?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** 不计入验证码发送限流的邮件类型（通知/运营类） */
const NON_RATE_LIMITED_EMAIL_TYPES = ['notification_digest', 'feedback_reply'] as const;

export function isRateLimitedEmailType(emailType: string): boolean {
  return !NON_RATE_LIMITED_EMAIL_TYPES.includes(emailType as typeof NON_RATE_LIMITED_EMAIL_TYPES[number]);
}

// ─── HTTP 发送 ──────────────────────────────────────────────────────────

export async function sendResendEmail(env: Env, email: OutgoingEmail): Promise<SendResult> {
  if (!env.RESEND_API_KEY) return { ok: false, error: '未配置 RESEND_API_KEY' };

  const fromName = email.fromName || env.DEFAULT_FROM_NAME || 'Atlas';
  const fromEmail = email.fromEmail || env.DEFAULT_FROM_EMAIL || 'noreply@mail.wort.uk';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
        tags: email.tags,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) return { ok: false, error: result.message || `HTTP ${response.status}` };
    return { ok: true, messageId: result.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ─── 统一发送日志 ────────────────────────────────────────────────────────

export interface EmailSendLogOptions {
  userId?: string | null;
  recipientEmail: string;
  emailType: string;
  status: 'sent' | 'failed';
  messageId?: string | null;
  templateName?: string | null;
  subject?: string | null;
  error?: string | null;
  ipAddress?: string | null;
  rateLimitKey?: string;
  createdAt?: number;
}

/**
 * 构造 email_send_logs 插入语句。
 * 需要和队列更新等写入保持原子性时，调用方可直接放进 db.batch。
 */
export async function buildEmailSendLogStatement(
  db: D1Database,
  options: EmailSendLogOptions
): Promise<D1PreparedStatement> {
  const now = options.createdAt ?? Date.now();
  const rateLimitKey = options.rateLimitKey ?? await hashToken(options.recipientEmail);

  return db.prepare(
    `INSERT INTO email_send_logs (
       id, user_id, recipient_email, email_type, send_status, provider,
       provider_message_id, template_name, subject, send_error,
       ip_address, rate_limit_key, created_at, sent_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    generateId(),
    options.userId || null,
    options.recipientEmail,
    options.emailType,
    options.status,
    'resend',
    options.messageId || null,
    options.templateName || null,
    options.subject || null,
    options.error || null,
    options.ipAddress || null,
    rateLimitKey,
    now,
    options.status === 'sent' ? now : null
  );
}

export async function logEmailSend(db: D1Database, options: EmailSendLogOptions): Promise<void> {
  await (await buildEmailSendLogStatement(db, options)).run();
}

// ─── 统一限流口径 ────────────────────────────────────────────────────────

export async function countRateLimitedEmailsSince(
  db: D1Database,
  params: { email: string; ipAddress: string; since: number }
): Promise<number> {
  const excluded = NON_RATE_LIMITED_EMAIL_TYPES.map((t) => `'${t}'`).join(', ');
  const row = await db.prepare(
    `SELECT COUNT(*) as count FROM email_send_logs
     WHERE (recipient_email = ? OR ip_address = ?)
       AND email_type NOT IN (${excluded})
       AND created_at > ? AND send_status = 'sent'`
  )
    .bind(params.email, params.ipAddress, params.since)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** 验证码类邮件的发送限流，超限抛错（错误文案与原有实现一致） */
export async function assertVerificationEmailRateLimit(
  env: Env,
  email: string,
  ipAddress: string
): Promise<void> {
  const now = Date.now();
  const configService = new ConfigService(env);

  const hourlyLimit = await configService.getInt(DB_CONFIG_KEYS.EMAIL_RATE_LIMIT_PER_HOUR, 5);
  const hourlyCount = await countRateLimitedEmailsSince(env.DB, {
    email,
    ipAddress,
    since: now - CONFIG.Stats.HOUR_IN_MS,
  });
  if (hourlyCount >= hourlyLimit) {
    throw new Error(`发送频率过快，请1小时后再试（每小时限制${hourlyLimit}次）`);
  }

  const dailyLimit = await configService.getInt(DB_CONFIG_KEYS.EMAIL_RATE_LIMIT_PER_DAY, 20);
  const dailyCount = await countRateLimitedEmailsSince(env.DB, {
    email,
    ipAddress,
    since: now - CONFIG.Stats.DAY_IN_MS,
  });
  if (dailyCount >= dailyLimit) {
    throw new Error(`今日发送次数已达上限，请明天再试（每日限制${dailyLimit}次）`);
  }
}
