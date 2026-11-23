/**
 * 用户反馈路由：提交、本人查询/删除、管理员处理、邮件回复与站内通知。
 *
 * 约束：仅提交接口允许匿名（必须留联系邮箱）；管理接口实时查库校验角色。
 */
import { Hono, Context, Next } from 'hono';
import { Env, JwtPayload } from '@/types';
import { success, error, verifyToken, generateId, logUserAction, escapeLikePattern } from '@/utils';
import { feedbackSchema } from '@/utils/validators';
import { checkIsAdmin } from '@/middleware/auth';
import { z } from 'zod';
import { validateBody, schemas } from '@/validation';
import { sendEmail, logEmailSend } from '@/services/email-sender';
import { emitNotification } from '@/services/notification-service';

export const feedbackRoutes = new Hono<{ Bindings: Env }>();

// ── 可选鉴权：有 token 就解析，没有也放行 ────────────────
const optionalAuth = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    if (payload) c.set('user', payload);
  }
  await next();
};

feedbackRoutes.use('*', optionalAuth);

// ── 反馈类型与状态的中文映射（用于邮件展示） ─────────────
const TYPE_LABELS: Record<string, string> = {
  bug: '🐛 问题反馈',
  suggestion: '💡 优化建议',
  other: '📝 其他',
};
const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

// ── POST /api/feedback — 提交反馈 ────────────────────────
feedbackRoutes.post('/', validateBody(schemas.feedback.create), async (c) => {
  const user = c.get('user') as JwtPayload | undefined;
  const body = c.get('validatedBody') as z.infer<typeof schemas.feedback.create>;

  const { type, title, content, contactEmail, pageUrl } = body;

  // 未登录用户必须填写联系邮箱（依赖登录态的联动校验，保留在业务层）
  if (!user && (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
    return c.json(error('VALIDATION_ERROR', '请填写有效的联系邮箱'), 400);
  }

  try {
    const now = Date.now();
    const feedbackId = generateId();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    const ua = c.req.header('User-Agent') || null;

    // 未显式填写联系邮箱时回退到账号邮箱，否则管理员无法回复
    let resolvedEmail = contactEmail || null;
    if (user?.userId && !resolvedEmail) {
      const u = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?')
        .bind(user.userId).first<{ email: string }>();
      resolvedEmail = u?.email || null;
    }

    await c.env.DB.prepare(`
      INSERT INTO user_feedback (
        id, user_id, contact_email, type, title, content,
        page_url, user_agent, ip_address, status, priority,
        email_sent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'normal', 0, ?, ?)
    `).bind(
      feedbackId,
      user?.userId || null,
      resolvedEmail,
      type,
      title.trim(),
      content.trim(),
      pageUrl || null,
      ua,
      ip,
      now, now
    ).run();

    if (user?.userId) {
      await logUserAction(c.env, user.userId, 'submit_feedback', {
        feedbackId, type, title: title.trim(),
      }, c);
    }

    return c.json(success({ id: feedbackId }, '感谢您的反馈，我们会尽快处理！'));
  } catch (err) {
    console.error('Submit feedback error:', err);
    return c.json(error('SERVER_ERROR', '提交失败，请稍后重试'), 500);
  }
});

// ── GET /api/feedback/my — 当前用户的反馈列表 ────────────
feedbackRoutes.get('/my', async (c) => {
  const user = c.get('user') as JwtPayload | undefined;
  if (!user) return c.json(error('AUTH_ERROR', '请先登录'), 401);

  // page 必须 ≥1：负数会生成负 OFFSET，SQLite 直接报错
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(c.req.query('pageSize') || '10', 10) || 10), 50);
  const status = c.req.query('status');
  const statusFilter = status && ['pending', 'processing', 'resolved', 'closed'].includes(status) ? status : null;

  try {
    const where = statusFilter ? 'WHERE user_id = ? AND status = ?' : 'WHERE user_id = ?';
    const params: string[] = statusFilter ? [user.userId, statusFilter] : [user.userId];

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM user_feedback ${where}`
    ).bind(...params).first<{ total: number }>();

    const items = await c.env.DB.prepare(`
      SELECT id, type, title, content, status, priority, admin_reply, email_sent, created_at, updated_at
      FROM user_feedback
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, (page - 1) * pageSize).all();

    return c.json(success({
      items: items.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get my feedback error:', err);
    return c.json(error('SERVER_ERROR', '获取失败'), 500);
  }
});

// ── DELETE /api/feedback/my/:id — 删除本人反馈 ──────────
// 已受理（processing/resolved）的反馈保留处理记录；只允许删未处理或已关闭的反馈
feedbackRoutes.delete('/my/:id', async (c) => {
  const user = c.get('user') as JwtPayload | undefined;
  if (!user) return c.json(error('AUTH_ERROR', '请先登录'), 401);

  const feedbackId = c.req.param('id');

  try {
    const item = await c.env.DB.prepare(
      'SELECT id, status FROM user_feedback WHERE id = ? AND user_id = ?'
    ).bind(feedbackId, user.userId).first<{ id: string; status: string }>();

    if (!item) return c.json(error('NOT_FOUND', '反馈不存在'), 404);
    if (!['pending', 'closed'].includes(item.status)) {
      return c.json(error('VALIDATION_ERROR', '处理中或已解决的反馈不能删除'), 400);
    }

    await c.env.DB.prepare(
      'DELETE FROM user_feedback WHERE id = ? AND user_id = ?'
    ).bind(feedbackId, user.userId).run();

    await logUserAction(c.env, user.userId, 'delete_feedback', { feedbackId }, c);

    return c.json(success(null, '反馈已删除'));
  } catch (err) {
    console.error('Delete my feedback error:', err);
    return c.json(error('SERVER_ERROR', '删除失败，请稍后重试'), 500);
  }
});

// ── 管理员专用路由：权限在每次请求时实时校验 ─────────────
type AdminAuthResult =
  | { ok: true; user: JwtPayload }
  | { ok: false; status: 401 | 403; message: string };

/**
 * 区分「未登录」与「已登录但无权限」：前端据此决定跳登录还是提示权限不足。
 * token 里的角色可能已被降级，因此必须实时查库确认。
 */
const getAdminUser = async (c: Context<{ Bindings: Env }>): Promise<AdminAuthResult> => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: '请先登录' };
  }
  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) {
    return { ok: false, status: 401, message: '登录状态已失效，请重新登录' };
  }

  const isAdmin = await checkIsAdmin(c);
  if (!isAdmin) {
    return { ok: false, status: 403, message: '需要管理员权限' };
  }

  return { ok: true, user: payload };
};

