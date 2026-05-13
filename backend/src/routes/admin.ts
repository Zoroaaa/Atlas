/**
 * 管理员功能路由
 * 功能：用户管理、系统配置、举报处理、数据统计、角色管理
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { Env, User, CommunitySourceReport, UserAction, JwtPayload, Role } from '@/types';
import { success, error, logUserAction } from '@/utils';
import { ConfigService } from '@/services';
import { CONFIG, VALIDATION_RULES, DB_CONFIG_KEYS } from '@/constants';
import { authMiddleware, adminMiddleware } from '@/middleware/auth';
import { adminSessionSchema, adminEventSchema, adminActionSchema } from '@/utils/validators';

const R = VALIDATION_RULES;

export const adminRoutes = new Hono<{ Bindings: Env }>();

function getPaginationConfig() {
  return {
    defaultPageSize: R.PAGINATION.DEFAULT_PAGE_SIZE,
    maxPageSize: R.PAGINATION.MAX_PAGE_SIZE,
    maxLogPageSize: R.PAGINATION.MAX_LOG_PAGE_SIZE,
  };
}

adminRoutes.use('*', authMiddleware);
adminRoutes.use('*', adminMiddleware);

/**
 * 获取角色列表
 * GET /api/admin/roles
 */
adminRoutes.get('/roles', async (c) => {
  try {
    const roles = await c.env.DB.prepare(
      'SELECT * FROM roles ORDER BY priority DESC'
    ).all<Role>();

    return c.json(success({
      roles: (roles.results || []).map(r => ({
        id: r.id,
        name: r.name,
        displayName: r.display_name,
        description: r.description,
        permissions: (() => { try { return JSON.parse(r.permissions || '[]'); } catch { return []; } })(),
        isSystem: r.is_system === 1,
        priority: r.priority,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    }));
  } catch (err) {
    console.error('Get roles error:', err);
    return c.json(error('SERVER_ERROR', '获取角色列表失败'), 500);
  }
});

/**
 * 获取用户统计概览
 * GET /api/admin/users/stats
 */
adminRoutes.get('/users/stats', async (c) => {
  try {
    const now = Date.now();
    const oneDayAgo = now - CONFIG.Stats.DAY_IN_MS;
    const oneWeekAgo = now - CONFIG.Stats.WEEK_IN_MS;
    const oneMonthAgo = now - CONFIG.Stats.MONTH_IN_MS;

    const userStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_week,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_month
      FROM users
    `).bind(oneDayAgo, oneWeekAgo, oneMonthAgo).first();

    const activeUsersToday = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM user_sessions
      WHERE last_activity > ?
    `).bind(oneDayAgo).first<{ count: number }>();

    const roleDistribution = await c.env.DB.prepare(`
      SELECT r.display_name, COUNT(u.id) as count
      FROM roles r
      LEFT JOIN users u ON r.id = u.role_id
      GROUP BY r.id
      ORDER BY count DESC
    `).all<{ display_name: string; count: number }>();

    return c.json(success({
      total: userStats?.total || 0,
      active: userStats?.active || 0,
      inactive: userStats?.inactive || 0,
      verified: userStats?.verified || 0,
      newToday: userStats?.new_today || 0,
      newWeek: userStats?.new_week || 0,
      newMonth: userStats?.new_month || 0,
      activeToday: activeUsersToday?.count || 0,
      roleDistribution: roleDistribution.results || [],
    }));
  } catch (err) {
    console.error('Get users stats error:', err);
    return c.json(error('SERVER_ERROR', '获取用户统计失败'), 500);
  }
});

/**
 * 获取用户列表
 * GET /api/admin/users
 */
adminRoutes.get('/users', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const { defaultPageSize, maxPageSize } = getPaginationConfig();
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || String(defaultPageSize)), maxPageSize);
  const search = c.req.query('search');
  const status = c.req.query('status');
  const roleId = c.req.query('roleId');

  try {
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (search) {
      whereClause += ' AND (u.username LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status === 'active') {
      whereClause += ' AND u.is_active = 1';
    } else if (status === 'inactive') {
      whereClause += ' AND u.is_active = 0';
    }

    if (roleId) {
      whereClause += ' AND u.role_id = ?';
      params.push(roleId);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM users u ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const users = await c.env.DB.prepare(
      `SELECT u.id, u.username, u.email, u.is_active, u.email_verified, u.login_count, 
              u.created_at, u.last_login, u.permissions, u.role_id,
              r.name as role_name, r.display_name as role_display_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...params, pageSize, (page - 1) * pageSize).all<User & { role_name?: string; role_display_name?: string }>();

    return c.json(success({
      users: (users.results || []).map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        isActive: u.is_active === 1,
        emailVerified: u.email_verified === 1,
        loginCount: u.login_count,
        createdAt: u.created_at,
        lastLogin: u.last_login,
        permissions: (() => { try { return JSON.parse(u.permissions || '[]'); } catch { return []; } })(),
        role: u.role_name || 'user',
        roleDisplayName: u.role_display_name || '普通用户',
      })),
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get users error:', err);
    return c.json(error('SERVER_ERROR', '获取用户列表失败'), 500);
  }
});

/**
 * 获取用户详情
 * GET /api/admin/users/:id
 */
adminRoutes.get('/users/:id', async (c) => {
  const userId = c.req.param('id');

  try {
    const user = await c.env.DB.prepare(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name, r.permissions as role_permissions
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`
    ).bind(userId).first<User & { role_name?: string; role_display_name?: string; role_permissions?: string }>();

    if (!user) {
      return c.json(error('NOT_FOUND', '用户不存在'), 404);
    }

    const sessions = await c.env.DB.prepare(
      'SELECT id, ip_address, user_agent, created_at, last_activity, expires_at FROM user_sessions WHERE user_id = ? ORDER BY last_activity DESC LIMIT 10'
    ).bind(userId).all();

    const favoritesCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_favorites WHERE user_id = ?'
    ).bind(userId).first<{ count: number }>();

    const historyCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_search_history WHERE user_id = ?'
    ).bind(userId).first<{ count: number }>();

    const recentActions = await c.env.DB.prepare(
      `SELECT action, created_at FROM user_actions 
       WHERE user_id = ? AND action IN ('login', 'login_failed', 'search', 'favorite')
       ORDER BY created_at DESC LIMIT 20`
    ).bind(userId).all();

    const loginCount = recentActions.results?.filter((a) => {
      const result = adminActionSchema.safeParse(a);
      const action = result.success ? result.data : a as { action: string };
      return action.action === 'login';
    }).length || 0;
    const searchCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_search_history WHERE user_id = ?'
    ).bind(userId).first<{ count: number }>();

    return c.json(success({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isActive: user.is_active === 1,
        emailVerified: user.email_verified === 1,
        loginCount: user.login_count,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        permissions: (() => { try { return JSON.parse(user.permissions || '[]'); } catch { return []; } })(),
        settings: (() => { try { return JSON.parse(user.settings || '{}'); } catch { return {}; } })(),
        role: user.role_name || 'user',
        roleDisplayName: user.role_display_name || '普通用户',
        rolePermissions: (() => { try { return JSON.parse(user.role_permissions || '[]'); } catch { return []; } })(),
      },
      stats: {
        favoritesCount: favoritesCount?.count || 0,
        historyCount: historyCount?.count || 0,
        activeSessions: (sessions.results || []).length,
        totalLoginCount: loginCount,
        totalSearchCount: searchCount?.count || 0,
      },
      recentSessions: sessions.results || [],
      recentActions: recentActions.results || [],
    }));
  } catch (err) {
    console.error('Get user detail error:', err);
    return c.json(error('SERVER_ERROR', '获取用户详情失败'), 500);
  }
});

