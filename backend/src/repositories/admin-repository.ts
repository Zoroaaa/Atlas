/**
 * 管理后台数据访问层
 *
 * 收口 admin 路由涉及的全部 SQL：用户/角色管理、登录与行为日志、举报处理、
 * 系统统计、会话管理、分析事件、看板与趋势、错误监控等。
 * 使 admin 路由不再直接持有 SQL；需要原子性的多语句操作在此整体提供。
 *
 * 说明：本文件中「用户」相关查询刻意集中于此（而非 user-repository），
 * 以避免改动既有 repository、降低回归风险。
 */
import type { CommunityReport, Role, User, UserAction } from '@/types';

/** SQL 绑定值 */
type SqlValue = string | number | boolean | null;

/** 通用结果行 */
type Row = Record<string, unknown>;

// ===========================================================================
// 角色管理
// ===========================================================================

/** 查询全部角色（按优先级倒序） */
export async function listRoles(db: D1Database): Promise<Role[]> {
  const rows = await db.prepare('SELECT * FROM roles ORDER BY priority DESC').all<Role>();
  return rows.results || [];
}

/** 按 id 查询角色 */
export async function findRoleById(db: D1Database, roleId: string): Promise<Role | null> {
  return db.prepare('SELECT * FROM roles WHERE id = ?').bind(roleId).first<Role>();
}

// ===========================================================================
// 用户统计与列表
// ===========================================================================

/** 用户概览统计行 */
export interface UserStatsRow {
  total: number;
  active: number;
  inactive: number;
  verified: number;
  new_today: number;
  new_week: number;
  new_month: number;
}

/** 用户概览统计（总量 / 活跃 / 验证 / 新增） */
export async function getUserStats(
  db: D1Database,
  opts: { oneDayAgo: number; oneWeekAgo: number; oneMonthAgo: number }
): Promise<UserStatsRow | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_week,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_month
      FROM users`
    )
    .bind(opts.oneDayAgo, opts.oneWeekAgo, opts.oneMonthAgo)
    .first<UserStatsRow>();
}

/** 统计自某时刻起有会话活跃的去重用户数 */
export async function countActiveUsersSince(db: D1Database, since: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE last_activity > ?')
    .bind(since)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 角色用户分布（角色名 → 用户数） */
export async function listRoleUserDistribution(
  db: D1Database
): Promise<Array<{ display_name: string; count: number }>> {
  const rows = await db
    .prepare(
      `SELECT r.display_name, COUNT(u.id) as count
       FROM roles r
       LEFT JOIN users u ON r.id = u.role_id
       GROUP BY r.id
       ORDER BY count DESC`
    )
    .all<{ display_name: string; count: number }>();
  return rows.results || [];
}

/** 用户列表行（含角色名） */
export type AdminUserListRow = User & { role_name?: string; role_display_name?: string };

/** 用户列表过滤条件 */
function userListFilter(opts: { search?: string; status?: string; roleId?: string }): {
  clause: string;
  params: SqlValue[];
} {
  let clause = 'WHERE 1=1';
  const params: SqlValue[] = [];

  if (opts.search) {
    clause += ' AND (u.username LIKE ? OR u.email LIKE ?)';
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  if (opts.status === 'active') {
    clause += ' AND u.is_active = 1';
  } else if (opts.status === 'inactive') {
    clause += ' AND u.is_active = 0';
  }
  if (opts.roleId) {
    clause += ' AND u.role_id = ?';
    params.push(opts.roleId);
  }
  return { clause, params };
}

/** 统计用户总数（按搜索 / 状态 / 角色过滤） */
export async function countUsers(
  db: D1Database,
  opts: { search?: string; status?: string; roleId?: string }
): Promise<number> {
  const { clause, params } = userListFilter(opts);
  const row = await db
    .prepare(`SELECT COUNT(*) as total FROM users u ${clause}`)
    .bind(...params)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询用户列表（含角色名，按创建时间倒序） */
export async function listUsers(
  db: D1Database,
  opts: { search?: string; status?: string; roleId?: string; limit: number; offset: number }
): Promise<AdminUserListRow[]> {
  const { clause, params } = userListFilter(opts);
  const rows = await db
    .prepare(
      `SELECT u.id, u.username, u.email, u.is_active, u.email_verified, u.login_count, 
              u.created_at, u.last_login, u.permissions, u.role_id,
              r.name as role_name, r.display_name as role_display_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       ${clause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, opts.limit, opts.offset)
    .all<AdminUserListRow>();
  return rows.results || [];
}

/** 用户详情行（含角色信息） */
export type AdminUserWithRole = User & {
  role_name?: string | null;
  role_display_name?: string | null;
  role_permissions?: string | null;
};