// GET /api/feedback/admin/list  — 管理员获取反馈列表
feedbackRoutes.get('/admin/list', async (c) => {
  const auth = await getAdminUser(c);
  if (!auth.ok) return c.json(error('AUTH_ERROR', auth.message), auth.status);

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
  const status = c.req.query('status');
  const type = c.req.query('type');
  const priority = c.req.query('priority');
  const search = c.req.query('search');

  try {
    let where = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (status) { where += ' AND f.status = ?'; params.push(status); }
    if (type) { where += ' AND f.type = ?'; params.push(type); }
    if (priority) { where += ' AND f.priority = ?'; params.push(priority); }
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`;
      where += " AND (f.title LIKE ? ESCAPE '\\' OR f.content LIKE ? ESCAPE '\\')";
      params.push(pattern, pattern);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM user_feedback f ${where}`
    ).bind(...params).first<{ total: number }>();

    const items = await c.env.DB.prepare(`
      SELECT f.*, u.username, u.email as user_email
      FROM user_feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ${where}
      ORDER BY
        CASE f.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        f.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, (page - 1) * pageSize).all();

    return c.json(success({
      items: items.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Admin list feedback error:', err);
    return c.json(error('SERVER_ERROR', '获取反馈列表失败'), 500);
  }
});

// GET /api/feedback/admin/stats  — 管理员获取反馈统计
feedbackRoutes.get('/admin/stats', async (c) => {
  const auth = await getAdminUser(c);
  if (!auth.ok) return c.json(error('AUTH_ERROR', auth.message), auth.status);

  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN type = 'bug' THEN 1 ELSE 0 END) as bugs,
        SUM(CASE WHEN type = 'suggestion' THEN 1 ELSE 0 END) as suggestions,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_priority
      FROM user_feedback
    `).first();

    return c.json(success(stats));
  } catch (err) {
    console.error('Admin feedback stats error:', err);
    return c.json(error('SERVER_ERROR', '获取统计失败'), 500);
  }
});