/**
 * 更新用户角色
 * PUT /api/admin/users/:id/role
 */
adminRoutes.put('/users/:id/role', async (c) => {
  const userId = c.req.param('id');
  const body = await c.req.json();
  const { roleId } = body;
  const adminUser = c.get('user') as JwtPayload;

  if (!roleId) {
    return c.json(error('VALIDATION_ERROR', '请指定角色'), 400);
  }

  try {
    const role = await c.env.DB.prepare(
      'SELECT * FROM roles WHERE id = ?'
    ).bind(roleId).first<Role>();

    if (!role) {
      return c.json(error('NOT_FOUND', '角色不存在'), 404);
    }

    if (role.is_system !== 1 && adminUser.role !== 'super_admin') {
      return c.json(error('FORBIDDEN', '只有超级管理员可以分配自定义角色'), 403);
    }

    const user = await c.env.DB.prepare(
      'SELECT id, username, role_id FROM users WHERE id = ?'
    ).bind(userId).first<User>();

    if (!user) {
      return c.json(error('NOT_FOUND', '用户不存在'), 404);
    }

    if (user.role_id === 'super_admin' && adminUser.role !== 'super_admin') {
      return c.json(error('FORBIDDEN', '无法修改超级管理员角色'), 403);
    }

    await c.env.DB.prepare(
      'UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?'
    ).bind(roleId, Date.now(), userId).run();

    await logUserAction(c.env, adminUser.userId, 'admin_update_user_role', {
      targetUserId: userId,
      targetUsername: user.username,
      oldRole: user.role_id,
      newRole: roleId,
    }, c);

    return c.json(success({ roleId, roleName: role.display_name }, '角色已更新'));
  } catch (err) {
    console.error('Update user role error:', err);
    return c.json(error('SERVER_ERROR', '更新角色失败'), 500);
  }
});

/**
 * 获取用户登录日志
 * GET /api/admin/users/:id/login-logs
 */
adminRoutes.get('/users/:id/login-logs', async (c) => {
  const userId = c.req.param('id');
  const page = parseInt(c.req.query('page') || '1');
  const { defaultPageSize, maxPageSize } = getPaginationConfig();
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || String(defaultPageSize)), maxPageSize);

  try {
    const countResult = await c.env.DB.prepare(
      "SELECT COUNT(*) as total FROM user_actions WHERE user_id = ? AND action IN ('login', 'login_failed')"
    ).bind(userId).first<{ total: number }>();

    const logs = await c.env.DB.prepare(
      `SELECT id, action, data, ip_address, user_agent, created_at 
       FROM user_actions 
       WHERE user_id = ? AND action IN ('login', 'login_failed')
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`
    ).bind(userId, pageSize, (page - 1) * pageSize).all();

    return c.json(success({
      logs: (logs.results || []).map(l => {
        const data = l.data ? (() => { try { return JSON.parse(l.data as string); } catch { return {}; } })() : {};
        return {
          id: l.id,
          loginTime: l.created_at,
          ipAddress: l.ip_address,
          userAgent: l.user_agent,
          loginStatus: l.action === 'login' ? 'success' : 'failed',
          loginMethod: data.method || 'password',
          failureReason: data.reason || null,
        };
      }),
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get login logs error:', err);
    return c.json(error('SERVER_ERROR', '获取登录日志失败'), 500);
  }
});

/**
 * 获取活跃用户排行
 * GET /api/admin/active-users
 */
adminRoutes.get('/active-users', async (c) => {
  const { defaultPageSize, maxPageSize } = getPaginationConfig();
  const limit = Math.min(parseInt(c.req.query('limit') || String(defaultPageSize)), maxPageSize);
  const days = parseInt(c.req.query('days') || '7');

  try {
    const startTime = Date.now() - days * CONFIG.Stats.DAY_IN_MS;

    const users = await c.env.DB.prepare(`
      SELECT u.id, u.username, u.email, u.role_id, u.login_count,
             r.display_name as role_display_name,
             COUNT(DISTINCT CASE WHEN a.action = 'login' THEN a.id END) as recent_logins,
             COUNT(DISTINCT CASE WHEN a.action = 'search' THEN a.id END) as recent_searches
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN user_actions a ON u.id = a.user_id AND a.created_at >= ?
       WHERE u.is_active = 1
       GROUP BY u.id
       ORDER BY recent_logins DESC, u.login_count DESC
       LIMIT ?
    `).bind(startTime, limit).all();

    return c.json(success({
      users: (users.results || []).map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        roleDisplayName: u.role_display_name || '普通用户',
        totalLoginCount: u.login_count || 0,
        recentLogins: u.recent_logins || 0,
        recentSearches: u.recent_searches || 0,
      })),
    }));
  } catch (err) {
    console.error('Get active users error:', err);
    return c.json(error('SERVER_ERROR', '获取活跃用户失败'), 500);
  }
});

