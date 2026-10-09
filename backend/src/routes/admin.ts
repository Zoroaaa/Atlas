/**
 * 管理员功能路由
 * 功能：用户管理、系统配置、举报处理、数据统计、角色管理
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env, JwtPayload } from '@/types';
import { success, error, logUserAction } from '@/utils';
import { ConfigService } from '@/services';
import { CONFIG, VALIDATION_RULES, DB_CONFIG_KEYS } from '@/constants';
import { authMiddleware, adminMiddleware, checkIsSuperAdmin } from '@/middleware/auth';
import { adminSessionSchema, adminEventSchema, adminActionSchema } from '@/utils/validators';
import { validateBody, schemas } from '@/validation';
import {
  listRoles,
  findRoleById,
  getUserStats,
  countActiveUsersSince,
  listRoleUserDistribution,
  countUsers,
  listUsers,
  findUserDetailById,
  listUserRecentSessions,
  countUserFavorites,
  countUserSearchHistory,
  listUserRecentActions,
  findUserRoleRef,
  updateUserRole,
  deleteUserSessions,
  findUserIdentity,
  updateUserStatus,
  updateUserPermissions,
  findUserRolePriority,
  findUserRoleAndPriority,
  countUserLoginActions,
  listUserLoginLogs,
  listActiveUsers,
  queryActivityRanking,
  listLoginDailyStats,
  listLoginTopIPs,
  listLoginFailedAttempts,
  countReportsByStatus,
  listReportsByStatus,
  findReportById,
  updateReportHandling,
  hidePost,
  getSystemUserStats,
  listRoleStats,
  getSourceStats,
  getSearchHistoryStats,
  getCommunitySummaryStats,
  listTopSearchKeywords,
  listTopUsedSources,
  countUserActions,
  countUserActionsSince,
  countDistinctUsersSince,
  listActionsByType,
  getLoginActionStats,
  countActionLogs,
  listActionLogs,
  deletePasswordResetLogsBefore,
  deleteUserActionsBefore,
  deleteSecurityEventsBefore,
  countAllSessions,
  getActiveSessionStats,
  countRecentlyActiveSessions,
  countSessionsSince,
  listDeviceDistribution,
  countSessions,
  listSessions,
  findSessionWithUserAndRole,
  deleteSessionById,
  countAnalyticsEventsSince,
  listAnalyticsEventsByType,
  listAnalyticsDailyEvents,
  countAnalyticsUniqueUsers,
  countAnalyticsUniqueSessions,
  listAnalyticsTopReferers,
  listAnalyticsHourlyDistribution,
  countAnalyticsEvents,
  listAnalyticsEvents,
  getDashboardUserStats,
  getDashboardSessionStats,
  getDashboardActionStats,
  getDashboardAnalyticsStats,
  getDashboardSourceStats,
  getDashboardSearchStats,
  getDashboardLoginStats,
  getDashboardCommunityStats,
  listDashboardRecentActions,
  listUserRegistrationsByDay,
  listDailyLoginStats,
  listDailySearches,
  listDailyActiveUsers,
  listUserActionTypes,
  listTopActiveUsers,
  listHourlyActivity,
  listWeeklyActivity,
  getSystemErrorStats,
  listSystemErrorsByType,
  listTopSystemErrors,
  listDailySystemErrors,
  countSystemErrors,
  listSystemErrors,
  listUsernamesByIds,
  findSystemErrorById,
  findUsernameById,
  listRelatedSystemErrors,
  deleteSystemErrorsByFingerprint,
  deleteSystemErrorById,
} from '@/repositories/admin-repository';

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
    const roles = await listRoles(c.env.DB);

    return c.json(success({
      roles: roles.map(r => ({
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

    const userStats = await getUserStats(c.env.DB, { oneDayAgo, oneWeekAgo, oneMonthAgo });

    const activeToday = await countActiveUsersSince(c.env.DB, oneDayAgo);

    const roleDistribution = await listRoleUserDistribution(c.env.DB);

    return c.json(success({
      total: userStats?.total || 0,
      active: userStats?.active || 0,
      inactive: userStats?.inactive || 0,
      verified: userStats?.verified || 0,
      newToday: userStats?.new_today || 0,
      newWeek: userStats?.new_week || 0,
      newMonth: userStats?.new_month || 0,
      activeToday: activeToday,
      roleDistribution: roleDistribution,
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
    const total = await countUsers(c.env.DB, { search, status, roleId });

    const users = await listUsers(c.env.DB, {
      search,
      status,
      roleId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return c.json(success({
      users: users.map(u => ({
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
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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
    const user = await findUserDetailById(c.env.DB, userId);

    if (!user) {
      return c.json(error('NOT_FOUND', '用户不存在'), 404);
    }

    const sessions = await listUserRecentSessions(c.env.DB, userId);

    const favoritesCount = await countUserFavorites(c.env.DB, userId);

    const historyCount = await countUserSearchHistory(c.env.DB, userId);

    const recentActions = await listUserRecentActions(c.env.DB, userId);

    const loginCount = recentActions.filter((a) => {
      const result = adminActionSchema.safeParse(a);
      const action = result.success ? result.data : a as { action: string };
      return action.action === 'login';
    }).length || 0;

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
        favoritesCount: favoritesCount,
        historyCount: historyCount,
        activeSessions: sessions.length,
        totalLoginCount: loginCount,
        totalSearchCount: historyCount,
      },
      recentSessions: sessions,
      recentActions: recentActions,
    }));
  } catch (err) {
    console.error('Get user detail error:', err);
    return c.json(error('SERVER_ERROR', '获取用户详情失败'), 500);
  }
});

/**
 * 更新用户角色
 * PUT /api/admin/users/:id/role
 * 
 * 权限规则：
 * - 只有超级管理员可以修改用户角色
 * - 管理员无权修改任何用户角色
 */