/** 按 id 查询用户详情（含角色名与角色权限） */
export async function findUserDetailById(db: D1Database, userId: string): Promise<AdminUserWithRole | null> {
  return db
    .prepare(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name, r.permissions as role_permissions
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`
    )
    .bind(userId)
    .first<AdminUserWithRole>();
}

/** 查询用户最近会话（最多 10 条，按活跃时间倒序） */
export async function listUserRecentSessions(db: D1Database, userId: string): Promise<Row[]> {
  const rows = await db
    .prepare(
      'SELECT id, ip_address, user_agent, created_at, last_activity, expires_at FROM user_sessions WHERE user_id = ? ORDER BY last_activity DESC LIMIT 10'
    )
    .bind(userId)
    .all();
  return rows.results || [];
}

/** 统计用户收藏数 */
export async function countUserFavorites(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM user_favorites WHERE user_id = ?')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 统计用户搜索历史数 */
export async function countUserSearchHistory(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM user_search_history WHERE user_id = ?')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 查询用户近期关键行为（登录/搜索/收藏，最多 20 条） */
export async function listUserRecentActions(
  db: D1Database,
  userId: string
): Promise<Array<{ action: string; created_at: number }>> {
  const rows = await db
    .prepare(
      `SELECT action, created_at FROM user_actions 
       WHERE user_id = ? AND action IN ('login', 'login_failed', 'search', 'favorite')
       ORDER BY created_at DESC LIMIT 20`
    )
    .bind(userId)
    .all<{ action: string; created_at: number }>();
  return rows.results || [];
}

// ===========================================================================
// 用户角色 / 状态 / 权限维护
// ===========================================================================

/** 用户角色引用（用于角色变更） */
export type UserRoleRef = { id: string; username: string; role_id?: string };

/** 查询用户角色引用（id / username / role_id） */
export async function findUserRoleRef(db: D1Database, userId: string): Promise<UserRoleRef | null> {
  return db
    .prepare('SELECT id, username, role_id FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRoleRef>();
}

/** 更新用户角色 */
export async function updateUserRole(
  db: D1Database,
  opts: { userId: string; roleId: string; now: number }
): Promise<void> {
  await db
    .prepare('UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?')
    .bind(opts.roleId, opts.now, opts.userId)
    .run();
}

/** 删除某用户全部会话（强制重新登录） */
export async function deleteUserSessions(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(userId).run();
}

/** 查询用户基础身份（id / username） */
export async function findUserIdentity(
  db: D1Database,
  userId: string
): Promise<{ id: string; username: string } | null> {
  return db.prepare('SELECT id, username FROM users WHERE id = ?').bind(userId).first<{ id: string; username: string }>();
}

/** 更新用户启用状态 */
export async function updateUserStatus(
  db: D1Database,
  opts: { userId: string; isActive: boolean; now: number }
): Promise<void> {
  await db
    .prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
    .bind(opts.isActive ? 1 : 0, opts.now, opts.userId)
    .run();
}

/** 更新用户权限（JSON 串） */
export async function updateUserPermissions(
  db: D1Database,
  opts: { userId: string; permissions: string; now: number }
): Promise<void> {
  await db
    .prepare('UPDATE users SET permissions = ?, updated_at = ? WHERE id = ?')
    .bind(opts.permissions, opts.now, opts.userId)
    .run();
}

/** 查询用户的角色名与优先级（用于权限隔离判断） */
export async function findUserRolePriority(
  db: D1Database,
  userId: string
): Promise<{ role_name: string; priority: number } | null> {
  return db
    .prepare('SELECT r.name as role_name, r.priority FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?')
    .bind(userId)
    .first<{ role_name: string; priority: number }>();
}

/** 查询目标用户的角色与优先级信息 */
export async function findUserRoleAndPriority(
  db: D1Database,
  userId: string
): Promise<(User & { role_name: string; priority: number }) | null> {
  return db
    .prepare(
      'SELECT u.id, u.username, u.role_id, r.name as role_name, r.priority FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?'
    )
    .bind(userId)
    .first<User & { role_name: string; priority: number }>();
}

// ===========================================================================
// 登录日志 / 活跃用户 / 活跃排名
// ===========================================================================

/** 统计用户登录相关行为数（login / login_failed） */
export async function countUserLoginActions(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as total FROM user_actions WHERE user_id = ? AND action IN ('login', 'login_failed')")
    .bind(userId)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询用户登录日志（按创建时间倒序） */
export async function listUserLoginLogs(
  db: D1Database,
  opts: { userId: string; limit: number; offset: number }
): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT id, action, data, ip_address, user_agent, created_at 
       FROM user_actions 
       WHERE user_id = ? AND action IN ('login', 'login_failed')
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`
    )
    .bind(opts.userId, opts.limit, opts.offset)
    .all();
  return rows.results || [];
}

