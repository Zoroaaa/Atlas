/**
 * 统一邮件发送器
 *
 * 验证码、通知摘要、反馈回复三类邮件共用：
 * - 同一套发送通道选择（Cloudflare / Resend / Mailtrap / Brevo）
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
  /** 覆盖默认发件人显示名（一般不用） */
  fromName?: string;
}

export type EmailProvider = 'cloudflare' | 'resend' | 'mailtrap' | 'brevo';

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  provider?: EmailProvider;
}

/** 不计入验证码发送限流的邮件类型（通知/运营/管理员测试） */
const NON_RATE_LIMITED_EMAIL_TYPES = ['notification_digest', 'feedback_reply', 'admin_test'] as const;

export function isRateLimitedEmailType(emailType: string): boolean {
  return !NON_RATE_LIMITED_EMAIL_TYPES.includes(emailType as typeof NON_RATE_LIMITED_EMAIL_TYPES[number]);
}

// ─── 发送通道 ──────────────────────────────────────────────────────────

/**
 * 各服务商的发件地址。
 * 每家使用独立子域名，隔离发件域名信誉；地址必须与服务商后台已验证的域名一致，
 * 属于通道集成细节，因此不开放给业务层覆盖。
 * Cloudflare 保持原有发件地址（DEFAULT_FROM_EMAIL）。
 */
const PROVIDER_FROM_EMAIL: Record<Exclude<EmailProvider, 'cloudflare'>, string> = {
  resend: 'noreply@resend.wort.uk',
  mailtrap: 'noreply@mailtrap.wort.uk',
  brevo: 'noreply@brevo.wort.uk',
};

export function getProviderFromEmail(env: Env, provider: EmailProvider): string {
  return provider === 'cloudflare'
    ? env.DEFAULT_FROM_EMAIL || 'noreply@mail.wort.uk'
    : PROVIDER_FROM_EMAIL[provider];
}

function resolveFrom(
  env: Env,
  provider: EmailProvider,
  email: OutgoingEmail
): { fromName: string; fromEmail: string } {
  return {
    fromName: email.fromName || env.DEFAULT_FROM_NAME || 'Atlas',
    fromEmail: getProviderFromEmail(env, provider),
  };
}

export async function sendResendEmail(env: Env, email: OutgoingEmail): Promise<SendResult> {
  if (!env.RESEND_API_KEY) return { ok: false, error: '未配置 RESEND_API_KEY', provider: 'resend' };

  const { fromName, fromEmail } = resolveFrom(env, 'resend', email);

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
    if (!response.ok) return { ok: false, error: result.message || `HTTP ${response.status}`, provider: 'resend' };
    return { ok: true, messageId: result.id, provider: 'resend' };
  } catch (err) {
    return { ok: false, error: (err as Error).message, provider: 'resend' };
  }
}

export async function sendCloudflareEmail(env: Env, email: OutgoingEmail): Promise<SendResult> {
  if (!env.EMAIL) {
    return { ok: false, error: '未配置 Cloudflare EMAIL 绑定', provider: 'cloudflare' };
  }

  const { fromName, fromEmail } = resolveFrom(env, 'cloudflare', email);

  try {
    const result = await env.EMAIL.send({
      to: email.to,
      from: { email: fromEmail, name: fromName },
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    });
    return { ok: true, messageId: result.messageId, provider: 'cloudflare' };
  } catch (err) {
    const sendError = err as { code?: string; message?: string };
    const detail = sendError.code
      ? `${sendError.code}: ${sendError.message || ''}`.trim()
      : sendError.message || String(err);
    return { ok: false, error: detail, provider: 'cloudflare' };
  }
}