/**
 * 获取登录日志统计
 * GET /api/admin/login-stats
 */
adminRoutes.get('/login-stats', async (c) => {
  const days = parseInt(c.req.query('days') || '7');

  try {
    const now = Date.now();
    const startTime = now - days * CONFIG.Stats.DAY_IN_MS;

    const dailyStats = await c.env.DB.prepare(`
      SELECT 
        date(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as total,
        SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN action = 'login_failed' THEN 1 ELSE 0 END) as failed,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_actions
      WHERE created_at >= ? AND action IN ('login', 'login_failed')
      GROUP BY date(created_at / 1000, 'unixepoch')
      ORDER BY date DESC
    `).bind(startTime).all();

    const topIPs = await c.env.DB.prepare(`
      SELECT ip_address, COUNT(*) as count
      FROM user_actions
      WHERE created_at >= ? AND action = 'login' AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY count DESC
      LIMIT 10
    `).bind(startTime).all();

    const failedAttempts = await c.env.DB.prepare(`
      SELECT ip_address, COUNT(*) as count
      FROM user_actions
      WHERE created_at >= ? AND action = 'login_failed' AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY count DESC
      LIMIT 10
    `).bind(startTime).all();

    return c.json(success({
      dailyStats: dailyStats.results || [],
      topIPs: topIPs.results || [],
      failedAttempts: failedAttempts.results || [],
    }));
  } catch (err) {
    console.error('Get login stats error:', err);
    return c.json(error('SERVER_ERROR', '获取登录统计失败'), 500);
  }
});

/**
 * 更新用户状态
 * PUT /api/admin/users/:id/status
 */
adminRoutes.put('/users/:id/status', async (c) => {
  const userId = c.req.param('id');
  const body = await c.req.json();
  const { isActive, reason } = body;
  const adminUser = c.get('user') as JwtPayload;

  try {
    const user = await c.env.DB.prepare(
      'SELECT id, username, role_id FROM users WHERE id = ?'
    ).bind(userId).first<User>();

    if (!user) {
      return c.json(error('NOT_FOUND', '用户不存在'), 404);
    }

    if (user.role_id === 'super_admin' && adminUser.role !== 'super_admin') {
      return c.json(error('FORBIDDEN', '无法禁用超级管理员'), 403);
    }

    await c.env.DB.prepare(
      'UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?'
    ).bind(isActive ? 1 : 0, Date.now(), userId).run();

    if (!isActive) {
      await c.env.DB.prepare(
        'DELETE FROM user_sessions WHERE user_id = ?'
      ).bind(userId).run();
    }

    await logUserAction(c.env, adminUser.userId, 'admin_update_user_status', {
      targetUserId: userId,
      targetUsername: user.username,
      isActive,
      reason,
    }, c);

    return c.json(success(null, isActive ? '用户已启用' : '用户已禁用'));
  } catch (err) {
    console.error('Update user status error:', err);
    return c.json(error('SERVER_ERROR', '更新用户状态失败'), 500);
  }
});

/**
 * 更新用户权限
 * PUT /api/admin/users/:id/permissions
 */
adminRoutes.put('/users/:id/permissions', async (c) => {
  const userId = c.req.param('id');
  const body = await c.req.json();
  const { permissions } = body;
  const adminUser = c.get('user') as JwtPayload;

  if (!Array.isArray(permissions)) {
    return c.json(error('VALIDATION_ERROR', '权限必须是数组'), 400);
  }

  try {
    const user = await c.env.DB.prepare(
      'SELECT id, username FROM users WHERE id = ?'
    ).bind(userId).first<User>();

    if (!user) {
      return c.json(error('NOT_FOUND', '用户不存在'), 404);
    }

    await c.env.DB.prepare(
      'UPDATE users SET permissions = ?, updated_at = ? WHERE id = ?'
    ).bind(JSON.stringify(permissions), Date.now(), userId).run();

    await logUserAction(c.env, adminUser.userId, 'admin_update_user_permissions', {
      targetUserId: userId,
      targetUsername: user.username,
      permissions,
    }, c);

    return c.json(success({ permissions }, '权限已更新'));
  } catch (err) {
    console.error('Update user permissions error:', err);
    return c.json(error('SERVER_ERROR', '更新权限失败'), 500);
  }
});