/** 查询活跃用户排行（按窗口内登录数排序） */
export async function listActiveUsers(
  db: D1Database,
  opts: { startTime: number; limit: number }
): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT u.id, u.username, u.email, u.role_id, u.login_count,
             r.display_name as role_display_name,
             COUNT(DISTINCT CASE WHEN a.action = 'login' THEN a.id END) as recent_logins,
             COUNT(DISTINCT CASE WHEN a.action = 'search' THEN a.id END) as recent_searches
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN user_actions a ON u.id = a.user_id AND a.created_at >= ?
       WHERE u.is_active = 1
       GROUP BY u.id
       ORDER BY recent_logins DESC, u.login_count DESC
       LIMIT ?`
    )
    .bind(opts.startTime, opts.limit)
    .all();
  return rows.results || [];
}

/** 活跃排名聚合行 */
export interface ActivityRankingRow {
  id: string;
  username: string;
  email: string;
  is_active: number;
  last_login: number | null;
  role_display_name: string | null;
  searches: number;
  logins: number;
  favorites: number;
  other_actions: number;
  last_active_at: number;
}

/** 行为日志中不计入「其他行为」的类型 */
const EXCLUDED_ACTIONS = "('login', 'login_failed', 'logout', 'register', 'token_refresh', 'add_favorite', 'remove_favorite', 'search')";

/** 查询活跃排名原始聚合数据（搜索/登录/收藏/其他行为） */
export async function queryActivityRanking(
  db: D1Database,
  opts: { startTime: number }
): Promise<ActivityRankingRow[]> {
  const rows = await db
    .prepare(
      `WITH search_counts AS (
        SELECT user_id, COUNT(*) AS searches, MAX(created_at) AS last_search_at
        FROM user_search_history
        WHERE created_at >= ? AND user_id IS NOT NULL
        GROUP BY user_id
      ),
      action_counts AS (
        SELECT user_id,
          SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) AS logins,
          SUM(CASE WHEN action = 'add_favorite' THEN 1 ELSE 0 END) AS favorites,
          SUM(CASE WHEN action NOT IN ${EXCLUDED_ACTIONS} THEN 1 ELSE 0 END) AS other_actions,
          MAX(created_at) AS last_action_at
        FROM user_actions
        WHERE created_at >= ? AND user_id IS NOT NULL
        GROUP BY user_id
      )
      SELECT u.id, u.username, u.email, u.is_active, u.last_login,
             r.display_name AS role_display_name,
             COALESCE(sc.searches, 0) AS searches,
             COALESCE(ac.logins, 0) AS logins,
             COALESCE(ac.favorites, 0) AS favorites,
             COALESCE(ac.other_actions, 0) AS other_actions,
             MAX(COALESCE(sc.last_search_at, 0), COALESCE(ac.last_action_at, 0)) AS last_active_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN search_counts sc ON sc.user_id = u.id
      LEFT JOIN action_counts ac ON ac.user_id = u.id
      WHERE COALESCE(sc.searches, 0) + COALESCE(ac.logins, 0) + COALESCE(ac.favorites, 0) + COALESCE(ac.other_actions, 0) > 0`
    )
    .bind(opts.startTime, opts.startTime)
    .all<ActivityRankingRow>();
  return rows.results || [];
}

/** 登录日志按天统计（成功/失败/去重用户） */
export async function listLoginDailyStats(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT 
        date(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as total,
        SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN action = 'login_failed' THEN 1 ELSE 0 END) as failed,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_actions
      WHERE created_at >= ? AND action IN ('login', 'login_failed')
      GROUP BY date(created_at / 1000, 'unixepoch')
      ORDER BY date DESC`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 登录成功来源 IP Top 排行 */
export async function listLoginTopIPs(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT ip_address, COUNT(*) as count
      FROM user_actions
      WHERE created_at >= ? AND action = 'login' AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY count DESC
      LIMIT 10`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 登录失败来源 IP Top 排行 */
export async function listLoginFailedAttempts(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT ip_address, COUNT(*) as count
      FROM user_actions
      WHERE created_at >= ? AND action = 'login_failed' AND ip_address IS NOT NULL
      GROUP BY ip_address
      ORDER BY count DESC
      LIMIT 10`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

// ===========================================================================
// 举报处理
// ===========================================================================

/** 统计某状态的举报数 */
export async function countReportsByStatus(db: D1Database, status: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as total FROM community_reports WHERE status = ?')
    .bind(status)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询举报列表（含帖子与举报人信息） */
export async function listReportsByStatus(
  db: D1Database,
  opts: { status: string; limit: number; offset: number }
): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT r.*,
              p.title, p.post_type,
              u.username as reporter_username
       FROM community_reports r
       LEFT JOIN community_posts p ON r.post_id = p.id
       LEFT JOIN users u ON r.reporter_user_id = u.id
       WHERE r.status = ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(opts.status, opts.limit, opts.offset)
    .all();
  return rows.results || [];
}

/** 按 id 查询举报 */
export async function findReportById(db: D1Database, reportId: string): Promise<CommunityReport | null> {
  return db.prepare('SELECT * FROM community_reports WHERE id = ?').bind(reportId).first<CommunityReport>();
}

/** 更新举报处理结果 */
export async function updateReportHandling(
  db: D1Database,
  opts: {
    reportId: string;
    status: string;
    adminUserId: string;
    action: string | null;
    notes: string | null;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE community_reports
      SET status = ?, admin_user_id = ?, admin_action = ?, admin_notes = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?`
    )
    .bind(opts.status, opts.adminUserId, opts.action, opts.notes, opts.now, opts.now, opts.reportId)
    .run();
}

/** 隐藏帖子（举报处理为移除来源时） */
export async function hidePost(db: D1Database, opts: { postId: string; now: number }): Promise<void> {
  await db
    .prepare("UPDATE community_posts SET status = 'hidden', updated_at = ? WHERE id = ?")
    .bind(opts.now, opts.postId)
    .run();
}

// ===========================================================================
// 系统统计
// ===========================================================================

/** 系统用户统计行（本周新增） */
export interface SystemUserStatsRow {
  total: number;
  active: number;
  verified: number;
  new_this_week: number;
}

/** 系统用户统计（总量 / 活跃 / 验证 / 本周新增） */
export async function getSystemUserStats(db: D1Database, weekAgo: number): Promise<SystemUserStatsRow | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_this_week
      FROM users`
    )
    .bind(weekAgo)
    .first<SystemUserStatsRow>();
}

/** 各角色用户数统计（按优先级倒序） */
export async function listRoleStats(db: D1Database): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT r.id, r.name, r.display_name, COUNT(u.id) as user_count
      FROM roles r
      LEFT JOIN users u ON r.id = u.role_id
      GROUP BY r.id
      ORDER BY r.priority DESC`
    )
    .all();
  return rows.results || [];
}

/** 搜索源统计行 */
export interface SourceStatsRow {
  total: number;
  active: number;
  searchable: number;
  total_usage: number;
}

/** 搜索源统计（总量 / 活跃 / 可搜索 / 总使用量） */
export async function getSourceStats(db: D1Database): Promise<SourceStatsRow | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN searchable = 1 THEN 1 ELSE 0 END) as searchable,
        SUM(usage_count) as total_usage
      FROM search_sources`
    )
    .first<SourceStatsRow>();
}