export async function sendMailtrapEmail(env: Env, email: OutgoingEmail): Promise<SendResult> {
  if (!env.MAILTRAP_API_TOKEN) {
    return { ok: false, error: '未配置 MAILTRAP_API_TOKEN', provider: 'mailtrap' };
  }

  const { fromName, fromEmail } = resolveFrom(env, 'mailtrap', email);
  const endpoint = env.MAILTRAP_API_URL || 'https://send.api.mailtrap.io/api/send';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MAILTRAP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { email: fromEmail, name: fromName },
        to: [{ email: email.to }],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      message_ids?: string[];
      errors?: string[] | Record<string, string>;
      error?: string;
    };
    if (!response.ok || result.success === false) {
      const detail = Array.isArray(result.errors)
        ? result.errors.join('; ')
        : result.errors
          ? JSON.stringify(result.errors)
          : result.error || `HTTP ${response.status}`;
      return { ok: false, error: detail, provider: 'mailtrap' };
    }
    return { ok: true, messageId: result.message_ids?.[0], provider: 'mailtrap' };
  } catch (err) {
    return { ok: false, error: (err as Error).message, provider: 'mailtrap' };
  }
}

export async function sendBrevoEmail(env: Env, email: OutgoingEmail): Promise<SendResult> {
  if (!env.BREVO_API_KEY) {
    return { ok: false, error: '未配置 BREVO_API_KEY', provider: 'brevo' };
  }

  const { fromName, fromEmail } = resolveFrom(env, 'brevo', email);

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
        headers: email.headers,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      messageId?: string;
      message?: string;
      code?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: result.message || result.code || `HTTP ${response.status}`,
        provider: 'brevo',
      };
    }
    return { ok: true, messageId: result.messageId, provider: 'brevo' };
  } catch (err) {
    return { ok: false, error: (err as Error).message, provider: 'brevo' };
  }
}

export interface EmailProviderSetting {
  provider: EmailProvider;
  /** 数值越小越优先；-1 表示停用 */
  priority: number;
  /** 每日发送上限；0 表示不限额 */
  dailyLimit: number;
  configured: boolean;
}

const PROVIDER_TIE_ORDER: EmailProvider[] = ['cloudflare', 'resend', 'mailtrap', 'brevo'];