/**
 * 获取举报列表
 * GET /api/admin/reports
 */
adminRoutes.get('/reports', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const { defaultPageSize, maxPageSize } = getPaginationConfig();
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || String(defaultPageSize)), maxPageSize);
  const status = c.req.query('status') || 'pending';

  try {
    const countResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM community_source_reports WHERE status = ?'
    ).bind(status).first<{ total: number }>();

    const reports = await c.env.DB.prepare(
      `SELECT r.*, 
              s.source_name, s.source_url_template,
              u.username as reporter_username
       FROM community_source_reports r
       LEFT JOIN community_shared_sources s ON r.shared_source_id = s.id
       LEFT JOIN users u ON r.reporter_user_id = u.id
       WHERE r.status = ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(status, pageSize, (page - 1) * pageSize).all();

    return c.json(success({
      reports: reports.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get reports error:', err);
    return c.json(error('SERVER_ERROR', '获取举报列表失败'), 500);
  }
});

/**
 * 处理举报
 * PUT /api/admin/reports/:id
 */
adminRoutes.put('/reports/:id', async (c) => {
  const reportId = c.req.param('id');
  const body = await c.req.json();
  const { status, action, notes } = body;
  const adminUser = c.get('user') as JwtPayload;

  if (!['resolved', 'dismissed'].includes(status)) {
    return c.json(error('VALIDATION_ERROR', '无效的状态'), 400);
  }

  try {
    const report = await c.env.DB.prepare(
      'SELECT * FROM community_source_reports WHERE id = ?'
    ).bind(reportId).first<CommunitySourceReport>();

    if (!report) {
      return c.json(error('NOT_FOUND', '举报不存在'), 404);
    }

    const now = Date.now();

    await c.env.DB.prepare(`
      UPDATE community_source_reports 
      SET status = ?, admin_user_id = ?, admin_action = ?, admin_notes = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(status, adminUser.userId, action || null, notes || null, now, now, reportId).run();

    if (status === 'resolved' && action === 'remove_source') {
      await c.env.DB.prepare(
        "UPDATE community_shared_sources SET status = 'removed', updated_at = ? WHERE id = ?"
      ).bind(now, report.shared_source_id).run();
    }

    await logUserAction(c.env, adminUser.userId, 'admin_handle_report', {
      reportId,
      status,
      action,
      notes,
    }, c);

    return c.json(success(null, '举报已处理'));
  } catch (err) {
    console.error('Handle report error:', err);
    return c.json(error('SERVER_ERROR', '处理举报失败'), 500);
  }
});

/**
 * 获取系统统计
 * GET /api/admin/stats
 */