/** 搜索历史统计行 */
export interface SearchHistoryStatsRow {
  total: number;
  unique_users: number;
  unique_keywords: number;
}

/** 搜索历史统计（总量 / 去重用户 / 去重关键词） */
export async function getSearchHistoryStats(db: D1Database): Promise<SearchHistoryStatsRow | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT query) as unique_keywords
      FROM user_search_history`
    )
    .first<SearchHistoryStatsRow>();
}

/** 社区概要统计行（帖子 / 标签 / 评论 / 待处理举报） */
export interface CommunitySummaryStatsRow {
  posts: number;
  tags: number;
  reviews: number;
  pending_reports: number;
}

/** 社区概要统计（帖子 / 标签 / 评论 / 待处理举报） */
export async function getCommunitySummaryStats(db: D1Database): Promise<CommunitySummaryStatsRow | null> {
  return db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM community_posts WHERE status = 'active') as posts,
        (SELECT COUNT(*) FROM community_tags WHERE tag_active = 1) as tags,
        (SELECT COUNT(*) FROM community_comments) as reviews,
        (SELECT COUNT(*) FROM community_reports WHERE status = 'pending') as pending_reports`
    )
    .first<CommunitySummaryStatsRow>();
}

/** 热门搜索关键词 Top 10（自某时刻起） */
export async function listTopSearchKeywords(db: D1Database, since: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT query, COUNT(*) as count
      FROM user_search_history
      WHERE created_at > ?
      GROUP BY query
      ORDER BY count DESC
      LIMIT 10`
    )
    .bind(since)
    .all();
  return rows.results || [];
}

/** 使用量最高的搜索源 Top 10 */
export async function listTopUsedSources(db: D1Database): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT name, usage_count
      FROM search_sources
      WHERE is_active = 1
      ORDER BY usage_count DESC
      LIMIT 10`
    )
    .all();
  return rows.results || [];
}

// ===========================================================================
// 行为日志统计与列表
// ===========================================================================

/** 行为日志总数 */
export async function countUserActions(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) as total FROM user_actions').first<{ total: number }>();
  return row?.total || 0;
}

