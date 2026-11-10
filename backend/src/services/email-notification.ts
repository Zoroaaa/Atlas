/**
 * 邮件通知渠道：合并发送 + 退订
 *
 * 流程：emitNotification 把"要发邮件的通知"写进 email_queue → 每 30 分钟的定时任务（与关注检测共用触发器）按用户合并成一封：
 *  - 最早一条攒够 MIN_DELAY 才发（同一批新作合并；同一轮刚产生的通知留到下一轮，避免和关注检测抢先）
 *  - 每人每天最多 MAX_PER_USER_PER_DAY 封，超出的继续攒；全站有日额度
 *  - 发送失败按指数退避；连续失败过多就放弃这一批
 *  - 发送前再次核对：邮箱仍已验证、该类型邮件偏好仍开启
 * 邮件主题保持中性；用户可选择"隐藏详情"，正文只含条数，不含女优名和番号；不含封面图。
 */
import { CONFIG, EMAIL } from '@/constants';
import { generateId } from '@/utils';
import type { Env } from '@/types';

// ─── Resend 发送（复用统一发送器）────────────────────────────────────────

import { sendResendEmail, buildEmailSendLogStatement } from './email-sender';
export type { OutgoingEmail, SendResult } from './email-sender';

/**
 * 通知摘要/测试邮件的发送入口：保留原有 source 标签。
 * 实际 HTTP 与日志均走统一发送器。
 */
export async function sendEmail(
  env: Env,
  email: import('./email-sender').OutgoingEmail
): Promise<import('./email-sender').SendResult> {
  return sendResendEmail(env, {
    ...email,
    tags: email.tags ?? [{ name: 'source', value: 'notification-digest' }],
  });
}

// ─── 退订令牌（HMAC，不含过期时间：退订链接需要长期有效）──────────────────

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function createUnsubscribeToken(secret: string, userId: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(`unsub:${userId}`));
  return `${userId}.${toBase64Url(sig)}`;
}

/** 校验通过返回 userId，否则 null（常量时间比较） */
export async function verifyUnsubscribeToken(secret: string, token: string): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const expected = await createUnsubscribeToken(secret, userId);
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0 ? userId : null;
}

// ─── 邮件内容 ──────────────────────────────────────────────────────────

type Lang = 'zh-CN' | 'zh-TW' | 'en';

const TEXTS: Record<Lang, {
  subject: (n: number) => string;
  intro: (n: number) => string;
  hidden: string;
  open: string;
  manage: string;
  unsubscribe: string;
  footer: string;
  testSubject: string;
  testBody: string;
}> = {
  'zh-CN': {
    subject: (n) => `你有 ${n} 条新通知`,
    intro: (n) => `你有 ${n} 条新通知：`,
    hidden: '为保护隐私，邮件中不显示具体内容，请登录查看。',
    open: '打开 Atlas 查看',
    manage: '管理通知设置',
    unsubscribe: '一键退订邮件通知',
    footer: '你收到这封邮件，是因为你在 Atlas 开启了邮件通知。',
    testSubject: 'Atlas 邮件通知测试',
    testBody: '这是一封测试邮件。收到它说明邮件通知已经可以正常工作。',
  },
  'zh-TW': {
    subject: (n) => `你有 ${n} 則新通知`,
    intro: (n) => `你有 ${n} 則新通知：`,
    hidden: '為保護隱私，郵件中不顯示具體內容，請登入查看。',
    open: '開啟 Atlas 查看',
    manage: '管理通知設定',
    unsubscribe: '一鍵退訂郵件通知',
    footer: '你收到這封郵件，是因為你在 Atlas 開啟了郵件通知。',
    testSubject: 'Atlas 郵件通知測試',
    testBody: '這是一封測試郵件。收到它代表郵件通知已經可以正常運作。',
  },
  en: {
    subject: (n) => `${n} new notification${n === 1 ? '' : 's'}`,
    intro: (n) => `${n} new notification${n === 1 ? '' : 's'}:`,
    hidden: 'For your privacy, details are not shown in this email. Please sign in to view them.',
    open: 'Open Atlas',
    manage: 'Manage notification settings',
    unsubscribe: 'Unsubscribe from email notifications',
    footer: 'You received this email because you turned on email notifications in Atlas.',
    testSubject: 'Atlas email notification test',
    testBody: 'This is a test email. If you can read it, email notifications are working.',
  },
};