adminRoutes.get('/stats', async (c) => {
  try {
    const userStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_this_week
      FROM users
    `).bind(Date.now() - CONFIG.Stats.WEEK_IN_MS).first();

    const roleStats = await c.env.DB.prepare(`
      SELECT r.id, r.name, r.display_name, COUNT(u.id) as user_count
      FROM roles r
      LEFT JOIN users u ON r.id = u.role_id
      GROUP BY r.id
      ORDER BY r.priority DESC
    `).all();

    const sourceStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN searchable = 1 THEN 1 ELSE 0 END) as searchable,
        SUM(usage_count) as total_usage
      FROM search_sources
    `).first();

    const searchStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT query) as unique_keywords
      FROM user_search_history
    `).first();

    const communityStats = await c.env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM community_shared_sources) as shared_sources,
        (SELECT COUNT(*) FROM community_source_tags) as tags,
        (SELECT COUNT(*) FROM community_source_reviews) as reviews,
        (SELECT COUNT(*) FROM community_source_reports WHERE status = 'pending') as pending_reports
    `).first();

    const dailyActiveUsers = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM user_sessions
      WHERE last_activity > ?
    `).bind(Date.now() - CONFIG.Stats.DAY_IN_MS).first<{ count: number }>();

    const topSearchKeywords = await c.env.DB.prepare(`
      SELECT query, COUNT(*) as count
      FROM user_search_history
      WHERE created_at > ?
      GROUP BY query
      ORDER BY count DESC
      LIMIT 10
    `).bind(Date.now() - CONFIG.Stats.WEEK_IN_MS).all();

    const topUsedSources = await c.env.DB.prepare(`
      SELECT name, usage_count
      FROM search_sources
      WHERE is_active = 1
      ORDER BY usage_count DESC
      LIMIT 10
    `).all();

    return c.json(success({
      users: {
        total: userStats?.total || 0,
        active: userStats?.active || 0,
        verified: userStats?.verified || 0,
        newThisWeek: userStats?.new_this_week || 0,
        dailyActive: dailyActiveUsers?.count || 0,
      },
      roles: (roleStats.results || []).map(r => ({
        id: r.id,
        name: r.name,
        displayName: r.display_name,
        userCount: r.user_count || 0,
      })),
      sources: {
        total: sourceStats?.total || 0,
        active: sourceStats?.active || 0,
        searchable: sourceStats?.searchable || 0,
        totalUsage: sourceStats?.total_usage || 0,
      },
      searches: {
        total: searchStats?.total || 0,
        uniqueUsers: searchStats?.unique_users || 0,
        uniqueKeywords: searchStats?.unique_keywords || 0,
      },
      community: {
        sharedSources: communityStats?.shared_sources || 0,
        tags: communityStats?.tags || 0,
        reviews: communityStats?.reviews || 0,
        pendingReports: communityStats?.pending_reports || 0,
      },
      topSearchKeywords: topSearchKeywords.results || [],
      topUsedSources: topUsedSources.results || [],
    }));
  } catch (err) {
    console.error('Get admin stats error:', err);
    return c.json(error('SERVER_ERROR', '获取统计失败'), 500);
  }
});

/**
 * 获取行为日志统计概览
 * GET /api/admin/logs/stats
 */
adminRoutes.get('/logs/stats', async (c) => {
  try {
    const now = Date.now();
    const oneDayAgo = now - CONFIG.Stats.DAY_IN_MS;
    const oneWeekAgo = now - CONFIG.Stats.WEEK_IN_MS;

    const totalStats = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM user_actions
    `).first<{ total: number }>();

    const todayStats = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM user_actions WHERE created_at > ?
    `).bind(oneDayAgo).first<{ count: number }>();

    const weekStats = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM user_actions WHERE created_at > ?
    `).bind(oneWeekAgo).first<{ count: number }>();

    const uniqueUsersToday = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count FROM user_actions WHERE created_at > ? AND user_id IS NOT NULL
    `).bind(oneDayAgo).first<{ count: number }>();

    const actionsByType = await c.env.DB.prepare(`
      SELECT action, COUNT(*) as count
      FROM user_actions
      WHERE created_at > ?
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `).bind(oneWeekAgo).all<{ action: string; count: number }>();

    const loginStats = await c.env.DB.prepare(`
      SELECT 
        SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN action = 'login_failed' THEN 1 ELSE 0 END) as failed
      FROM user_actions
      WHERE action IN ('login', 'login_failed') AND created_at > ?
    `).bind(oneDayAgo).first<{ success: number; failed: number }>();

    return c.json(success({
      total: totalStats?.total || 0,
      today: todayStats?.count || 0,
      week: weekStats?.count || 0,
      uniqueUsersToday: uniqueUsersToday?.count || 0,
      actionsByType: actionsByType.results || [],
      loginToday: {
        success: loginStats?.success || 0,
        failed: loginStats?.failed || 0,
      },
    }));
  } catch (err) {
    console.error('Get logs stats error:', err);
    return c.json(error('SERVER_ERROR', '获取行为日志统计失败'), 500);
  }
});

/**
 * 获取行为日志
 * GET /api/admin/logs
 */
adminRoutes.get('/logs', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const { defaultPageSize, maxLogPageSize } = getPaginationConfig();
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || String(defaultPageSize)), maxLogPageSize);
  const userId = c.req.query('userId');
  const username = c.req.query('username');
  const action = c.req.query('action');

  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (userId) {
      conditions.push('a.user_id = ?');
      params.push(userId);
    }

    if (username) {
      conditions.push('u.username LIKE ?');
      params.push(`%${username}%`);
    }

    if (action) {
      const actions = action.split(',').map(a => a.trim()).filter(Boolean);
      if (actions.length > 0) {
        const placeholders = actions.map(() => '?').join(', ');
        conditions.push(`a.action IN (${placeholders})`);
        params.push(...actions);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM user_actions a LEFT JOIN users u ON a.user_id = u.id ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const logs = await c.env.DB.prepare(`
      SELECT a.*, u.username
      FROM user_actions a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, (page - 1) * pageSize).all<UserAction & { username: string | null }>();

    return c.json(success({
      logs: logs.results || [],
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get logs error:', err);
    return c.json(error('SERVER_ERROR', '获取日志失败'), 500);
  }
});

/**
 * POST /api/admin/cleanup
 * 手动清理过期数据（仅清理需要动态配置保留天数的表）
 * 
 * 说明：
 * - user_sessions、email_verifications、security_lockouts 由触发器实时清理
 * - password_reset_logs、user_actions、user_security_events 需要动态配置保留天数
 */
adminRoutes.post('/cleanup', async (c) => {
  const adminUser = c.get('user') as JwtPayload;

  try {
    const configService = new ConfigService(c.env);
    const passwordResetRetentionDays = await configService.getInt(DB_CONFIG_KEYS.PASSWORD_RESET_LOG_RETENTION_DAYS, 30);
    const userActionsRetentionDays = await configService.getInt(DB_CONFIG_KEYS.USER_ACTIONS_RETENTION_DAYS, 90);
    const securityEventRetentionDays = await configService.getInt(DB_CONFIG_KEYS.SECURITY_EVENT_RETENTION_DAYS, 90);

    const now = Date.now();
    const results = {
      oldPasswordResetLogs: 0,
      oldActions: 0,
      oldSecurityEvents: 0,
    };

    const oldPasswordResetLogs = await c.env.DB.prepare(
      'DELETE FROM password_reset_logs WHERE created_at < ?'
    ).bind(now - passwordResetRetentionDays * CONFIG.Stats.DAY_IN_MS).run();
    results.oldPasswordResetLogs = oldPasswordResetLogs.meta.changes || 0;

    const oldActions = await c.env.DB.prepare(
      'DELETE FROM user_actions WHERE created_at < ?'
    ).bind(now - userActionsRetentionDays * CONFIG.Stats.DAY_IN_MS).run();
    results.oldActions = oldActions.meta.changes || 0;

    const oldSecurityEvents = await c.env.DB.prepare(
      'DELETE FROM user_security_events WHERE created_at < ?'
    ).bind(now - securityEventRetentionDays * CONFIG.Stats.DAY_IN_MS).run();
    results.oldSecurityEvents = oldSecurityEvents.meta.changes || 0;

    await logUserAction(c.env, adminUser.userId, 'admin_cleanup', results, c);

    return c.json(success(results, '数据清理完成'));
  } catch (err) {
    console.error('Cleanup error:', err);
    return c.json(error('SERVER_ERROR', '清理失败'), 500);
  }
});