/** 统计自某时刻起的行为日志数 */
export async function countUserActionsSince(db: D1Database, since: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM user_actions WHERE created_at > ?')
    .bind(since)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 统计自某时刻起行为日志涉及的去重用户数 */
export async function countDistinctUsersSince(db: D1Database, since: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(DISTINCT user_id) as count FROM user_actions WHERE created_at > ? AND user_id IS NOT NULL')
    .bind(since)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 行为类型分布（自某时刻起，按次数倒序 Top 10） */
export async function listActionsByType(
  db: D1Database,
  since: number
): Promise<Array<{ action: string; count: number }>> {
  const rows = await db
    .prepare(
      `SELECT action, COUNT(*) as count
      FROM user_actions
      WHERE created_at > ?
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10`
    )
    .bind(since)
    .all<{ action: string; count: number }>();
  return rows.results || [];
}

/** 登录行为统计（成功 / 失败，自某时刻起） */
export async function getLoginActionStats(
  db: D1Database,
  since: number
): Promise<{ success: number; failed: number } | null> {
  return db
    .prepare(
      `SELECT 
        SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN action = 'login_failed' THEN 1 ELSE 0 END) as failed
      FROM user_actions
      WHERE action IN ('login', 'login_failed') AND created_at > ?`
    )
    .bind(since)
    .first<{ success: number; failed: number }>();
}

/** 行为日志行（含用户名） */
export type ActionLogRow = UserAction & { username: string | null };

/** 行为日志过滤条件 */
function actionLogFilter(opts: { userId?: string; username?: string; action?: string }): {
  clause: string;
  params: SqlValue[];
} {
  const conditions: string[] = [];
  const params: SqlValue[] = [];

  if (opts.userId) {
    conditions.push('a.user_id = ?');
    params.push(opts.userId);
  }
  if (opts.username) {
    conditions.push('u.username LIKE ?');
    params.push(`%${opts.username}%`);
  }
  if (opts.action) {
    const actions = opts.action.split(',').map(a => a.trim()).filter(Boolean);
    if (actions.length > 0) {
      conditions.push(`a.action IN (${actions.map(() => '?').join(', ')})`);
      params.push(...actions);
    }
  }
  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
}

/** 统计行为日志总数（按用户 / 用户名 / 动作过滤） */
export async function countActionLogs(
  db: D1Database,
  opts: { userId?: string; username?: string; action?: string }
): Promise<number> {
  const { clause, params } = actionLogFilter(opts);
  const row = await db
    .prepare(`SELECT COUNT(*) as total FROM user_actions a LEFT JOIN users u ON a.user_id = u.id ${clause}`)
    .bind(...params)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询行为日志（含用户名，按创建时间倒序） */
export async function listActionLogs(
  db: D1Database,
  opts: { userId?: string; username?: string; action?: string; limit: number; offset: number }
): Promise<ActionLogRow[]> {
  const { clause, params } = actionLogFilter(opts);
  const rows = await db
    .prepare(
      `SELECT a.*, u.username
      FROM user_actions a
      LEFT JOIN users u ON a.user_id = u.id
      ${clause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?`
    )
    .bind(...params, opts.limit, opts.offset)
    .all<ActionLogRow>();
  return rows.results || [];
}

// ===========================================================================
// 数据清理
// ===========================================================================

/** 删除过期的密码重置日志，返回删除条数 */
export async function deletePasswordResetLogsBefore(db: D1Database, before: number): Promise<number> {
  const result = await db.prepare('DELETE FROM password_reset_logs WHERE created_at < ?').bind(before).run();
  return result.meta.changes || 0;
}

/** 删除过期的行为日志，返回删除条数 */
export async function deleteUserActionsBefore(db: D1Database, before: number): Promise<number> {
  const result = await db.prepare('DELETE FROM user_actions WHERE created_at < ?').bind(before).run();
  return result.meta.changes || 0;
}

/** 删除过期的安全事件，返回删除条数 */
export async function deleteSecurityEventsBefore(db: D1Database, before: number): Promise<number> {
  const result = await db.prepare('DELETE FROM user_security_events WHERE created_at < ?').bind(before).run();
  return result.meta.changes || 0;
}

// ===========================================================================
// 会话管理
// ===========================================================================

/** 会话总数 */
export async function countAllSessions(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) as total FROM user_sessions').first<{ total: number }>();
  return row?.total || 0;
}

/** 活跃会话统计（未过期会话数与去重用户数） */
export async function getActiveSessionStats(
  db: D1Database,
  now: number
): Promise<{ active: number; unique_users: number } | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as active,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_sessions
      WHERE expires_at > ?`
    )
    .bind(now)
    .first<{ active: number; unique_users: number }>();
}

/** 统计最近活跃且未过期的会话数 */
export async function countRecentlyActiveSessions(
  db: D1Database,
  opts: { oneHourAgo: number; now: number }
): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM user_sessions WHERE last_activity > ? AND expires_at > ?')
    .bind(opts.oneHourAgo, opts.now)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 统计自某时刻起创建的会话数 */
export async function countSessionsSince(db: D1Database, since: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM user_sessions WHERE created_at > ?')
    .bind(since)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 活跃会话设备类型分布 */
export async function listDeviceDistribution(
  db: D1Database,
  now: number
): Promise<Array<{ device_type: string; count: number }>> {
  const rows = await db
    .prepare(
      `SELECT 
        CASE 
          WHEN user_agent LIKE '%Mobile%' THEN 'Mobile'
          WHEN user_agent LIKE '%Tablet%' THEN 'Tablet'
          ELSE 'Desktop'
        END as device_type,
        COUNT(*) as count
      FROM user_sessions
      WHERE expires_at > ?
      GROUP BY device_type
      ORDER BY count DESC`
    )
    .bind(now)
    .all<{ device_type: string; count: number }>();
  return rows.results || [];
}

/** 会话列表过滤条件 */
function sessionListFilter(opts: { userId?: string; status?: string; now: number }): {
  clause: string;
  params: SqlValue[];
} {
  let clause = 'WHERE 1=1';
  const params: SqlValue[] = [];

  if (opts.userId) {
    clause += ' AND s.user_id = ?';
    params.push(opts.userId);
  }
  if (opts.status === 'active') {
    clause += ' AND s.expires_at > ?';
    params.push(opts.now);
  } else if (opts.status === 'expired') {
    clause += ' AND s.expires_at <= ?';
    params.push(opts.now);
  }
  return { clause, params };
}

/** 统计会话总数（按用户 / 状态过滤） */
export async function countSessions(
  db: D1Database,
  opts: { userId?: string; status?: string; now: number }
): Promise<number> {
  const { clause, params } = sessionListFilter(opts);
  const row = await db
    .prepare(`SELECT COUNT(*) as total FROM user_sessions s ${clause}`)
    .bind(...params)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询会话列表（含用户名 / 邮箱，按活跃时间倒序） */
export async function listSessions(
  db: D1Database,
  opts: { userId?: string; status?: string; now: number; limit: number; offset: number }
): Promise<Row[]> {
  const { clause, params } = sessionListFilter(opts);
  const rows = await db
    .prepare(
      `SELECT s.*, u.username, u.email
      FROM user_sessions s
      LEFT JOIN users u ON s.user_id = u.id
      ${clause}
      ORDER BY s.last_activity DESC
      LIMIT ? OFFSET ?`
    )
    .bind(...params, opts.limit, opts.offset)
    .all();
  return rows.results || [];
}

/** 按 id 查询会话（含用户与角色信息） */
export async function findSessionWithUserAndRole(db: D1Database, sessionId: string): Promise<Row | null> {
  return db
    .prepare(
      `SELECT s.*, u.username, r.name as role_name, r.priority
      FROM user_sessions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE s.id = ?`
    )
    .bind(sessionId)
    .first();
}

/** 按 id 删除会话 */
export async function deleteSessionById(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM user_sessions WHERE id = ?').bind(sessionId).run();
}

// ===========================================================================
// 分析事件
// ===========================================================================

/** 统计自某时刻起的分析事件数 */
export async function countAnalyticsEventsSince(db: D1Database, startTime: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM analytics_events WHERE created_at > ?')
    .bind(startTime)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 分析事件类型分布（自某时刻起） */
export async function listAnalyticsEventsByType(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT event_type, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ?
      GROUP BY event_type
      ORDER BY count DESC`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 分析事件按天趋势（自某时刻起） */
export async function listAnalyticsDailyEvents(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 统计分析事件去重用户数（自某时刻起） */
export async function countAnalyticsUniqueUsers(db: D1Database, startTime: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(DISTINCT user_id) as count FROM analytics_events WHERE created_at > ? AND user_id IS NOT NULL')
    .bind(startTime)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 统计分析事件去重会话数（自某时刻起） */
export async function countAnalyticsUniqueSessions(db: D1Database, startTime: number): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COUNT(DISTINCT session_id) as count FROM analytics_events WHERE created_at > ? AND session_id IS NOT NULL'
    )
    .bind(startTime)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 分析事件来源 Top 10（自某时刻起） */
export async function listAnalyticsTopReferers(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT referer, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ? AND referer IS NOT NULL
      GROUP BY referer
      ORDER BY count DESC
      LIMIT 10`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 分析事件按小时分布（自某时刻起） */
export async function listAnalyticsHourlyDistribution(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT strftime('%H', datetime(created_at / 1000, 'unixepoch')) as hour, COUNT(*) as count
      FROM analytics_events
      WHERE created_at > ?
      GROUP BY hour
      ORDER BY hour`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 分析事件过滤条件 */
function analyticsEventFilter(opts: { startTime: number; eventType?: string; userId?: string }): {
  clause: string;
  params: SqlValue[];
} {
  let clause = 'WHERE e.created_at > ?';
  const params: SqlValue[] = [opts.startTime];

  if (opts.eventType) {
    clause += ' AND e.event_type = ?';
    params.push(opts.eventType);
  }
  if (opts.userId) {
    clause += ' AND e.user_id = ?';
    params.push(opts.userId);
  }
  return { clause, params };
}

/** 统计分析事件总数（按类型 / 用户过滤） */
export async function countAnalyticsEvents(
  db: D1Database,
  opts: { startTime: number; eventType?: string; userId?: string }
): Promise<number> {
  const { clause, params } = analyticsEventFilter(opts);
  const row = await db
    .prepare(`SELECT COUNT(*) as total FROM analytics_events e ${clause}`)
    .bind(...params)
    .first<{ total: number }>();
  return row?.total || 0;
}

/** 分页查询分析事件列表（含用户名，按创建时间倒序） */
export async function listAnalyticsEvents(
  db: D1Database,
  opts: { startTime: number; eventType?: string; userId?: string; limit: number; offset: number }
): Promise<Row[]> {
  const { clause, params } = analyticsEventFilter(opts);
  const rows = await db
    .prepare(
      `SELECT e.*, u.username
      FROM analytics_events e
      LEFT JOIN users u ON e.user_id = u.id
      ${clause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?`
    )
    .bind(...params, opts.limit, opts.offset)
    .all();
  return rows.results || [];
}

// ===========================================================================
// 看板概览
// ===========================================================================

/** 看板用户统计行 */
export interface DashboardUserStatsRow {
  total: number;
  active: number;
  new_today: number;
  new_week: number;
  new_month: number;
}

/** 看板用户统计（总量 / 活跃 / 新增） */
export async function getDashboardUserStats(
  db: D1Database,
  opts: { oneDayAgo: number; oneWeekAgo: number; oneMonthAgo: number }
): Promise<DashboardUserStatsRow | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_week,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as new_month
      FROM users`
    )
    .bind(opts.oneDayAgo, opts.oneWeekAgo, opts.oneMonthAgo)
    .first<DashboardUserStatsRow>();
}

/** 看板会话统计（总量 / 活跃 / 去重用户） */
export async function getDashboardSessionStats(
  db: D1Database,
  now: number
): Promise<{ total: number; active: number; unique_users: number } | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN expires_at > ? THEN 1 ELSE 0 END) as active,
        COUNT(DISTINCT user_id) as unique_users
      FROM user_sessions`
    )
    .bind(now)
    .first<{ total: number; active: number; unique_users: number }>();
}

/** 看板行为统计（总量 / 去重用户 / 今日 / 本周） */
export async function getDashboardActionStats(
  db: D1Database,
  opts: { oneDayAgo: number; oneWeekAgo: number }
): Promise<{ total: number; unique_users: number; today: number; week: number } | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as week
      FROM user_actions`
    )
    .bind(opts.oneDayAgo, opts.oneWeekAgo)
    .first<{ total: number; unique_users: number; today: number; week: number }>();
}

/** 看板分析统计（总量 / 去重用户 / 去重会话 / 今日 / 本周） */
export async function getDashboardAnalyticsStats(
  db: D1Database,
  opts: { oneDayAgo: number; oneWeekAgo: number }
): Promise<{ total: number; unique_users: number; unique_sessions: number; today: number; week: number } | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT session_id) as unique_sessions,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as week
      FROM analytics_events`
    )
    .bind(opts.oneDayAgo, opts.oneWeekAgo)
    .first<{ total: number; unique_users: number; unique_sessions: number; today: number; week: number }>();
}

