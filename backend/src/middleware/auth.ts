import { Context, Next } from 'hono';
import { Env, JwtPayload, Role } from '@/types';
import { verifyToken, error, hashToken } from '@/utils';

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
    userRole: Role;
    authToken: string;
  }
}

/**
 * 兜底普通用户角色：用户存在但未绑定 roles 记录时使用
 * 与 roles 表中 user 行的语义保持一致
 */
const DEFAULT_USER_ROLE: Role = {
  id: 'user',
  name: 'user',
  display_name: '普通用户',
  permissions: '["search","favorite","history","sync","community:share","community:review"]',
  is_system: 1,
  priority: 10,
  created_at: 0,
  updated_at: 0,
  description: null,
};

/**
 * 从数据库查询用户角色名称
 * 仅在缺少上下文 userRole 时作为回退路径使用
 */
export async function getUserRoleName(db: D1Database, userId?: string): Promise<string> {
  if (!userId) return 'user';
  try {
    const result = await db.prepare(
      'SELECT r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?'
    ).bind(userId).first<{ role_name: string }>();
    return result?.role_name || 'user';
  } catch {
    return 'user';
  }
}

/**
 * 检查用户是否为管理员
 * 优先读取 authMiddleware 写入的 userRole（零查询）；无上下文时回退实时查询
 */
export async function checkIsAdmin(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const role = c.get('userRole');
  const roleName = role ? role.name : await getUserRoleName(c.env.DB, c.get('user')?.userId);
  return roleName === 'admin' || roleName === 'super_admin';
}

/**
 * 检查用户是否为超级管理员
 * 优先读取 authMiddleware 写入的 userRole（零查询）；无上下文时回退实时查询
 */
export async function checkIsSuperAdmin(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const role = c.get('userRole');
  const roleName = role ? role.name : await getUserRoleName(c.env.DB, c.get('user')?.userId);
  return roleName === 'super_admin';
}

/**
 * 检查用户是否拥有指定权限
 * 优先读取 authMiddleware 写入的 userRole.permissions（零查询）；无上下文时回退实时查询
 *
 * 权限规则：
 * 1. 通配符 '*' 表示拥有所有权限（超级管理员）
 * 2. 'module:*' 表示拥有该模块所有权限（如 'user:*' 包含 'user:read', 'user:write'）
 * 3. 精确匹配权限字符串
 */
export async function checkPermission(c: Context<{ Bindings: Env }>, requiredPermission: string): Promise<boolean> {
  let permissions: string[];

  const role = c.get('userRole');
  if (role) {
    permissions = JSON.parse(role.permissions || '[]') as string[];
  } else {
    const userId = c.get('user')?.userId;
    if (!userId) return false;
    try {
      const result = await c.env.DB.prepare(
        'SELECT r.permissions FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?'
      ).bind(userId).first<{ permissions: string }>();
      if (!result) return false;
      permissions = JSON.parse(result.permissions || '[]') as string[];
    } catch {
      return false;
    }
  }

  if (permissions.includes('*')) return true;

  const moduleWildcard = requiredPermission.split(':')[0] + ':*';
  if (permissions.includes(moduleWildcard)) return true;

  return permissions.includes(requiredPermission);
}

/**
 * 认证中间件
 * 单次 JOIN 同时完成会话校验与角色/权限加载，写入 c.set('userRole')，
 * 使下游中间件与权限辅助函数无需再次查询数据库。
 *
 * SQL 语义保证：
 *   - 以 session 为主表判断会话有效性（与旧实现一致，不因用户/角色缺失而误判会话失效）
 *   - users/roles 使用 LEFT JOIN，缺失时回退 DEFAULT_USER_ROLE
 */
export const authMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('UNAUTHORIZED', '未提供认证令牌'), 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('UNAUTHORIZED', '无效或过期的令牌'), 401);
  }

  const tokenHash = await hashToken(token);
  const row = await c.env.DB.prepare(`
    SELECT s.id AS session_id,
           r.id, r.name, r.display_name, r.description, r.permissions,
           r.is_system, r.priority, r.created_at, r.updated_at
    FROM user_sessions s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, Date.now()).first<{
    session_id: string;
    id: string | null;
    name: string | null;
    display_name: string | null;
    description: string | null;
    permissions: string | null;
    is_system: number | null;
    priority: number | null;
    created_at: number | null;
    updated_at: number | null;
  }>();

  if (!row) {
    return c.json(error('UNAUTHORIZED', '会话已失效，请重新登录'), 401);
  }

  c.set('user', payload);
  c.set('authToken', token);
  c.set('userRole', row.id ? (row as unknown as Role) : DEFAULT_USER_ROLE);
  await next();
};

/**
 * 管理员中间件 - 读取 authMiddleware 缓存的角色（零额外查询）
 * 必须在 authMiddleware 之后使用
 */
export const adminMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get('user');

  if (!user) {
    return c.json(error('UNAUTHORIZED', '未认证'), 401);
  }

  const roleName = c.get('userRole')?.name || 'user';

  if (roleName !== 'admin' && roleName !== 'super_admin') {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }

  await next();
};

/**
 * 超级管理员中间件 - 读取 authMiddleware 缓存的角色（零额外查询）
 * 必须在 authMiddleware 之后使用
 */
export const superAdminMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get('user');

  if (!user) {
    return c.json(error('UNAUTHORIZED', '未认证'), 401);
  }

  if ((c.get('userRole')?.name || 'user') !== 'super_admin') {
    return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
  }

  await next();
};

/**
 * 权限检查中间件工厂函数
 * 使用方式：app.use('/api/admin/*', permissionMiddleware('admin:read'))
 * 读取 authMiddleware 缓存的 userRole.permissions（零额外查询）
 */
export const permissionMiddleware = (requiredPermission: string) => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user');

    if (!user) {
      return c.json(error('UNAUTHORIZED', '未认证'), 401);
    }

    const permissions = JSON.parse(c.get('userRole')?.permissions || '[]') as string[];

    // 通配符权限（超级管理员）
    if (permissions.includes('*')) {
      await next();
      return;
    }

    // 模块通配符权限 (如 user:* 匹配 user:read)
    const moduleWildcard = requiredPermission.split(':')[0] + ':*';
    if (permissions.includes(moduleWildcard)) {
      await next();
      return;
    }

    // 精确权限
    if (permissions.includes(requiredPermission)) {
      await next();
      return;
    }

    return c.json(error('FORBIDDEN', `需要权限: ${requiredPermission}`), 403);
  };
};

export const optionalAuthMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (payload) {
      c.set('user', payload);
    }
  }

  await next();
};