/**
 * 获取会话统计概览
 * GET /api/admin/sessions/stats
 */
adminRoutes.get('/sessions/stats', async (c) => {
  try {
    const now = Date.now();
    const oneDayAgo = now - CONFIG.Stats.DAY_IN_MS;
    const oneHourAgo = now - CONFIG.Stats.HOUR_IN_MS;

    const totalStats = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM user_sessions
    `).first<{ total: number }>();

    const activeStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as active,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_sessions
      WHERE expires_at > ?
    `).bind(now).first<{ active: number; unique_users: number }>();

    const recentActive = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM user_sessions
      WHERE last_activity > ? AND expires_at > ?
    `).bind(oneHourAgo, now).first<{ count: number }>();

    const todaySessions = await c.env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM user_sessions
      WHERE created_at > ?
    `).bind(oneDayAgo).first<{ count: number }>();

    const topDevices = await c.env.DB.prepare(`
      SELECT 
        CASE 
          WHEN user_agent LIKE '%Mobile%' THEN 'Mobile'
          WHEN user_agent LIKE '%Tablet%' THEN 'Tablet'
          ELSE 'Desktop'
        END as device_type,
        COUNT(*) as count
      FROM user_sessions
      WHERE expires_at > ?
      GROUP BY device_type
      ORDER BY count DESC
    `).bind(now).all<{ device_type: string; count: number }>();

    return c.json(success({
      total: totalStats?.total || 0,
      active: activeStats?.active || 0,
      uniqueUsers: activeStats?.unique_users || 0,
      recentlyActive: recentActive?.count || 0,
      todaySessions: todaySessions?.count || 0,
      deviceDistribution: topDevices.results || [],
    }));
  } catch (err) {
    console.error('Get sessions stats error:', err);
    return c.json(error('SERVER_ERROR', '获取会话统计失败'), 500);
  }
});

/**
 * 获取所有会话列表
 * GET /api/admin/sessions
 */
adminRoutes.get('/sessions', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const { defaultPageSize, maxPageSize } = getPaginationConfig();
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || String(defaultPageSize)), maxPageSize);
  const userId = c.req.query('userId');
  const status = c.req.query('status');

  try {
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (userId) {
      whereClause += ' AND s.user_id = ?';
      params.push(userId);
    }

    if (status === 'active') {
      whereClause += ' AND s.expires_at > ?';
      params.push(Date.now());
    } else if (status === 'expired') {
      whereClause += ' AND s.expires_at <= ?';
      params.push(Date.now());
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM user_sessions s ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const sessions = await c.env.DB.prepare(`
      SELECT s.*, u.username, u.email
      FROM user_sessions s
      LEFT JOIN users u ON s.user_id = u.id
      ${whereClause}
      ORDER BY s.last_activity DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, (page - 1) * pageSize).all();

    const now = Date.now();

    return c.json(success({
      sessions: (sessions.results || []).map((s) => {
        const result = adminSessionSchema.safeParse(s);
        const session = result.success ? result.data : s as { id: string; user_id: string; ip_address?: string; user_agent?: string; created_at: number; last_activity: number; expires_at: number };
        return {
          id: session.id,
          userId: session.user_id,
          username: (s as Record<string, unknown>).username as string,
          email: (s as Record<string, unknown>).email as string,
          ipAddress: session.ip_address,
          userAgent: session.user_agent,
          createdAt: session.created_at,
          lastActivity: session.last_activity,
          expiresAt: session.expires_at,
          isActive: session.expires_at > now,
          expiresInSeconds: Math.max(0, Math.floor((session.expires_at - now) / 1000)),
        };
      }),
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get sessions error:', err);
    return c.json(error('SERVER_ERROR', '获取会话列表失败'), 500);
  }
});

/**
 * 强制终止会话
 * DELETE /api/admin/sessions/:id
 */
adminRoutes.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const adminUser = c.get('user') as JwtPayload;

  try {
    const session = await c.env.DB.prepare(`
      SELECT s.*, u.username
      FROM user_sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).bind(sessionId).first();

    if (!session) {
      return c.json(error('NOT_FOUND', '会话不存在'), 404);
    }

    await c.env.DB.prepare('DELETE FROM user_sessions WHERE id = ?').bind(sessionId).run();

    await logUserAction(c.env, adminUser.userId, 'admin_terminate_session', {
      sessionId,
      targetUserId: (session as any).user_id,
      targetUsername: (session as any).username,
    }, c);

    return c.json(success(null, '会话已终止'));
  } catch (err) {
    console.error('Terminate session error:', err);
    return c.json(error('SERVER_ERROR', '终止会话失败'), 500);
  }
});

/**
 * 获取分析事件统计
 * GET /api/admin/analytics/stats
 */