/** 看板搜索源统计（总量 / 活跃 / 总使用量） */
export async function getDashboardSourceStats(
  db: D1Database
): Promise<{ total: number; active: number; total_usage: number } | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(usage_count) as total_usage
      FROM search_sources`
    )
    .first<{ total: number; active: number; total_usage: number }>();
}

/** 看板搜索统计（总量 / 去重用户 / 今日 / 本周） */
export async function getDashboardSearchStats(
  db: D1Database,
  opts: { oneDayAgo: number; oneWeekAgo: number }
): Promise<{ total: number; unique_users: number; today: number; week: number } | null> {
  return db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as week
      FROM user_search_history`
    )
    .bind(opts.oneDayAgo, opts.oneWeekAgo)
    .first<{ total: number; unique_users: number; today: number; week: number }>();
}

/** 看板登录统计（今日成功 / 失败） */
export async function getDashboardLoginStats(
  db: D1Database,
  oneDayAgo: number
): Promise<{ success: number; failed: number } | null> {
  return db
    .prepare(
      `SELECT 
        SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN action = 'login_failed' THEN 1 ELSE 0 END) as failed
      FROM user_actions
      WHERE action IN ('login', 'login_failed') AND created_at > ?`
    )
    .bind(oneDayAgo)
    .first<{ success: number; failed: number }>();
}