/** 读取管理端配置，返回按优先级排序的邮件服务商列表 */
export async function getEmailProviderChain(env: Env): Promise<EmailProviderSetting[]> {
  const config = await new ConfigService(env).getAll();
  const readInt = (key: string, fallback: number): number => {
    const parsed = parseInt(config[key] ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const chain: EmailProviderSetting[] = [
    {
      provider: 'cloudflare',
      priority: readInt(DB_CONFIG_KEYS.EMAIL_PRIORITY_CLOUDFLARE, 0),
      dailyLimit: readInt(DB_CONFIG_KEYS.EMAIL_DAILY_LIMIT_CLOUDFLARE, 100),
      configured: Boolean(env.EMAIL),
    },
    {
      provider: 'resend',
      priority: readInt(DB_CONFIG_KEYS.EMAIL_PRIORITY_RESEND, -1),
      dailyLimit: readInt(DB_CONFIG_KEYS.EMAIL_DAILY_LIMIT_RESEND, 100),
      configured: Boolean(env.RESEND_API_KEY),
    },
    {
      provider: 'mailtrap',
      priority: readInt(DB_CONFIG_KEYS.EMAIL_PRIORITY_MAILTRAP, -1),
      dailyLimit: readInt(DB_CONFIG_KEYS.EMAIL_DAILY_LIMIT_MAILTRAP, 100),
      configured: Boolean(env.MAILTRAP_API_TOKEN),
    },
    {
      provider: 'brevo',
      priority: readInt(DB_CONFIG_KEYS.EMAIL_PRIORITY_BREVO, -1),
      dailyLimit: readInt(DB_CONFIG_KEYS.EMAIL_DAILY_LIMIT_BREVO, 100),
      configured: Boolean(env.BREVO_API_KEY),
    },
  ];

  return chain.sort(
    (a, b) => a.priority - b.priority || PROVIDER_TIE_ORDER.indexOf(a.provider) - PROVIDER_TIE_ORDER.indexOf(b.provider)
  );
}

export interface EmailProviderStatus extends EmailProviderSetting {
  /** 该服务商实际使用的发件地址 */
  fromEmail: string;
  /** 优先级 >= 0 且已配置凭据时才参与正式发送 */
  enabled: boolean;
}

/** 管理端邮件测试面板使用：固定顺序返回全部服务商状态 */
export async function getEmailProviderStatuses(env: Env): Promise<EmailProviderStatus[]> {
  const chain = await getEmailProviderChain(env);
  return PROVIDER_TIE_ORDER.map((provider) => {
    const setting = chain.find((item) => item.provider === provider)!;
    return {
      ...setting,
      fromEmail: getProviderFromEmail(env, provider),
      enabled: setting.priority >= 0 && setting.configured,
    };
  });
}

/** 指定服务商发送（跳过优先级与每日限额，供管理端测试邮件使用） */
export async function sendEmailWithProvider(
  env: Env,
  provider: EmailProvider,
  email: OutgoingEmail
): Promise<SendResult> {
  return dispatchToProvider(env, provider, email);
}

/** 当日 0 点（Asia/Shanghai）的时间戳 */
function startOfDayCst(now = Date.now()): number {
  const offset = 8 * 60 * 60 * 1000;
  return Math.floor((now + offset) / CONFIG.Stats.DAY_IN_MS) * CONFIG.Stats.DAY_IN_MS - offset;
}

/** 统计某服务商今天已成功发送的邮件数 */
async function countProviderSentToday(env: Env, provider: EmailProvider): Promise<number> {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM email_send_logs
       WHERE provider = ? AND send_status = 'sent' AND created_at >= ?`
    )
      .bind(provider, startOfDayCst())
      .first<{ count: number }>();
    return row?.count ?? 0;
  } catch (err) {
    // 限额统计失败不阻断发信
    console.warn('[email] provider daily usage read failed:', err);
    return 0;
  }
}

function dispatchToProvider(env: Env, provider: EmailProvider, email: OutgoingEmail): Promise<SendResult> {
  switch (provider) {
    case 'cloudflare':
      return sendCloudflareEmail(env, email);
    case 'mailtrap':
      return sendMailtrapEmail(env, email);
    case 'brevo':
      return sendBrevoEmail(env, email);
    default:
      return sendResendEmail(env, email);
  }
}

/**
 * 统一发送入口：按管理端配置的优先级依次尝试。
 * 未配置、已停用（优先级 -1）或达到每日上限的服务商会被跳过，
 * 发送失败也会继续尝试下一优先级。
 */
export async function sendEmail(env: Env, email: OutgoingEmail): Promise<SendResult> {
  const chain = await getEmailProviderChain(env);
  const attempts: string[] = [];

  for (const setting of chain) {
    if (setting.priority < 0) continue;
    if (!setting.configured) {
      attempts.push(`${setting.provider}: 未配置`);
      continue;
    }
    if (setting.dailyLimit > 0) {
      const used = await countProviderSentToday(env, setting.provider);
      if (used >= setting.dailyLimit) {
        attempts.push(`${setting.provider}: 今日已达限额 ${setting.dailyLimit}`);
        continue;
      }
    }

    const result = await dispatchToProvider(env, setting.provider, email);
    if (result.ok) {
      if (attempts.length > 0) {
        console.warn(`[email] 已切换到 ${setting.provider}（${attempts.join(' | ')}）`);
      }
      return result;
    }
    attempts.push(`${setting.provider}: ${result.error}`);
  }

  return {
    ok: false,
    error: attempts.length > 0
      ? `没有可用的邮件服务商（${attempts.join('；')}）`
      : '没有可用的邮件服务商（均未配置或已停用）',
  };
}

// ─── 统一发送日志 ────────────────────────────────────────────────────────

export interface EmailSendLogOptions {
  userId?: string | null;
  recipientEmail: string;
  emailType: string;
  status: 'sent' | 'failed';
  /** 实际使用的发送服务商；缺省按 resend 记录 */
  provider?: EmailProvider;
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
    options.provider || 'resend',
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