export function pickLang(settingsJson: string | null | undefined): Lang {
  try {
    const lang = (JSON.parse(settingsJson || '{}') as { language?: string }).language || '';
    if (lang.startsWith('zh-TW') || lang.startsWith('zh-HK') || lang.startsWith('zh-Hant')) return 'zh-TW';
    if (lang.startsWith('zh')) return 'zh-CN';
    if (lang) return 'en';
  } catch { /* 用默认 */ }
  return 'zh-CN';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface DigestItem {
  title: string;
  body: string;
  payload: { works?: Array<{ code: string; title?: string }> };
}

export interface DigestInput {
  items: DigestItem[];
  lang: Lang;
  hideDetails: boolean;
  frontendUrl: string;
  unsubscribeUrl: string;
}

export function buildDigestEmail(input: DigestInput): { subject: string; text: string; html: string } {
  const t = TEXTS[input.lang];
  const count = input.items.length;
  const manageUrl = `${input.frontendUrl}/dashboard/notifications`;
  const lines: Array<{ title: string; details: string[] }> = input.hideDetails
    ? []
    : input.items.map((item) => {
        const works = (item.payload.works ?? []).slice(0, 5).map((w) => `${w.code}${w.title ? ` ${w.title}` : ''}`);
        return {
          title: item.title,
          details: works.length > 0 ? works : (item.body ? [item.body] : []),
        };
      });

  const textParts = [t.intro(count)];
  if (input.hideDetails) {
    textParts.push('', t.hidden);
  } else {
    for (const line of lines) {
      textParts.push('', `• ${line.title}`, ...line.details.map((d) => `    ${d}`));
    }
  }
  textParts.push('', `${t.open}: ${input.frontendUrl}`, `${t.manage}: ${manageUrl}`, `${t.unsubscribe}: ${input.unsubscribeUrl}`, '', t.footer);

  const htmlList = input.hideDetails
    ? `<p style="color:#57534e">${escapeHtml(t.hidden)}</p>`
    : lines
        .map((line) => `<div style="margin:14px 0"><div style="font-weight:600;color:#1c1917">${escapeHtml(line.title)}</div>${
          line.details.map((d) => `<div style="color:#57534e;font-size:13px;margin-top:2px">${escapeHtml(d)}</div>`).join('')
        }</div>`)
        .join('');

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fafaf9;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
<p style="margin:0 0 8px;font-size:15px;color:#1c1917">${escapeHtml(t.intro(count))}</p>
${htmlList}
<p style="margin:20px 0 8px"><a href="${escapeHtml(input.frontendUrl)}" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">${escapeHtml(t.open)}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#78716c">${escapeHtml(t.footer)}<br>
<a href="${escapeHtml(manageUrl)}" style="color:#78716c">${escapeHtml(t.manage)}</a> · <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#78716c">${escapeHtml(t.unsubscribe)}</a></p>
</div></body></html>`;

  return { subject: t.subject(count), text: textParts.join('\n'), html };
}

export function buildTestEmail(lang: Lang, frontendUrl: string, unsubscribeUrl: string): { subject: string; text: string; html: string } {
  const t = TEXTS[lang];
  const manageUrl = `${frontendUrl}/dashboard/notifications`;
  return {
    subject: t.testSubject,
    text: `${t.testBody}\n\n${t.manage}: ${manageUrl}\n${t.unsubscribe}: ${unsubscribeUrl}`,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#fafaf9;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px"><p style="margin:0 0 12px;color:#1c1917">${escapeHtml(t.testBody)}</p><p style="margin:16px 0 0;font-size:12px;color:#78716c"><a href="${escapeHtml(manageUrl)}" style="color:#78716c">${escapeHtml(t.manage)}</a> · <a href="${escapeHtml(unsubscribeUrl)}" style="color:#78716c">${escapeHtml(t.unsubscribe)}</a></p></div></body></html>`,
  };
}

export function appUrls(env: Env): { frontend: string; backend: string } {
  return {
    frontend: (env.FRONTEND_URL || CONFIG.DEFAULT_URLS.FRONTEND).replace(/\/$/, ''),
    backend: (env.BACKEND_URL || CONFIG.DEFAULT_URLS.BACKEND).replace(/\/$/, ''),
  };
}

export function unsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

// ─── 定时任务：合并发送 ────────────────────────────────────────────────

interface QueueRow {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: string;
}

export interface DigestRunResult {
  users: number;
  sent: number;
  failed: number;
  skipped: number;
}

