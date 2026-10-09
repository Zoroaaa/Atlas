/**
 * 用户与账号数据访问层
 *
 * 收口 users 与 user_sessions 的读写以及角色联表查询，
 * 使 auth / user / admin 路由不再直接持有 SQL。
 */
import type { User, UserSession } from '@/types';

/** 用户 + 角色信息（登录 / 鉴权场景） */
export type UserWithRole = User & {
  role_name?: string | null;
  role_display_name?: string | null;
  role_permissions?: string | null;
};

const USER_WITH_ROLE_SELECT = `SELECT u.*, r.name as role_name, r.display_name as role_display_name, r.permissions as role_permissions
  FROM users u
  LEFT JOIN roles r ON u.role_id = r.id`;

const SESSION_INSERT = `INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_activity, ip_address, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

/** 按登录标识（用户名或邮箱）查询用户（含角色） */
export async function findUserForLogin(
  db: D1Database,
  field: 'username' | 'email',
  value: string
): Promise<UserWithRole | null> {
  const column = field === 'email' ? 'u.email' : 'u.username';
  return db.prepare(`${USER_WITH_ROLE_SELECT} WHERE ${column} = ?`).bind(value).first<UserWithRole>();
}

/** 按 id 查询用户（含角色） */
export async function findUserWithRoleById(db: D1Database, id: string): Promise<UserWithRole | null> {
  return db.prepare(`${USER_WITH_ROLE_SELECT} WHERE u.id = ?`).bind(id).first<UserWithRole>();
}

/** 按 id 查询完整用户行 */
export async function findUserById(db: D1Database, id: string): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
}

/** 按邮箱查询启用中的用户 */
export async function findActiveUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').bind(email).first<User>();
}

/** 查询用户基础字段（id / username / email） */
export async function findUserBasicById(db: D1Database, id: string): Promise<User | null> {
  return db.prepare('SELECT id, username, email FROM users WHERE id = ?').bind(id).first<User>();
}

/** 查询用户名（用于验证码邮件展示） */
export async function findUsernameById(db: D1Database, id: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT username FROM users WHERE id = ?')
    .bind(id)
    .first<{ username: string }>();
  return row?.username ?? null;
}

/** 用户名或邮箱是否已被占用 */
export async function existsUserByUsernameOrEmail(
  db: D1Database,
  username: string,
  email: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .bind(username, email)
    .first();
  return !!row;
}

/** 邮箱是否已注册 */
export async function existsUserByEmail(db: D1Database, email: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  return !!row;
}

/** 邮箱是否被其他用户占用 */
export async function existsUserByEmailExcluding(
  db: D1Database,
  email: string,
  excludeUserId: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
    .bind(email, excludeUserId)
    .first();
  return !!row;
}

/** 记录一次成功登录（更新最后登录时间并累加次数） */
export async function recordLogin(db: D1Database, userId: string, now: number): Promise<void> {
  await db
    .prepare('UPDATE users SET last_login = ?, login_count = login_count + 1, updated_at = ? WHERE id = ?')
    .bind(now, now, userId)
    .run();
}

/** 更新用户密码（单独执行） */
export async function updateUserPassword(
  db: D1Database,
  userId: string,
  passwordHash: string,
  now: number
): Promise<void> {
  await db
    .prepare('UPDATE users SET password_hash = ?, last_password_change = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, now, now, userId)
    .run();
}

/** 更新用户邮箱 */
export async function updateUserEmail(
  db: D1Database,
  userId: string,
  email: string,
  now: number
): Promise<void> {
  await db
    .prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?')
    .bind(email, now, userId)
    .run();
}

/** 注册：原子写入用户与首个会话 */
export async function createUserWithSession(
  db: D1Database,
  params: {
    userId: string;
    username: string;
    email: string;
    passwordHash: string;
    permissions: string;
    settings: string;
    emailVerified: number;
    sessionId: string;
    tokenHash: string;
    expiresAt: number;
    now: number;
    ipAddress: string;
    userAgent: string;
  }
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, username, email, password_hash, created_at, updated_at, permissions, settings, is_active, login_count, email_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.userId,
        params.username,
        params.email,
        params.passwordHash,
        params.now,
        params.now,
        params.permissions,
        params.settings,
        1,
        0,
        params.emailVerified
      ),
    db
      .prepare(SESSION_INSERT)
      .bind(
        params.sessionId,
        params.userId,
        params.tokenHash,
        params.expiresAt,
        params.now,
        params.now,
        params.ipAddress,
        params.userAgent
      ),
  ]);
}

/** 重置密码：原子更新密码并注销该用户全部会话 */
export async function resetPasswordAndRevokeSessions(
  db: D1Database,
  userId: string,
  passwordHash: string,
  now: number
): Promise<void> {
  await db.batch([
    db
      .prepare('UPDATE users SET password_hash = ?, last_password_change = ?, updated_at = ? WHERE id = ?')
      .bind(passwordHash, now, now, userId),
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(userId),
  ]);
}

/** 删除账户：级联清理该用户的全部关联数据 */
export async function deleteAccountCascade(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM email_verifications WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM email_change_requests WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM password_reset_logs WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM user_favorites WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM user_search_history WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM user_search_source_configs WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}

// ---------------------------------------------------------------------------
// user_sessions
// ---------------------------------------------------------------------------

/** 写入一条会话（登录成功） */
export async function insertSession(
  db: D1Database,
  params: {
    sessionId: string;
    userId: string;
    tokenHash: string;
    expiresAt: number;
    now: number;
    ipAddress: string;
    userAgent: string;
  }
): Promise<void> {
  await db
    .prepare(SESSION_INSERT)
    .bind(
      params.sessionId,
      params.userId,
      params.tokenHash,
      params.expiresAt,
      params.now,
      params.now,
      params.ipAddress,
      params.userAgent
    )
    .run();
}

/** 按 token 查询未过期会话 */
export async function findActiveSessionByToken(
  db: D1Database,
  userId: string,
  tokenHash: string,
  now: number
): Promise<UserSession | null> {
  return db
    .prepare('SELECT * FROM user_sessions WHERE user_id = ? AND token_hash = ? AND expires_at > ?')
    .bind(userId, tokenHash, now)
    .first<UserSession>();
}

/** 刷新会话最后活跃时间 */
export async function touchSession(db: D1Database, sessionId: string, now: number): Promise<void> {
  await db.prepare('UPDATE user_sessions SET last_activity = ? WHERE id = ?').bind(now, sessionId).run();
}

/** 轮换会话 token（刷新令牌） */
export async function rotateSessionToken(
  db: D1Database,
  sessionId: string,
  tokenHash: string,
  expiresAt: number,
  now: number
): Promise<void> {
  await db
    .prepare('UPDATE user_sessions SET token_hash = ?, expires_at = ?, last_activity = ? WHERE id = ?')
    .bind(tokenHash, expiresAt, now, sessionId)
    .run();
}

/** 登出：删除当前会话 */
export async function deleteSessionByToken(
  db: D1Database,
  userId: string,
  tokenHash: string
): Promise<void> {
  await db
    .prepare('DELETE FROM user_sessions WHERE user_id = ? AND token_hash = ?')
    .bind(userId, tokenHash)
    .run();
}