adminRoutes.get('/analytics/stats', async (c) => {
  const days = parseInt(c.req.query('days') || '7');

  try {
    const now = Date.now();
    const startTime = now - days * CONFIG.Stats.DAY_IN_MS;

    const totalEvents = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM analytics_events WHERE created_at > ?'
    ).bind(startTime).first<{ count: number }>();

    const eventsByType = await c.env.DB.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ?
      GROUP BY event_type
      ORDER BY count DESC
    `).bind(startTime).all();

    const dailyEvents = await c.env.DB.prepare(`
      SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date
    `).bind(startTime).all();

    const uniqueUsers = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM analytics_events
      WHERE created_at > ? AND user_id IS NOT NULL
    `).bind(startTime).first<{ count: number }>();

    const uniqueSessions = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT session_id) as count
      FROM analytics_events
      WHERE created_at > ? AND session_id IS NOT NULL
    `).bind(startTime).first<{ count: number }>();

    const topReferers = await c.env.DB.prepare(`
      SELECT referer, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ? AND referer IS NOT NULL
      GROUP BY referer
      ORDER BY count DESC
      LIMIT 10
    `).bind(startTime).all();

    const hourlyDistribution = await c.env.DB.prepare(`
      SELECT strftime('%H', datetime(created_at / 1000, 'unixepoch')) as hour, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ?
      GROUP BY hour
      ORDER BY hour
    `).bind(startTime).all();

    return c.json(success({
      totalEvents: totalEvents?.count || 0,
      uniqueUsers: uniqueUsers?.count || 0,
      uniqueSessions: uniqueSessions?.count || 0,
      eventsByType: eventsByType.results || [],
      dailyEvents: dailyEvents.results || [],
      topReferers: topReferers.results || [],
      hourlyDistribution: hourlyDistribution.results || [],
      period: { days, startTime },
    }));
  } catch (err) {
    console.error('Get analytics stats error:', err);
    return c.json(error('SERVER_ERROR', '获取分析统计失败'), 500);
  }
});

/**
 * 获取分析事件列表
 * GET /api/admin/analytics/events
 */
adminRoutes.get('/analytics/events', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const { defaultPageSize, maxPageSize } = getPaginationConfig();
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || String(defaultPageSize)), maxPageSize);
  const eventType = c.req.query('eventType');
  const userId = c.req.query('userId');

  try {
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (eventType) {
      whereClause += ' AND e.event_type = ?';
      params.push(eventType);
    }

    if (userId) {
      whereClause += ' AND e.user_id = ?';
      params.push(userId);
    }

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM analytics_events e ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const events = await c.env.DB.prepare(`
      SELECT e.*, u.username
      FROM analytics_events e
      LEFT JOIN users u ON e.user_id = u.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, (page - 1) * pageSize).all();

    return c.json(success({
      events: (events.results || []).map((e) => {
        const result = adminEventSchema.safeParse(e);
        const event = result.success ? result.data : e as { id: string; user_id?: string; event_type: string; data?: string; ip_address?: string; user_agent?: string; session_id?: string; referer?: string; created_at: number };
        return {
          id: event.id,
          userId: event.user_id,
          username: (e as Record<string, unknown>).username,
          sessionId: event.session_id,
          eventType: event.event_type,
          eventData: event.data ? (() => { try { return JSON.parse(event.data); } catch { return {}; } })() : {},
          ipAddress: event.ip_address,
          userAgent: event.user_agent,
          referer: event.referer,
          createdAt: event.created_at,
        };
      }),
      total: countResult?.total || 0,
      page,
      pageSize,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize),
    }));
  } catch (err) {
    console.error('Get analytics events error:', err);
    return c.json(error('SERVER_ERROR', '获取分析事件失败'), 500);
  }
});

/**
 * 获取看板概览数据
 * GET /api/admin/dashboard/overview
 */
adminRoutes.get('/dashboard/overview', async (c) => {
  try {
    const now = Date.now();
    const oneDayAgo = now - CONFIG.Stats.DAY_IN_MS;
    const oneWeekAgo = now - CONFIG.Stats.WEEK_IN_MS;
    const oneMonthAgo = now - CONFIG.Stats.MONTH_IN_MS;

    const userStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_week,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_month
      FROM users
    `).bind(oneDayAgo, oneWeekAgo, oneMonthAgo).first();

    const sessionStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN expires_at > ? THEN 1 ELSE 0 END) as active,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_sessions
    `).bind(now).first();

    const actionStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as week
      FROM user_actions
    `).bind(oneDayAgo, oneWeekAgo).first();

    const analyticsStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT session_id) as unique_sessions,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as week
      FROM analytics_events
    `).bind(oneDayAgo, oneWeekAgo).first();

    const sourceStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(usage_count) as total_usage
      FROM search_sources
    `).first();

    const searchStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as week
      FROM user_search_history
    `).bind(oneDayAgo, oneWeekAgo).first();

    const loginStats = await c.env.DB.prepare(`
      SELECT 
        SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN action = 'login_failed' THEN 1 ELSE 0 END) as failed
      FROM user_actions
      WHERE action IN ('login', 'login_failed') AND created_at > ?
    `).bind(oneDayAgo).first();

    const communityStats = await c.env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM community_shared_sources) as shared_sources,
        (SELECT COUNT(*) FROM community_source_reviews) as reviews,
        (SELECT COUNT(*) FROM community_source_reports WHERE status = 'pending') as pending_reports
    `).first();

    const recentActions = await c.env.DB.prepare(`
      SELECT a.action, a.data, a.created_at, u.username
      FROM user_actions a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 20
    `).all();

    const activeUsersToday = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM user_sessions
      WHERE last_activity > ?
    `).bind(oneDayAgo).first<{ count: number }>();

    return c.json(success({
      users: {
        total: userStats?.total || 0,
        active: userStats?.active || 0,
        newToday: userStats?.new_today || 0,
        newWeek: userStats?.new_week || 0,
        newMonth: userStats?.new_month || 0,
        activeToday: activeUsersToday?.count || 0,
      },
      sessions: {
        total: sessionStats?.total || 0,
        active: sessionStats?.active || 0,
        uniqueUsers: sessionStats?.unique_users || 0,
      },
      actions: {
        total: actionStats?.total || 0,
        uniqueUsers: actionStats?.unique_users || 0,
        today: actionStats?.today || 0,
        week: actionStats?.week || 0,
      },
      analytics: {
        total: analyticsStats?.total || 0,
        uniqueUsers: analyticsStats?.unique_users || 0,
        uniqueSessions: analyticsStats?.unique_sessions || 0,
        today: analyticsStats?.today || 0,
        week: analyticsStats?.week || 0,
      },
      sources: {
        total: sourceStats?.total || 0,
        active: sourceStats?.active || 0,
        totalUsage: sourceStats?.total_usage || 0,
      },
      searches: {
        total: searchStats?.total || 0,
        uniqueUsers: searchStats?.unique_users || 0,
        today: searchStats?.today || 0,
        week: searchStats?.week || 0,
      },
      logins: {
        successToday: loginStats?.success || 0,
        failedToday: loginStats?.failed || 0,
      },
      community: {
        sharedSources: communityStats?.shared_sources || 0,
        reviews: communityStats?.reviews || 0,
        pendingReports: communityStats?.pending_reports || 0,
      },
      recentActions: (recentActions.results || []).map((a) => {
        try {
          const result = adminActionSchema.safeParse(a);
          const action = result.success ? result.data : a as { id: string; user_id?: string; action: string; data?: string; ip_address?: string; user_agent?: string; created_at: number };
          return {
            action: action.action,
            data: action.data ? (() => { try { return JSON.parse(action.data); } catch { return {}; } })() : {},
            createdAt: action.created_at,
            username: (a as Record<string, unknown>).username || '匿名',
          };
        } catch (parseError) {
          console.error('Parse recent action error:', parseError, a);
          return null;
        }
      }).filter(Boolean),
    }));
  } catch (err) {
    console.error('Get dashboard overview error:', err);
    return c.json(error('SERVER_ERROR', '获取看板概览失败'), 500);
  }
});