export async function runEmailDigest(env: Env): Promise<DigestRunResult> {
  const db = env.DB;
  const result: DigestRunResult = { users: 0, sent: 0, failed: 0, skipped: 0 };
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  if (!env.RESEND_API_KEY) return result; // 未配置发信服务：邮件留在队列里

  // 清理历史（便宜的收尾，不影响主流程）
  await db
    .prepare("DELETE FROM email_queue WHERE status != 'pending' AND created_at < ?")
    .bind(now - EMAIL.RETENTION_MS)
    .run();
  await db.prepare('DELETE FROM email_log WHERE sent_at < ?').bind(now - EMAIL.RETENTION_MS).run();

  const globalSent = await db
    .prepare("SELECT COUNT(*) AS count FROM email_log WHERE status = 'sent' AND sent_at > ?")
    .bind(dayAgo)
    .first<{ count: number }>();
  let budget = EMAIL.GLOBAL_DAILY_CAP - (globalSent?.count ?? 0);
  if (budget <= 0) return result;

  const due = await db
    .prepare(
      `SELECT user_id FROM email_queue WHERE status = 'pending'
       GROUP BY user_id HAVING MIN(created_at) <= ?
       ORDER BY MIN(created_at) ASC LIMIT ?`
    )
    .bind(now - EMAIL.MIN_DELAY_MS, EMAIL.DIGEST_BATCH_USERS)
    .all<{ user_id: string }>();

  const userIds = (due.results || []).map((r) => r.user_id);
  if (userIds.length === 0) return result;

  const placeholders = userIds.map(() => '?').join(',');
  const urls = appUrls(env);

  // 批量取本批用户的日志聚合 / 账号 / 队列 / 偏好 / 设置：6 条查询合并为 1 个 D1 往返，
  // 后续只在内存分组，避免每个用户再串行查 6 次（N+1）。
  const [
    aggResult,
    failCountResult,
    usersResult,
    queueResult,
    prefsResult,
    settingsResult,
  ] = (await db.batch([
    db.prepare(
      `SELECT user_id,
         SUM(CASE WHEN status = 'sent' AND sent_at > ? THEN 1 ELSE 0 END) AS sent_24h,
         MAX(CASE WHEN status = 'failed' THEN sent_at END) AS last_fail,
         MAX(CASE WHEN status = 'sent' THEN sent_at END) AS last_sent
       FROM email_log
       WHERE user_id IN (${placeholders})
       GROUP BY user_id`
    ).bind(dayAgo, ...userIds),
    // 连续失败次数：最后一次成功之后的 failed 条数
    db.prepare(
      `SELECT l.user_id, COUNT(*) AS count
       FROM email_log l
       LEFT JOIN (
         SELECT user_id, MAX(sent_at) AS last_sent
         FROM email_log WHERE status = 'sent' AND user_id IN (${placeholders})
         GROUP BY user_id
       ) s ON s.user_id = l.user_id
       WHERE l.status = 'failed' AND l.user_id IN (${placeholders})
         AND l.sent_at > COALESCE(s.last_sent, 0)
       GROUP BY l.user_id`
    ).bind(...userIds, ...userIds),
    db.prepare(
      `SELECT id, email, email_verified, settings FROM users WHERE id IN (${placeholders})`
    ).bind(...userIds),
    // 每人最多取 MAX_ITEMS_PER_EMAIL 条，用窗口函数在库内截断
    db.prepare(
      `SELECT id, user_id, type, title, body, payload FROM (
         SELECT id, user_id, type, title, body, payload,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
         FROM email_queue
         WHERE status = 'pending' AND user_id IN (${placeholders})
       ) WHERE rn <= ?
       ORDER BY user_id, rn`
    ).bind(...userIds, EMAIL.MAX_ITEMS_PER_EMAIL),
    db.prepare(
      `SELECT user_id, type, email FROM notification_preferences WHERE user_id IN (${placeholders})`
    ).bind(...userIds),
    db.prepare(
      `SELECT user_id, email_hide_details FROM notification_settings WHERE user_id IN (${placeholders})`
    ).bind(...userIds),
  ])) as unknown as [
    { results: Array<{ user_id: string; sent_24h: number | null; last_fail: number | null; last_sent: number | null }> },
    { results: Array<{ user_id: string; count: number }> },
    { results: Array<{ id: string; email: string | null; email_verified: number; settings: string | null }> },
    { results: Array<QueueRow & { user_id: string }> },
    { results: Array<{ user_id: string; type: string; email: number }> },
    { results: Array<{ user_id: string; email_hide_details: number }> },
  ];

  const aggMap = new Map((aggResult.results || []).map((r) => [r.user_id, r]));
  const failCountMap = new Map((failCountResult.results || []).map((r) => [r.user_id, r.count]));
  const userMap = new Map((usersResult.results || []).map((r) => [r.id, r]));
  const queueMap = new Map<string, QueueRow[]>();
  for (const row of queueResult.results || []) {
    const list = queueMap.get(row.user_id) || [];
    list.push(row);
    queueMap.set(row.user_id, list);
  }
  const prefMap = new Map<string, Array<{ type: string; email: number }>>();
  for (const row of prefsResult.results || []) {
    const list = prefMap.get(row.user_id) || [];
    list.push(row);
    prefMap.set(row.user_id, list);
  }
  const settingsMap = new Map((settingsResult.results || []).map((r) => [r.user_id, r.email_hide_details]));

  for (const userId of userIds) {
    if (budget <= 0) break;
    result.users++;

    const recent = aggMap.get(userId);
    if ((recent?.sent_24h ?? 0) >= EMAIL.MAX_PER_USER_PER_DAY) continue;

    const consecutiveFails = failCountMap.get(userId) ?? 0;
    if (consecutiveFails > 0 && recent?.last_fail) {
      const wait = EMAIL.FAIL_BACKOFF_BASE_MS * 2 ** Math.min(consecutiveFails - 1, EMAIL.FAIL_BACKOFF_MAX_EXP);
      if (now < recent.last_fail + wait) continue;
    }

    const user = userMap.get(userId);
    const rows = queueMap.get(userId) || [];
    if (rows.length === 0) continue;

    // 发送前再核对：邮箱已验证；该类型邮件偏好仍开启
    const prefs = prefMap.get(userId) || [];
    const emailOn = new Set(prefs.filter((p) => p.email === 1).map((p) => p.type));
    const allowed = user?.email && user.email_verified === 1 ? rows.filter((r) => emailOn.has(r.type)) : [];
    const skipped = rows.filter((r) => !allowed.includes(r));
    if (skipped.length > 0) {
      await db.batch(skipped.map((r) => db.prepare("UPDATE email_queue SET status = 'skipped' WHERE id = ?").bind(r.id)));
      result.skipped += skipped.length;
    }
    if (allowed.length === 0 || !user?.email) continue;

    const hideDetails = (settingsMap.get(userId) ?? 0) === 1;

    const unsubscribeUrl = `${urls.backend}/api/email/unsubscribe?token=${encodeURIComponent(await createUnsubscribeToken(env.JWT_SECRET, userId))}`;
    const content = buildDigestEmail({
      items: allowed.map((r) => ({
        title: r.title,
        body: r.body,
        payload: safeParse(r.payload) as DigestItem['payload'],
      })),
      lang: pickLang(user.settings),
      hideDetails,
      frontendUrl: urls.frontend,
      unsubscribeUrl,
    });

    const sent = await sendEmail(env, { to: user.email, ...content, headers: unsubscribeHeaders(unsubscribeUrl) });
    budget--;

    if (sent.ok) {
      await db.batch([
        ...allowed.map((r) => db.prepare("UPDATE email_queue SET status = 'sent', sent_at = ? WHERE id = ?").bind(now, r.id)),
        db.prepare("INSERT INTO email_log (id, user_id, sent_at, status, item_count, message_id) VALUES (?, ?, ?, 'sent', ?, ?)")
          .bind(generateId(), userId, now, allowed.length, sent.messageId ?? null),
        await buildEmailSendLogStatement(db, {
          userId,
          recipientEmail: user.email,
          emailType: 'notification_digest',
          status: 'sent',
          messageId: sent.messageId ?? null,
          templateName: 'notification_digest',
          subject: content.subject ?? null,
          createdAt: now,
        }),
      ]);
      result.sent++;
    } else {
      const giveUp = consecutiveFails + 1 >= EMAIL.MAX_CONSECUTIVE_FAILURES;
      await db.batch([
        db.prepare("INSERT INTO email_log (id, user_id, sent_at, status, item_count, error) VALUES (?, ?, ?, 'failed', ?, ?)")
          .bind(generateId(), userId, now, allowed.length, (sent.error || '').slice(0, 300)),
        await buildEmailSendLogStatement(db, {
          userId,
          recipientEmail: user.email,
          emailType: 'notification_digest',
          status: 'failed',
          subject: content.subject ?? null,
          error: (sent.error || '').slice(0, 300),
          createdAt: now,
        }),
        ...(giveUp
          ? allowed.map((r) => db.prepare("UPDATE email_queue SET status = 'failed' WHERE id = ?").bind(r.id))
          : []),
      ]);
      result.failed++;
    }
  }

  return result;
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
