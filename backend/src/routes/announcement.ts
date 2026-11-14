/**
 * 网站公告路由
 * 功能：管理员发布/编辑/删除公告，用户获取有效公告列表
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env, JwtPayload } from '@/types';
import { success, error, generateId, logUserAction } from '@/utils';
import { authMiddleware, adminMiddleware } from '@/middleware/auth';
import { validateBody, schemas } from '@/validation';
import { enqueueAnnouncementEmail } from '@/services/notification-service';

export const announcementRoutes = new Hono<{ Bindings: Env }>();

// -----------------------------------------------------------------------
// GET /api/announcements  — 公开接口：获取当前有效公告（无需登录）
// -----------------------------------------------------------------------
announcementRoutes.get('/', async (c) => {
  const now = Date.now();

  try {
    const items = await c.env.DB.prepare(`
      SELECT id, title, content, type, is_pinned, created_at
      FROM site_announcements
      WHERE is_active = 1
        AND (start_time IS NULL OR start_time <= ?)
        AND (end_time IS NULL OR end_time >= ?)
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT 10
    `).bind(now, now).all();

    return c.json(success(items.results || []));
  } catch (err) {
    console.error('Get announcements error:', err);
    return c.json(error('SERVER_ERROR', '获取公告失败'), 500);
  }
});

// -----------------------------------------------------------------------
// GET /api/announcements/admin/list  — 管理员：获取所有公告（含已失效）
// -----------------------------------------------------------------------
announcementRoutes.get('/admin/list', authMiddleware, adminMiddleware, async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 50);

  try {
    const countResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM site_announcements'
    ).first<{ total: number }>();

    const items = await c.env.DB.prepare(`
      SELECT a.*, u.username as admin_username
      FROM site_announcements a
      LEFT JOIN users u ON a.admin_user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(pageSize, (page - 1) * pageSize).all();

    return c.json(success({
      items: items.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Admin list announcements error:', err);
    return c.json(error('SERVER_ERROR', '获取公告列表失败'), 500);
  }
});

// -----------------------------------------------------------------------
// POST /api/announcements/admin  — 管理员：发布公告
// -----------------------------------------------------------------------
announcementRoutes.post('/admin', authMiddleware, adminMiddleware, validateBody(schemas.announcement.create), async (c) => {
  const adminUser = c.get('user') as JwtPayload;

  const body = c.get('validatedBody') as z.infer<typeof schemas.announcement.create>;
  const { title, content, type, isPinned, isActive, startTime, endTime } = body;

  try {
    const now = Date.now();
    const id = generateId();

    await c.env.DB.prepare(`
      INSERT INTO site_announcements (
        id, title, content, type, is_pinned, is_active,
        start_time, end_time, admin_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      title.trim(),
      content.trim(),
      type || 'info',
      isPinned ? 1 : 0,
      isActive === false ? 0 : 1,
      startTime || null,
      endTime || null,
      adminUser.userId,
      now, now
    ).run();

    // 公告邮件默认关闭：只给已自行开启“站点公告 · 邮件”的用户入队
    await enqueueAnnouncementEmail(c.env.DB, {
      announcementId: id,
      title: title.trim(),
      body: content.trim(),
      level: type || 'info',
      createdAt: now,
    }).catch((err) => console.error('Enqueue announcement email error:', err));

    await logUserAction(c.env, adminUser.userId, 'admin_create_announcement', { id, title: title.trim() }, c);

    return c.json(success({ id }, '公告发布成功'));
  } catch (err) {
    console.error('Create announcement error:', err);
    return c.json(error('SERVER_ERROR', '发布失败'), 500);
  }
});

// -----------------------------------------------------------------------
// PUT /api/announcements/admin/:id  — 管理员：编辑公告
// -----------------------------------------------------------------------
announcementRoutes.put('/admin/:id', authMiddleware, adminMiddleware, validateBody(schemas.announcement.update), async (c) => {
  const adminUser = c.get('user') as JwtPayload;
  const id = c.req.param('id');

  const body = c.get('validatedBody') as z.infer<typeof schemas.announcement.update>;
  const { title, content, type, isPinned, isActive, startTime, endTime } = body;

  // 校验存在性
  const existing = await c.env.DB.prepare('SELECT id FROM site_announcements WHERE id = ?').bind(id).first();
  if (!existing) return c.json(error('NOT_FOUND', '公告不存在'), 404);

  try {
    const now = Date.now();
    await c.env.DB.prepare(`
      UPDATE site_announcements SET
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        type = COALESCE(?, type),
        is_pinned = COALESCE(?, is_pinned),
        is_active = COALESCE(?, is_active),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        updated_at = ?
      WHERE id = ?
    `).bind(
      title?.trim() || null,
      content?.trim() || null,
      type || null,
      isPinned !== undefined ? (isPinned ? 1 : 0) : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      startTime !== undefined ? startTime : null,
      endTime !== undefined ? endTime : null,
      now, id
    ).run();

    await logUserAction(c.env, adminUser.userId, 'admin_update_announcement', { id }, c);
    return c.json(success(null, '公告更新成功'));
  } catch (err) {
    console.error('Update announcement error:', err);
    return c.json(error('SERVER_ERROR', '更新失败'), 500);
  }
});

// -----------------------------------------------------------------------
// DELETE /api/announcements/admin/:id  — 管理员：删除公告
// -----------------------------------------------------------------------
announcementRoutes.delete('/admin/:id', authMiddleware, adminMiddleware, async (c) => {
  const adminUser = c.get('user') as JwtPayload;
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare('SELECT id FROM site_announcements WHERE id = ?').bind(id).first();
    if (!existing) return c.json(error('NOT_FOUND', '公告不存在'), 404);

    // 先清理该公告尚未发送的邮件，避免删除后仍继续投递
    await c.env.DB.prepare(
      "DELETE FROM email_queue WHERE status = 'pending' AND dedup_key = ?"
    ).bind(`announcement:${id}`).run();
    await c.env.DB.prepare('DELETE FROM site_announcements WHERE id = ?').bind(id).run();
    await logUserAction(c.env, adminUser.userId, 'admin_delete_announcement', { id }, c);
    return c.json(success(null, '公告已删除'));
  } catch (err) {
    console.error('Delete announcement error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});