/**
 * 获取趋势数据
 * GET /api/admin/dashboard/trends
 */
adminRoutes.get('/dashboard/trends', async (c) => {
  const days = parseInt(c.req.query('days') || '7');

  try {
    const now = Date.now();
    const startTime = now - days * CONFIG.Stats.DAY_IN_MS;

    const userRegistrations = await c.env.DB.prepare(`
      SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM users
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date
    `).bind(startTime).all();

    const dailyLogins = await c.env.DB.prepare(`
      SELECT 
        date(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as total,
        SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN action = 'login_failed' THEN 1 ELSE 0 END) as failed
      FROM user_actions
      WHERE created_at > ? AND action IN ('login', 'login_failed')
      GROUP BY date
      ORDER BY date
    `).bind(startTime).all();

    const dailySearches = await c.env.DB.prepare(`
      SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM user_search_history
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date
    `).bind(startTime).all();

    const dailyAnalytics = await c.env.DB.prepare(`
      SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date
    `).bind(startTime).all();

    const dailyActiveUsers = await c.env.DB.prepare(`
      SELECT date(last_activity / 1000, 'unixepoch') as date, COUNT(DISTINCT user_id) as count
      FROM user_sessions
      WHERE last_activity > ?
      GROUP BY date
      ORDER BY date
    `).bind(startTime).all();

    return c.json(success({
      userRegistrations: userRegistrations.results || [],
      dailyLogins: dailyLogins.results || [],
      dailySearches: dailySearches.results || [],
      dailyAnalytics: dailyAnalytics.results || [],
      dailyActiveUsers: dailyActiveUsers.results || [],
      period: { days, startTime },
    }));
  } catch (err) {
    console.error('Get trends error:', err);
    return c.json(error('SERVER_ERROR', '获取趋势数据失败'), 500);
  }
});

/**
 * 获取用户行为分析
 * GET /api/admin/dashboard/user-behavior
 */
adminRoutes.get('/dashboard/user-behavior', async (c) => {
  const days = parseInt(c.req.query('days') || '7');

  try {
    const now = Date.now();
    const startTime = now - days * CONFIG.Stats.DAY_IN_MS;

    const actionsByType = await c.env.DB.prepare(`
      SELECT action, COUNT(*) as count
      FROM user_actions
      WHERE created_at > ?
      GROUP BY action
      ORDER BY count DESC
    `).bind(startTime).all();

    const topActiveUsers = await c.env.DB.prepare(`
      SELECT u.id, u.username, u.email, COUNT(a.id) as action_count
      FROM users u
      LEFT JOIN user_actions a ON u.id = a.user_id AND a.created_at > ?
      GROUP BY u.id
      ORDER BY action_count DESC
      LIMIT 20
    `).bind(startTime).all();

    const hourlyActivity = await c.env.DB.prepare(`
      SELECT strftime('%H', datetime(created_at / 1000, 'unixepoch')) as hour, COUNT(*) as count
      FROM user_actions
      WHERE created_at > ?
      GROUP BY hour
      ORDER BY hour
    `).bind(startTime).all();

    const weeklyActivity = await c.env.DB.prepare(`
      SELECT strftime('%w', datetime(created_at / 1000, 'unixepoch')) as weekday, COUNT(*) as count
      FROM user_actions
      WHERE created_at > ?
      GROUP BY weekday
      ORDER BY weekday
    `).bind(startTime).all();

    return c.json(success({
      actionsByType: actionsByType.results || [],
      topActiveUsers: topActiveUsers.results || [],
      hourlyActivity: hourlyActivity.results || [],
      weeklyActivity: weeklyActivity.results || [],
      period: { days, startTime },
    }));
  } catch (err) {
    console.error('Get user behavior error:', err);
    return c.json(error('SERVER_ERROR', '获取用户行为分析失败'), 500);
  }
});