adminRoutes.put('/users/:id/role', validateBody(schemas.admin.updateUserRole), async (c) => {
  const userId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.admin.updateUserRole>;
  const { roleId } = body;
  const adminUser = c.get('user') as JwtPayload;

  // 权限检查：只有超级管理员可以修改用户角色
  const isSuperAdmin = await checkIsSuperAdmin(c);
  if (!isSuperAdmin) {
    return c.json(error('FORBIDDEN', '只有超级管理员可以修改用户角色'), 403);
  }

  try {
    const role = await findRoleById(c.env.DB, roleId);

    if (!role) {
      return c.json(error('NOT_FOUND', '角色不存在'), 404);
    }

    const user = await findUserRoleRef(c.env.DB, userId);

    if (!user) {
      return c.json(error('NOT_FOUND', '用户不存在'), 404);
    }

    // 更新角色
    await updateUserRole(c.env.DB, { userId, roleId, now: Date.now() });

    // 清除该用户所有session，强制重新登录获取新token
    await deleteUserSessions(c.env.DB, userId);

    await logUserAction(c.env, adminUser.userId, 'admin_update_user_role', {
      targetUserId: userId,
      targetUsername: user.username,
      oldRole: user.role_id,
      newRole: roleId,
    }, c);

    return c.json(success({ roleId, roleName: role.display_name }, '角色已更新，用户需要重新登录'));
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
    const total = await countUserLoginActions(c.env.DB, userId);

    const logs = await listUserLoginLogs(c.env.DB, { userId, limit: pageSize, offset: (page - 1) * pageSize });

    return c.json(success({
      logs: logs.map(l => {
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
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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

    const users = await listActiveUsers(c.env.DB, { startTime, limit });

    return c.json(success({
      users: users.map(u => ({
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
 * 用户活跃度排名
 * GET /api/admin/activity-ranking?period=today|week|month|all&limit=20
 *
 * 数据口径：
 * - 搜索数：user_search_history（每次搜索必写入，为权威来源）
 * - 收藏/登录/其他行为：user_actions 行为日志（add_favorite / login / 其余有效行为）
 * - 综合活跃分 = 搜索×2 + 收藏×3 + 登录×1 + 其他×1
 * - "当天"按北京时间（UTC+8）自然日计算，其余为滚动窗口
 * - 一次返回 综合/搜索/收藏 三个榜单，前端切换维度无需重复请求
 */
adminRoutes.get('/activity-ranking', async (c) => {
  const { defaultPageSize, maxPageSize } = getPaginationConfig();
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || String(defaultPageSize)), 1), maxPageSize);
  const period = c.req.query('period') || 'week';

  if (!['today', 'week', 'month', 'all'].includes(period)) {
    return c.json(error('VALIDATION_ERROR', '无效的时间范围'), 400);
  }

  // 综合活跃分权重（同步暴露给前端用于展示计算规则）
  const SCORE_WEIGHTS = { search: 2, favorite: 3, login: 1, other: 1 };

  try {
    const now = Date.now();
    let startTime: number;
    if (period === 'today') {
      // 北京时间（UTC+8）当天 00:00 对应的 UTC 时间戳
      const SH_OFFSET = 8 * CONFIG.Stats.HOUR_IN_MS;
      startTime = Math.floor((now + SH_OFFSET) / CONFIG.Stats.DAY_IN_MS) * CONFIG.Stats.DAY_IN_MS - SH_OFFSET;
    } else if (period === 'week') {
      startTime = now - 7 * CONFIG.Stats.DAY_IN_MS;
    } else if (period === 'month') {
      startTime = now - 30 * CONFIG.Stats.DAY_IN_MS;
    } else {
      startTime = 0;
    }

    const rows = await queryActivityRanking(c.env.DB, { startTime });

    interface Entry {
      rank: number;
      userId: string;
      username: string;
      email: string;
      roleDisplayName: string;
      isActive: boolean;
      searches: number;
      favorites: number;
      logins: number;
      otherActions: number;
      score: number;
      lastActiveAt: number;
    }

    const entries: Entry[] = rows.map((r) => ({
      rank: 0,
      userId: r.id,
      username: r.username,
      email: r.email,
      roleDisplayName: r.role_display_name || '普通用户',
      isActive: r.is_active === 1,
      searches: r.searches || 0,
      favorites: r.favorites || 0,
      logins: r.logins || 0,
      otherActions: r.other_actions || 0,
      score:
        (r.searches || 0) * SCORE_WEIGHTS.search +
        (r.favorites || 0) * SCORE_WEIGHTS.favorite +
        (r.logins || 0) * SCORE_WEIGHTS.login +
        (r.other_actions || 0) * SCORE_WEIGHTS.other,
      lastActiveAt: r.last_active_at || 0,
    }));

    const rankBy = (key: 'score' | 'searches' | 'favorites'): Entry[] =>
      [...entries]
        .sort((a, b) => (b[key] as number) - (a[key] as number) || a.username.localeCompare(b.username))
        .slice(0, limit)
        .map((e, i) => ({ ...e, rank: i + 1 }));

    return c.json(success({
      period,
      startTime,
      weights: SCORE_WEIGHTS,
      summary: {
        activeUsers: entries.length,
        totalSearches: entries.reduce((s, e) => s + e.searches, 0),
        totalFavorites: entries.reduce((s, e) => s + e.favorites, 0),
        totalLogins: entries.reduce((s, e) => s + e.logins, 0),
        totalOtherActions: entries.reduce((s, e) => s + e.otherActions, 0),
      },
      rankings: {
        overall: rankBy('score'),
        search: rankBy('searches'),
        favorite: rankBy('favorites'),
      },
    }));
  } catch (err) {
    console.error('Get activity ranking error:', err);
    return c.json(error('SERVER_ERROR', '获取活跃排名失败'), 500);
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

    const dailyStats = await listLoginDailyStats(c.env.DB, startTime);

    const topIPs = await listLoginTopIPs(c.env.DB, startTime);

    const failedAttempts = await listLoginFailedAttempts(c.env.DB, startTime);

    return c.json(success({
      dailyStats: dailyStats,
      topIPs: topIPs,
      failedAttempts: failedAttempts,
    }));
  } catch (err) {
    console.error('Get login stats error:', err);
    return c.json(error('SERVER_ERROR', '获取登录统计失败'), 500);
  }
});

/**
 * 更新用户状态
 * PUT /api/admin/users/:id/status
 * 
 * 权限规则：
 * - 超级管理员：可以禁用/启用任意用户（包括其他超级管理员）
 * - 管理员：只能禁用/启用普通用户，不能操作管理员或超级管理员
 */
adminRoutes.put('/users/:id/status', validateBody(schemas.admin.updateUserStatus), async (c) => {
  const userId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.admin.updateUserStatus>;
  const { isActive, reason } = body;
  const adminUser = c.get('user') as JwtPayload;

  try {
    // 获取当前管理员的角色级别
    const adminRole = await findUserRolePriority(c.env.DB, adminUser.userId);
    const adminPriority = adminRole?.priority || 10;

    // 获取目标用户信息
    const user = await findUserRoleAndPriority(c.env.DB, userId);

    if (!user) {
      return c.json(error('NOT_FOUND', '用户不存在'), 404);
    }

    const targetPriority = user.priority || 10;

    // 权限隔离：管理员只能操作优先级低于自己的用户
    // 超级管理员(priority=100) 可以操作所有人
    // 管理员(priority=50) 只能操作普通用户(priority=10)
    if (targetPriority >= adminPriority) {
      // 目标用户优先级 >= 当前管理员优先级，需要检查是否为超级管理员
      const isSuperAdmin = await checkIsSuperAdmin(c);
      if (!isSuperAdmin) {
        return c.json(error('FORBIDDEN', '无法操作同级或更高级别的用户'), 403);
      }
    }

    // 自我保护：不能禁用自己
    if (userId === adminUser.userId && !isActive) {
      return c.json(error('FORBIDDEN', '不能禁用自己'), 403);
    }

    await updateUserStatus(c.env.DB, { userId, isActive, now: Date.now() });

    if (!isActive) {
      await deleteUserSessions(c.env.DB, userId);
    }

    await logUserAction(c.env, adminUser.userId, 'admin_update_user_status', {
      targetUserId: userId,
      targetUsername: user.username,
      targetRole: user.role_name,
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
 * 
 * 权限规则：只有超级管理员可以修改用户权限
 */
adminRoutes.put('/users/:id/permissions', validateBody(schemas.admin.updateUserPermissions), async (c) => {
  const userId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.admin.updateUserPermissions>;
  const { permissions } = body;
  const adminUser = c.get('user') as JwtPayload;

  // 权限检查：只有超级管理员可以修改用户权限
  const isSuperAdmin = await checkIsSuperAdmin(c);
  if (!isSuperAdmin) {
    return c.json(error('FORBIDDEN', '只有超级管理员可以修改用户权限'), 403);
  }

  try {
    const user = await findUserIdentity(c.env.DB, userId);

    if (!user) {
      return c.json(error('NOT_FOUND', '用户不存在'), 404);
    }

    await updateUserPermissions(c.env.DB, { userId, permissions: JSON.stringify(permissions), now: Date.now() });

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
    const total = await countReportsByStatus(c.env.DB, status);

    const reports = await listReportsByStatus(c.env.DB, { status, limit: pageSize, offset: (page - 1) * pageSize });

    return c.json(success({
      reports: reports,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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
adminRoutes.put('/reports/:id', validateBody(schemas.admin.handleReport), async (c) => {
  const reportId = c.req.param('id');
  const body = c.get('validatedBody') as z.infer<typeof schemas.admin.handleReport>;
  const { status, action, notes } = body;
  const adminUser = c.get('user') as JwtPayload;

  try {
    const report = await findReportById(c.env.DB, reportId);

    if (!report) {
      return c.json(error('NOT_FOUND', '举报不存在'), 404);
    }

    const now = Date.now();

    await updateReportHandling(c.env.DB, {
      reportId,
      status,
      adminUserId: adminUser.userId,
      action: action || null,
      notes: notes || null,
      now,
    });

    if (status === 'resolved' && action === 'remove_source') {
      await hidePost(c.env.DB, { postId: report.post_id, now });
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
    const userStats = await getSystemUserStats(c.env.DB, Date.now() - CONFIG.Stats.WEEK_IN_MS);

    const roleStats = await listRoleStats(c.env.DB);

    const sourceStats = await getSourceStats(c.env.DB);

    const searchStats = await getSearchHistoryStats(c.env.DB);

    const communityStats = await getCommunitySummaryStats(c.env.DB);

    const dailyActiveUsers = await countActiveUsersSince(c.env.DB, Date.now() - CONFIG.Stats.DAY_IN_MS);

    const topSearchKeywords = await listTopSearchKeywords(c.env.DB, Date.now() - CONFIG.Stats.WEEK_IN_MS);

    const topUsedSources = await listTopUsedSources(c.env.DB);

    return c.json(success({
      users: {
        total: userStats?.total || 0,
        active: userStats?.active || 0,
        verified: userStats?.verified || 0,
        newThisWeek: userStats?.new_this_week || 0,
        dailyActive: dailyActiveUsers,
      },
      roles: roleStats.map(r => ({
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
        posts: communityStats?.posts || 0,
        tags: communityStats?.tags || 0,
        reviews: communityStats?.reviews || 0,
        pendingReports: communityStats?.pending_reports || 0,
      },
      topSearchKeywords: topSearchKeywords,
      topUsedSources: topUsedSources,
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

    const total = await countUserActions(c.env.DB);

    const today = await countUserActionsSince(c.env.DB, oneDayAgo);

    const week = await countUserActionsSince(c.env.DB, oneWeekAgo);

    const uniqueUsersToday = await countDistinctUsersSince(c.env.DB, oneDayAgo);

    const actionsByType = await listActionsByType(c.env.DB, oneWeekAgo);

    const loginStats = await getLoginActionStats(c.env.DB, oneDayAgo);

    return c.json(success({
      total,
      today,
      week,
      uniqueUsersToday,
      actionsByType: actionsByType,
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
    const total = await countActionLogs(c.env.DB, { userId, username, action });

    const logs = await listActionLogs(c.env.DB, {
      userId,
      username,
      action,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return c.json(success({
      logs: logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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
 * 权限规则：只有超级管理员可以执行数据清理（高危操作）
 * 
 * 说明：
 * - user_sessions、email_verifications、security_lockouts 由触发器实时清理
 * - password_reset_logs、user_actions、user_security_events 需要动态配置保留天数
 */
adminRoutes.post('/cleanup', async (c) => {
  const adminUser = c.get('user') as JwtPayload;

  // 权限检查：只有超级管理员可以执行数据清理
  const isSuperAdmin = await checkIsSuperAdmin(c);
  if (!isSuperAdmin) {
    return c.json(error('FORBIDDEN', '只有超级管理员可以执行数据清理'), 403);
  }

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

    results.oldPasswordResetLogs = await deletePasswordResetLogsBefore(c.env.DB, now - passwordResetRetentionDays * CONFIG.Stats.DAY_IN_MS);

    results.oldActions = await deleteUserActionsBefore(c.env.DB, now - userActionsRetentionDays * CONFIG.Stats.DAY_IN_MS);

    results.oldSecurityEvents = await deleteSecurityEventsBefore(c.env.DB, now - securityEventRetentionDays * CONFIG.Stats.DAY_IN_MS);

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

    const total = await countAllSessions(c.env.DB);

    const activeStats = await getActiveSessionStats(c.env.DB, now);

    const recentActive = await countRecentlyActiveSessions(c.env.DB, { oneHourAgo, now });

    const todaySessions = await countSessionsSince(c.env.DB, oneDayAgo);

    const topDevices = await listDeviceDistribution(c.env.DB, now);

    return c.json(success({
      total,
      active: activeStats?.active || 0,
      uniqueUsers: activeStats?.unique_users || 0,
      recentlyActive: recentActive,
      todaySessions,
      deviceDistribution: topDevices,
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
    const filterNow = Date.now();

    const total = await countSessions(c.env.DB, { userId, status, now: filterNow });

    const sessions = await listSessions(c.env.DB, {
      userId,
      status,
      now: filterNow,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const now = Date.now();

    return c.json(success({
      sessions: sessions.map((s) => {
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
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  } catch (err) {
    console.error('Get sessions error:', err);
    return c.json(error('SERVER_ERROR', '获取会话列表失败'), 500);
  }
});

/**
 * 强制终止会话
 * DELETE /api/admin/sessions/:id
 * 
 * 权限规则：
 * - 超级管理员：可以终止任意用户的会话
 * - 管理员：只能终止普通用户的会话，不能终止管理员或超级管理员的会话
 */
adminRoutes.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const adminUser = c.get('user') as JwtPayload;

  try {
    // 获取会话信息和用户角色
    const session = await findSessionWithUserAndRole(c.env.DB, sessionId);

    if (!session) {
      return c.json(error('NOT_FOUND', '会话不存在'), 404);
    }

    // 获取当前管理员的角色级别
    const adminRole = await findUserRolePriority(c.env.DB, adminUser.userId);
    const adminPriority = adminRole?.priority || 10;
    const targetPriority = (session as any).priority || 10;

    // 权限隔离：管理员只能终止优先级低于自己的用户的会话
    if (targetPriority >= adminPriority) {
      const isSuperAdmin = await checkIsSuperAdmin(c);
      if (!isSuperAdmin) {
        return c.json(error('FORBIDDEN', '无法终止同级或更高级别用户的会话'), 403);
      }
    }

    // 不能终止自己的会话（防止误操作）
    if ((session as any).user_id === adminUser.userId) {
      return c.json(error('FORBIDDEN', '不能终止自己的会话'), 403);
    }

    await deleteSessionById(c.env.DB, sessionId);

    await logUserAction(c.env, adminUser.userId, 'admin_terminate_session', {
      sessionId,
      targetUserId: (session as any).user_id,
      targetUsername: (session as any).username,
      targetRole: (session as any).role_name,
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

    const totalEvents = await countAnalyticsEventsSince(c.env.DB, startTime);

    const eventsByType = await listAnalyticsEventsByType(c.env.DB, startTime);

    const dailyEvents = await listAnalyticsDailyEvents(c.env.DB, startTime);

    const uniqueUsers = await countAnalyticsUniqueUsers(c.env.DB, startTime);

    const uniqueSessions = await countAnalyticsUniqueSessions(c.env.DB, startTime);

    const topReferers = await listAnalyticsTopReferers(c.env.DB, startTime);

    const hourlyDistribution = await listAnalyticsHourlyDistribution(c.env.DB, startTime);

    return c.json(success({
      totalEvents,
      uniqueUsers,
      uniqueSessions,
      eventsByType: eventsByType,
      dailyEvents: dailyEvents,
      topReferers: topReferers,
      hourlyDistribution: hourlyDistribution,
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
  const days = parseInt(c.req.query('days') || '7'); // 默认查询最近7天，避免全表扫描

  try {
    const startTime = Date.now() - days * CONFIG.Stats.DAY_IN_MS;

    const total = await countAnalyticsEvents(c.env.DB, { startTime, eventType, userId });

    const events = await listAnalyticsEvents(c.env.DB, {
      startTime,
      eventType,
      userId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return c.json(success({
      events: events.map((e) => {
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
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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

    const userStats = await getDashboardUserStats(c.env.DB, { oneDayAgo, oneWeekAgo, oneMonthAgo });

    const sessionStats = await getDashboardSessionStats(c.env.DB, now);

    const actionStats = await getDashboardActionStats(c.env.DB, { oneDayAgo, oneWeekAgo });

    const analyticsStats = await getDashboardAnalyticsStats(c.env.DB, { oneDayAgo, oneWeekAgo });

    const sourceStats = await getDashboardSourceStats(c.env.DB);

    const searchStats = await getDashboardSearchStats(c.env.DB, { oneDayAgo, oneWeekAgo });

    const loginStats = await getDashboardLoginStats(c.env.DB, oneDayAgo);

    const communityStats = await getDashboardCommunityStats(c.env.DB);

    const recentActions = await listDashboardRecentActions(c.env.DB);

    const activeUsersToday = await countActiveUsersSince(c.env.DB, oneDayAgo);

    return c.json(success({
      users: {
        total: userStats?.total || 0,
        active: userStats?.active || 0,
        newToday: userStats?.new_today || 0,
        newWeek: userStats?.new_week || 0,
        newMonth: userStats?.new_month || 0,
        activeToday: activeUsersToday,
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
        posts: communityStats?.posts || 0,
        reviews: communityStats?.reviews || 0,
        pendingReports: communityStats?.pending_reports || 0,
      },
      recentActions: recentActions.map((a) => {
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

    const userRegistrations = await listUserRegistrationsByDay(c.env.DB, startTime);

    const dailyLogins = await listDailyLoginStats(c.env.DB, startTime);

    const dailySearches = await listDailySearches(c.env.DB, startTime);

    const dailyAnalytics = await listAnalyticsDailyEvents(c.env.DB, startTime);

    const dailyActiveUsers = await listDailyActiveUsers(c.env.DB, startTime);

    return c.json(success({
      userRegistrations: userRegistrations,
      dailyLogins: dailyLogins,
      dailySearches: dailySearches,
      dailyAnalytics: dailyAnalytics,
      dailyActiveUsers: dailyActiveUsers,
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

    const actionsByType = await listUserActionTypes(c.env.DB, startTime);

    const topActiveUsers = await listTopActiveUsers(c.env.DB, startTime);

    const hourlyActivity = await listHourlyActivity(c.env.DB, startTime);

    const weeklyActivity = await listWeeklyActivity(c.env.DB, startTime);

    return c.json(success({
      actionsByType: actionsByType,
      topActiveUsers: topActiveUsers,
      hourlyActivity: hourlyActivity,
      weeklyActivity: weeklyActivity,
      period: { days, startTime },
    }));
  } catch (err) {
    console.error('Get user behavior error:', err);
    return c.json(error('SERVER_ERROR', '获取用户行为分析失败'), 500);
  }
});

// ====================================================================
// 系统观测（错误监控）
// ====================================================================

/**
 * 错误统计概览
 * GET /api/admin/errors/stats?days=7
 */
adminRoutes.get('/errors/stats', async (c) => {
  const days = parseInt(c.req.query('days') || '7', 10);

  try {
    const now = Date.now();
    const startTime = now - days * CONFIG.Stats.DAY_IN_MS;

    const overall = await getSystemErrorStats(c.env.DB, {
      oneDayAgo: now - CONFIG.Stats.DAY_IN_MS,
      oneWeekAgo: now - CONFIG.Stats.WEEK_IN_MS,
      startTime,
    });

    // 按 error_type 聚合
    const byType = await listSystemErrorsByType(c.env.DB, startTime);

    // 按 fingerprint 聚合 Top 错误
    const topErrors = await listTopSystemErrors(c.env.DB, startTime);

    // 每日错误趋势
    const dailyErrors = await listDailySystemErrors(c.env.DB, startTime);

    return c.json(success({
      total: overall?.total || 0,
      frontend: overall?.frontend || 0,
      backend: overall?.backend || 0,
      today: overall?.today || 0,
      week: overall?.week || 0,
      uniqueErrors: overall?.unique_fingerprints || 0,
      byType: byType,
      topErrors: topErrors,
      dailyErrors: dailyErrors,
      period: { days, startTime },
    }));
  } catch (err) {
    console.error('Get error stats failed:', err);
    return c.json(error('SERVER_ERROR', '获取错误统计失败'), 500);
  }
});

/**
 * 错误列表（分页 + 筛选）
 * GET /api/admin/errors?page=1&pageSize=20&source=frontend&errorType=&fingerprint=
 */
adminRoutes.get('/errors', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(
    Math.max(1, parseInt(c.req.query('pageSize') || '20', 10)),
    R.PAGINATION.MAX_LOG_PAGE_SIZE,
  );
  const source = c.req.query('source');
  const errorType = c.req.query('errorType');
  const fingerprint = c.req.query('fingerprint');
  const search = c.req.query('search');

  const offset = (page - 1) * pageSize;

  try {
    const total = await countSystemErrors(c.env.DB, { source, errorType, fingerprint, search });

    const items = await listSystemErrors(c.env.DB, {
      source,
      errorType,
      fingerprint,
      search,
      limit: pageSize,
      offset,
    });

    // 关联用户名（一次查询）
    const userIds = [...new Set(items
      .map((e) => e.user_id)
      .filter((v): v is string => Boolean(v)))];

    const userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const users = await listUsernamesByIds(c.env.DB, userIds);

      for (const u of users) {
        userMap[u.id] = u.username;
      }
    }

    const enriched = items.map((e) => ({
      ...e,
      username: e.user_id ? userMap[e.user_id] || null : null,
    }));

    return c.json(success({
      errors: enriched,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  } catch (err) {
    console.error('Get error list failed:', err);
    return c.json(error('SERVER_ERROR', '获取错误列表失败'), 500);
  }
});

/**
 * 错误详情
 * GET /api/admin/errors/:id
 */
adminRoutes.get('/errors/:id', async (c) => {
  const errorId = c.req.param('id');

  try {
    const err = await findSystemErrorById(c.env.DB, errorId);

    if (!err) {
      return c.json(error('NOT_FOUND', '错误记录不存在'), 404);
    }

    let username: string | null = null;
    if (err.user_id) {
      username = await findUsernameById(c.env.DB, err.user_id);
    }

    // 同指纹的近期错误（用于看影响范围）
    const related = err.fingerprint
      ? await listRelatedSystemErrors(c.env.DB, { fingerprint: err.fingerprint, excludeId: errorId })
      : [];

    return c.json(success({
      error: { ...err, username },
      related,
    }));
  } catch (err) {
    console.error('Get error detail failed:', err);
    return c.json(error('SERVER_ERROR', '获取错误详情失败'), 500);
  }
});

/**
 * 删除错误记录（清理单个或按指纹批量）
 * DELETE /api/admin/errors/:id?byFingerprint=true
 */
adminRoutes.delete('/errors/:id', async (c) => {
  const errorId = c.req.param('id');
  const byFingerprint = c.req.query('byFingerprint') === 'true';

  try {
    if (byFingerprint) {
      // 按 fingerprint 批量删除（id 参数作为 fingerprint）
      const deleted = await deleteSystemErrorsByFingerprint(c.env.DB, errorId);
      return c.json(success({ deleted }));
    }

    await deleteSystemErrorById(c.env.DB, errorId);
    return c.json(success(null, '已删除'));
  } catch (err) {
    console.error('Delete error failed:', err);
    return c.json(error('SERVER_ERROR', '删除失败'), 500);
  }
});