/**
 * 网站公告路由
 * 功能：管理员发布/编辑/删除公告，用户获取有效公告列表
 */
import { Hono, Context, Next } from 'hono';
import { Env, JwtPayload } from '@/types';
import { success, error, verifyToken, generateId, logUserAction } from '@/utils';
import { checkIsAdmin } from '@/middleware/auth';

export const announcementRoutes = new Hono<{ Bindings: Env }>();

const VALID_TYPES = ['info', 'warning', 'success', 'error'];

// -----------------------------------------------------------------------
// 管理员鉴权中间件 - 实时从数据库查询权限
// -----------------------------------------------------------------------
const adminAuth = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json(error('AUTH_ERROR', '请先登录'), 401);
  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) return c.json(error('AUTH_ERROR', '认证失败'), 401);

  // 实时查询数据库确认管理员权限
  const isAdmin = await checkIsAdmin(c.env.DB, payload.userId);
  if (!isAdmin) return c.json(error('FORBIDDEN', '需要管理员权限'), 403);

  c.set('user', payload);
  await next();
};

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
announcementRoutes.get('/admin/list', adminAuth, async (c) => {
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
announcementRoutes.post('/admin', adminAuth, async (c) => {
  const adminUser = c.get('user') as JwtPayload;
  let body: { title?: string; content?: string; type?: string; isPinned?: boolean; startTime?: number; endTime?: number };
  try { body = await c.req.json(); } catch {
    return c.json(error('VALIDATION_ERROR', '请求体格式错误'), 400);
  }

  const { title, content, type, isPinned, startTime, endTime } = body;

  if (!title || title.trim().length < 2 || title.trim().length > 200) {
    return c.json(error('VALIDATION_ERROR', '标题长度应在 2~200 个字符之间'), 400);
  }
  if (!content || content.trim().length < 5 || content.trim().length > 5000) {
    return c.json(error('VALIDATION_ERROR', '内容长度应在 5~5000 个字符之间'), 400);
  }
  if (type && !VALID_TYPES.includes(type)) {
    return c.json(error('VALIDATION_ERROR', '无效的公告类型'), 400);
  }

  try {
    const now = Date.now();
    const id = generateId();

    await c.env.DB.prepare(`
      INSERT INTO site_announcements (
        id, title, content, type, is_pinned, is_active,
        start_time, end_time, admin_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).bind(
      id,
      title.trim(),
      content.trim(),
      type || 'info',
      isPinned ? 1 : 0,
      startTime || null,
      endTime || null,
      adminUser.userId,
      now, now
    ).run();

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
announcementRoutes.put('/admin/:id', adminAuth, async (c) => {
  const adminUser = c.get('user') as JwtPayload;
  const id = c.req.param('id');

  let body: { title?: string; content?: string; type?: string; isPinned?: boolean | number; isActive?: boolean | number; startTime?: number | null; endTime?: number | null };
  try { body = await c.req.json(); } catch {
    return c.json(error('VALIDATION_ERROR', '请求体格式错误'), 400);
  }

  const { title, content, type, isPinned, isActive, startTime, endTime } = body;

  // 校验存在性
  const existing = await c.env.DB.prepare('SELECT id FROM site_announcements WHERE id = ?').bind(id).first();
  if (!existing) return c.json(error('NOT_FOUND', '公告不存在'), 404);

  if (title !== undefined && (title.length < 2 || title.length > 200)) {
    return c.json(error('VALIDATION_ERROR', '标题长度应在 2~200 个字符之间'), 400);
  }
  if (content !== undefined && (content.length < 5 || content.length > 5000)) {
    return c.json(error('VALIDATION_ERROR', '内容长度应在 5~5000 个字符之间'), 400);
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return c.json(error('VALIDATION_ERROR', '无效的公告类型'), 400);
  }

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
announcementRoutes.delete('/admin/:id', adminAuth, async (c) => {
  const adminUser = c.get('user') as JwtPayload;
  const id = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare('SELECT id FROM site_announcements WHERE id = ?').bind(id).first();
    if (!existing) return c.json(error('NOT_FOUND', '公告不存在'), 404);

    await c.env.DB.prepare('DELETE FROM site_announcements WHERE id = ?').bind(id).run();
    await logUserAction(c.env, adminUser.userId, 'admin_delete_announcement', { id }, c);
    return c.json(success(null, '公告已删除'));
  } catch (err) {
    console.error('Delete announcement error:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});