// GET /api/feedback/admin/:id  — 管理员获取反馈详情
feedbackRoutes.get('/admin/:id', async (c) => {
  const auth = await getAdminUser(c);
  if (!auth.ok) return c.json(error('AUTH_ERROR', auth.message), auth.status);

  const feedbackId = c.req.param('id');

  try {
    const item = await c.env.DB.prepare(`
      SELECT f.*, u.username, u.email as user_email,
             a.username as admin_username
      FROM user_feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN users a ON f.admin_user_id = a.id
      WHERE f.id = ?
    `).bind(feedbackId).first();

    if (!item) return c.json(error('NOT_FOUND', '反馈不存在'), 404);
    return c.json(success(item));
  } catch (err) {
    console.error('Admin get feedback error:', err);
    return c.json(error('SERVER_ERROR', '获取详情失败'), 500);
  }
});

// PUT /api/feedback/admin/:id  — 管理员处理反馈（支持回复并发送邮件）
feedbackRoutes.put('/admin/:id', validateBody(schemas.feedback.update), async (c) => {
  const auth = await getAdminUser(c);
  if (!auth.ok) return c.json(error('AUTH_ERROR', auth.message), auth.status);
  const adminUser = auth.user;

  const feedbackId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.feedback.update>;

  const { status, priority, adminReply, adminNotes, sendEmail } = body;

  try {
    const item = await c.env.DB.prepare(`
      SELECT f.*, u.username, u.email as user_email
      FROM user_feedback f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE f.id = ?
    `).bind(feedbackId).first();

    if (!item) return c.json(error('NOT_FOUND', '反馈不存在'), 404);
    const validationResult = feedbackSchema.safeParse(item);
    if (!validationResult.success) {
      console.error('Feedback validation error:', validationResult.error, item);
      return c.json(error('VALIDATION_ERROR', '反馈数据格式错误'), 500);
    }

    const now = Date.now();
    const previousStatus = (item as Record<string, unknown>).status as string;
    const newStatus = (status || previousStatus) as string;
    const isResolved = newStatus === 'resolved' || newStatus === 'closed';

    await c.env.DB.prepare(`
      UPDATE user_feedback
      SET
        status = ?,
        priority = COALESCE(?, priority),
        admin_user_id = ?,
        admin_reply = COALESCE(?, admin_reply),
        admin_notes = COALESCE(?, admin_notes),
        resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN ? ELSE resolved_at END,
        updated_at = ?
      WHERE id = ?
    `).bind(
      newStatus,
      priority || null,
      adminUser.userId,
      adminReply || null,
      adminNotes || null,
      newStatus, isResolved ? now : null,
      now,
      feedbackId
    ).run();

    // 只有勾选发信且填写了回复才发送，避免把空回复发给用户
    let emailResult: { sent: boolean; error?: string } = { sent: false };
    if (sendEmail && adminReply && (item as Record<string, unknown>).contact_email) {
      try {
        const parsedFeedbackResult = feedbackSchema.safeParse(item);
        const parsedFeedback = parsedFeedbackResult.success ? parsedFeedbackResult.data : item;
        emailResult = await sendFeedbackReplyEmail(c.env, parsedFeedback as Parameters<typeof sendFeedbackReplyEmail>[1], adminReply as string, newStatus);
        if (emailResult.sent) {
          await c.env.DB.prepare(
            'UPDATE user_feedback SET email_sent = 1 WHERE id = ?'
          ).bind(feedbackId).run();
        }
      } catch (emailErr) {
        console.error('Send feedback reply email error:', emailErr);
        emailResult = { sent: false, error: (emailErr as Error).message };
      }
    }

    // 站内通知：状态变化或有新回复时提醒提交者；邮件仍由上面的可选回复邮件负责，
    // 这里强制关闭邮件渠道，避免同一处理动作发两封邮件
    const submitterUserId = (item as Record<string, unknown>).user_id as string | null;
    if (submitterUserId && (newStatus !== previousStatus || adminReply)) {
      try {
        const statusLabel = STATUS_LABELS[newStatus] || newStatus;
        await emitNotification(c.env.DB, {
          userId: submitterUserId,
          type: 'feedback.reply',
          title: adminReply ? '你的反馈已收到回复' : `反馈状态已更新：${statusLabel}`,
          body: adminReply || '',
          payload: {
            feedbackId,
            status: newStatus,
            hasReply: !!adminReply,
            feedbackTitle: (item as Record<string, unknown>).title,
          },
          dedupKey: `feedback:${feedbackId}:${newStatus}:${adminReply ? 'reply' : 'status'}`,
          channels: { email: false },
        });
      } catch (notifyErr) {
        // 通知失败不影响反馈处理结果，只记录日志
        console.error('Emit feedback notification error:', notifyErr);
      }
    }

    await logUserAction(c.env, adminUser.userId, 'admin_handle_feedback', {
      feedbackId,
      status: newStatus,
      priority: priority || item.priority,
      hasReply: !!adminReply,
      emailSent: emailResult.sent,
    }, c);

    return c.json(success({
      emailSent: emailResult.sent,
      emailError: emailResult.error,
    }, '反馈已处理'));
  } catch (err) {
    console.error('Admin handle feedback error:', err);
    return c.json(error('SERVER_ERROR', '处理失败'), 500);
  }
});