/** 看板社区统计（帖子 / 评论 / 待处理举报） */
export async function getDashboardCommunityStats(
  db: D1Database
): Promise<{ posts: number; reviews: number; pending_reports: number } | null> {
  return db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM community_posts WHERE status = 'active') as posts,
        (SELECT COUNT(*) FROM community_comments) as reviews,
        (SELECT COUNT(*) FROM community_reports WHERE status = 'pending') as pending_reports`
    )
    .first<{ posts: number; reviews: number; pending_reports: number }>();
}

/** 看板最近行为动态（含用户名，最多 20 条） */
export async function listDashboardRecentActions(db: D1Database): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT a.action, a.data, a.created_at, u.username
      FROM user_actions a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 20`
    )
    .all();
  return rows.results || [];
}

// ===========================================================================
// 趋势 / 用户行为
// ===========================================================================

/** 用户注册按天趋势 */
export async function listUserRegistrationsByDay(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM users
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 登录按天趋势（总量 / 成功 / 失败） */
export async function listDailyLoginStats(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT 
        date(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as total,
        SUM(CASE WHEN action = 'login' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN action = 'login_failed' THEN 1 ELSE 0 END) as failed
      FROM user_actions
      WHERE created_at > ? AND action IN ('login', 'login_failed')
      GROUP BY date
      ORDER BY date`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 搜索按天趋势 */
export async function listDailySearches(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM user_search_history
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 活跃用户按天趋势（去重用户数） */
export async function listDailyActiveUsers(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT date(last_activity / 1000, 'unixepoch') as date, COUNT(DISTINCT user_id) as count
      FROM user_sessions
      WHERE last_activity > ?
      GROUP BY date
      ORDER BY date`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 用户行为类型分布（自某时刻起，无条数上限） */
export async function listUserActionTypes(
  db: D1Database,
  startTime: number
): Promise<Array<{ action: string; count: number }>> {
  const rows = await db
    .prepare(
      `SELECT action, COUNT(*) as count
      FROM user_actions
      WHERE created_at > ?
      GROUP BY action
      ORDER BY count DESC`
    )
    .bind(startTime)
    .all<{ action: string; count: number }>();
  return rows.results || [];
}

/** 最活跃用户 Top 20（自某时刻起） */
export async function listTopActiveUsers(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT u.id, u.username, u.email, COUNT(a.id) as action_count
      FROM users u
      LEFT JOIN user_actions a ON u.id = a.user_id AND a.created_at > ?
      GROUP BY u.id
      ORDER BY action_count DESC
      LIMIT 20`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 用户行为按小时分布 */
export async function listHourlyActivity(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT strftime('%H', datetime(created_at / 1000, 'unixepoch')) as hour, COUNT(*) as count
      FROM user_actions
      WHERE created_at > ?
      GROUP BY hour
      ORDER BY hour`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 用户行为按星期分布 */
export async function listWeeklyActivity(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT strftime('%w', datetime(created_at / 1000, 'unixepoch')) as weekday, COUNT(*) as count
      FROM user_actions
      WHERE created_at > ?
      GROUP BY weekday
      ORDER BY weekday`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

// ===========================================================================
// 错误监控
// ===========================================================================

/** 错误总体统计行 */
export interface SystemErrorStatsRow {
  total: number;
  frontend: number;
  backend: number;
  today: number;
  week: number;
  unique_fingerprints: number;
}

/** 错误总体统计 */
export async function getSystemErrorStats(
  db: D1Database,
  opts: { oneDayAgo: number; oneWeekAgo: number; startTime: number }
): Promise<SystemErrorStatsRow | null> {
  return db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN source = 'frontend' THEN 1 ELSE 0 END) as frontend,
        SUM(CASE WHEN source = 'backend' THEN 1 ELSE 0 END) as backend,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as week,
        COUNT(DISTINCT fingerprint) as unique_fingerprints
      FROM system_errors
      WHERE created_at > ?`
    )
    .bind(opts.oneDayAgo, opts.oneWeekAgo, opts.startTime)
    .first<SystemErrorStatsRow>();
}

/** 错误按类型分布 Top 20 */
export async function listSystemErrorsByType(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT error_type, COUNT(*) as count
      FROM system_errors
      WHERE created_at > ?
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 20`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 按指纹聚合的 Top 错误 */
export async function listTopSystemErrors(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT
        fingerprint,
        MIN(message) as message,
        MIN(error_type) as error_type,
        MIN(source) as source,
        MIN(url) as url,
        COUNT(*) as count,
        MAX(created_at) as last_seen,
        MIN(created_at) as first_seen
      FROM system_errors
      WHERE created_at > ?
      GROUP BY fingerprint
      ORDER BY count DESC
      LIMIT 10`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 错误按天趋势 */
export async function listDailySystemErrors(db: D1Database, startTime: number): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM system_errors
      WHERE created_at > ?
      GROUP BY date
      ORDER BY date`
    )
    .bind(startTime)
    .all();
  return rows.results || [];
}

/** 错误记录行 */
export interface SystemErrorRow {
  id: number;
  source: string;
  error_type: string;
  message: string;
  stack: string | null;
  url: string | null;
  line_number: number | null;
  column_number: number | null;
  user_id: string | null;
  session_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  fingerprint: string;
  created_at: string;
}

/** 错误列表过滤条件 */
function systemErrorFilter(opts: {
  source?: string;
  errorType?: string;
  fingerprint?: string;
  search?: string;
}): { clause: string; params: SqlValue[] } {
  const conditions: string[] = [];
  const params: SqlValue[] = [];

  if (opts.source === 'frontend' || opts.source === 'backend') {
    conditions.push('source = ?');
    params.push(opts.source);
  }
  if (opts.errorType) {
    conditions.push('error_type = ?');
    params.push(opts.errorType);
  }
  if (opts.fingerprint) {
    conditions.push('fingerprint = ?');
    params.push(opts.fingerprint);
  }
  if (opts.search) {
    conditions.push('(message LIKE ? OR stack LIKE ? OR url LIKE ?)');
    params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`);
  }
  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
}

/** 统计错误总数（按来源 / 类型 / 指纹 / 关键词过滤） */
export async function countSystemErrors(
  db: D1Database,
  opts: { source?: string; errorType?: string; fingerprint?: string; search?: string }
): Promise<number> {
  const { clause, params } = systemErrorFilter(opts);
  const row = await db
    .prepare(`SELECT COUNT(*) as count FROM system_errors ${clause}`)
    .bind(...params)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 分页查询错误列表（按创建时间倒序） */
export async function listSystemErrors(
  db: D1Database,
  opts: {
    source?: string;
    errorType?: string;
    fingerprint?: string;
    search?: string;
    limit: number;
    offset: number;
  }
): Promise<SystemErrorRow[]> {
  const { clause, params } = systemErrorFilter(opts);
  const rows = await db
    .prepare(
      `SELECT id, source, error_type, message, stack, url, line_number, column_number,
              user_id, session_id, ip_address, user_agent, fingerprint, created_at
       FROM system_errors ${clause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, opts.limit, opts.offset)
    .all<SystemErrorRow>();
  return rows.results || [];
}

/** 按 id 批量查询用户名（用于错误列表关联用户名） */
export async function listUsernamesByIds(
  db: D1Database,
  ids: string[]
): Promise<Array<{ id: string; username: string }>> {
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db
    .prepare(`SELECT id, username FROM users WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<{ id: string; username: string }>();
  return rows.results || [];
}

/** 按 id 查询错误记录 */
export async function findSystemErrorById(db: D1Database, errorId: string): Promise<SystemErrorRow | null> {
  return db.prepare('SELECT * FROM system_errors WHERE id = ?').bind(errorId).first<SystemErrorRow>();
}

/** 按 id 查询用户名 */
export async function findUsernameById(db: D1Database, userId: string): Promise<string | null> {
  const row = await db.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first<{ username: string }>();
  return row?.username ?? null;
}

/** 查询同指纹的近期错误（排除自身，最多 20 条） */
export async function listRelatedSystemErrors(
  db: D1Database,
  opts: { fingerprint: string; excludeId: string }
): Promise<Row[]> {
  const rows = await db
    .prepare(
      `SELECT id, created_at, ip_address, user_agent FROM system_errors
       WHERE fingerprint = ? AND id != ?
       ORDER BY created_at DESC LIMIT 20`
    )
    .bind(opts.fingerprint, opts.excludeId)
    .all();
  return rows.results || [];
}

/** 按指纹批量删除错误记录，返回删除条数 */
export async function deleteSystemErrorsByFingerprint(db: D1Database, fingerprint: string): Promise<number> {
  const result = await db.prepare('DELETE FROM system_errors WHERE fingerprint = ?').bind(fingerprint).run();
  return result.meta?.changes || 0;
}

/** 按 id 删除错误记录 */
export async function deleteSystemErrorById(db: D1Database, errorId: string): Promise<void> {
  await db.prepare('DELETE FROM system_errors WHERE id = ?').bind(errorId).run();
}