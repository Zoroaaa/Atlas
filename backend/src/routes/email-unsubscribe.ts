/**
 * 邮件退订（公开路由，凭签名令牌，不需要登录）
 *
 * GET  → 确认页（避免邮件安全软件自动点击链接就退订）
 * POST → 执行退订；同时兼容邮件客户端的 List-Unsubscribe-Post 一键退订
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { disableAllEmail } from '@/services/notification-service';
import { escapeHtml, verifyUnsubscribeToken } from '@/services/email-notification';

export const emailUnsubscribeRoutes = new Hono<{ Bindings: Env }>();

function page(title: string, message: string, form?: { action: string }): Response {
  const body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#fafaf9;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:440px;margin:48px auto;background:#fff;border-radius:12px;padding:28px;text-align:center">
<h1 style="font-size:18px;margin:0 0 12px;color:#1c1917">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;color:#57534e;font-size:14px;line-height:1.6">${escapeHtml(message)}</p>
${form ? `<form method="post" action="${escapeHtml(form.action)}"><button type="submit" style="background:#d97706;color:#fff;border:0;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer">确认退订 / Unsubscribe</button></form>` : ''}
</div></body></html>`;
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

emailUnsubscribeRoutes.get('/unsubscribe', async (c) => {
  const token = c.req.query('token') || '';
  const userId = token ? await verifyUnsubscribeToken(c.env.JWT_SECRET, token) : null;
  if (!userId) return page('链接无效', '这个退订链接无效或已损坏。你也可以登录后在「控制台 → 通知」里关闭邮件通知。');
  return page('退订邮件通知', '确认后，你将不再收到来自 Atlas 的邮件通知（站内通知不受影响）。', {
    action: `/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
  });
});

emailUnsubscribeRoutes.post('/unsubscribe', async (c) => {
  const token = c.req.query('token') || '';
  const userId = token ? await verifyUnsubscribeToken(c.env.JWT_SECRET, token) : null;
  if (!userId) return page('链接无效', '这个退订链接无效或已损坏。');

  try {
    await disableAllEmail(c.env.DB, userId);
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return page('退订失败', '服务暂时不可用，请稍后重试，或登录后在「控制台 → 通知」里关闭邮件通知。');
  }
  return page('已退订', '你将不再收到来自 Atlas 的邮件通知。想重新开启，可以登录后在「控制台 → 通知」里设置。');
});