// ── 辅助：发送反馈回复邮件 ───────────────────────────────
async function sendFeedbackReplyEmail(
  env: Env,
  feedback: z.infer<typeof feedbackSchema>,
  adminReply: string,
  newStatus: string
): Promise<{ sent: boolean; error?: string }> {
  const escapeHtml = (v: string) =>    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const recipientEmail = feedback.contact_email;
  if (!recipientEmail) return { sent: false, error: '无收件人邮箱' };

  const siteName = env.DEFAULT_FROM_NAME || 'Atlas';
  const siteUrl = env.SITE_URL || 'https://example.com';
  const typeLabel = TYPE_LABELS[feedback.type] || feedback.type;
  const statusLabel = STATUS_LABELS[newStatus] || newStatus;
  const submitterName = feedback.username || feedback.contact_email?.split('@')[0] || '用户';
  const safeTitle = escapeHtml(feedback.title);
  const safeReply = escapeHtml(adminReply);
  const safeSubmitter = escapeHtml(submitterName);

  const subject = `[${siteName}] 您的反馈已被处理 — ${feedback.title}`;
  const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${safeTitle}</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:32px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${siteName}</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">感谢您的反馈，我们已进行处理</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 20px;color:#374151;font-size:16px;">您好，${safeSubmitter}！</p>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.8;">
            您在 <strong>${new Date(feedback.created_at).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</strong> 提交的反馈已由我们的工作人员处理完毕。
          </p>

          <!-- Feedback Summary -->
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span style="font-size:13px;color:#6b7280;">反馈类型：</span>
              <span style="font-size:13px;font-weight:600;color:#374151;">${typeLabel}</span>
            </div>
            <div style="margin-bottom:8px;">
              <span style="font-size:13px;color:#6b7280;">反馈标题：</span>
              <span style="font-size:13px;font-weight:600;color:#374151;">${safeTitle}</span>
            </div>
            <div>
              <span style="font-size:13px;color:#6b7280;">当前状态：</span>
              <span style="display:inline-block;padding:2px 10px;background:${newStatus === 'resolved' ? '#d1fae5' : '#dbeafe'};color:${newStatus === 'resolved' ? '#065f46' : '#1e40af'};border-radius:12px;font-size:12px;font-weight:600;">${statusLabel}</span>
            </div>
          </div>

          <!-- Admin Reply -->
          <div style="border-left:4px solid #3b82f6;padding:16px 20px;background:#eff6ff;border-radius:0 8px 8px 0;margin-bottom:28px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1d4ed8;">团队回复</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.8;white-space:pre-wrap;">${safeReply}</p>
          </div>

          <p style="margin:0 0 28px;color:#6b7280;font-size:13px;line-height:1.7;">
            如果您有任何疑问或需要进一步帮助，欢迎再次提交反馈，我们会继续为您服务。
          </p>

          <div style="text-align:center;">
            <a href="${siteUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">访问 ${siteName}</a>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e5e7eb;">
          <p style="margin:0;text-align:center;font-size:12px;color:#9ca3af;">
            此邮件由 ${siteName} 自动发送，请勿直接回复。&nbsp;&nbsp;
            <a href="${siteUrl}" style="color:#6b7280;text-decoration:none;">${siteUrl}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const result = await sendEmail(env, {
    to: recipientEmail,
    subject,
    html: htmlContent,
    fromName: siteName,
    tags: [{ name: 'type', value: 'feedback_reply' }],
  });

  await logEmailSend(env.DB, {
    userId: feedback.user_id,
    recipientEmail,
    emailType: 'feedback_reply',
    status: result.ok ? 'sent' : 'failed',
    provider: result.provider,
    messageId: result.messageId ?? null,
    templateName: 'feedback_reply',
    subject,
    error: result.ok ? null : (result.error || '邮件发送失败'),
    ipAddress: feedback.ip_address,
  });

  if (!result.ok) {
    return { sent: false, error: result.error || '邮件发送失败' };
  }

  return { sent: true };
}
