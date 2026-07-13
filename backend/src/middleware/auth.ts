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
 * 从数据库查询用户角色名称（实时查询）
 */
export async function getUserRoleName(db: D1Database, userId: string): Promise<string> {
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
 * 检查用户是否为管理员（实时数据库查询）
 */
export async function checkIsAdmin(db: D1Database, userId: string): Promise<boolean> {
  const roleName = await getUserRoleName(db, userId);
  return roleName === 'admin' || roleName === 'super_admin';
}

/**
 * 检查用户是否为超级管理员（实时数据库查询）
 */
export async function checkIsSuperAdmin(db: D1Database, userId: string): Promise<boolean> {
  const roleName = await getUserRoleName(db, userId);
  return roleName === 'super_admin';
}

/**
 * 检查用户是否拥有指定权限（实时数据库查询）
 */
export async function checkPermission(db: D1Database, userId: string, requiredPermission: string): Promise<boolean> {
  try {
    const result = await db.prepare(
      'SELECT r.permissions FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?'
    ).bind(userId).first<{ permissions: string }>();
    
    if (!result) return false;
    
    const permissions = JSON.parse(result.permissions || '[]') as string[];
    
    // 通配符权限
    if (permissions.includes('*')) return true;
    
    // 模块通配符权限
    const moduleWildcard = requiredPermission.split(':')[0] + ':*';
    if (permissions.includes(moduleWildcard)) return true;
    
    // 精确权限
    return permissions.includes(requiredPermission);
  } catch {
    return false;
  }
}

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
  const session = await c.env.DB.prepare(
    'SELECT id FROM user_sessions WHERE token_hash = ? AND expires_at > ?'
  ).bind(tokenHash, Date.now()).first();

  if (!session) {
    return c.json(error('UNAUTHORIZED', '会话已失效，请重新登录'), 401);
  }

  c.set('user', payload);
  c.set('authToken', token);
  await next();
};

/**
 * 角色中间件 - 从数据库实时查询用户角色和权限
 * 必须在 authMiddleware 之后使用
 */
export const roleMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json(error('UNAUTHORIZED', '未认证'), 401);
  }
  
  try {
    const userWithRole = await c.env.DB.prepare(
      'SELECT u.role_id, r.* FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?'
    ).bind(user.userId).first<{ role_id: string } & Role>();
    
    if (!userWithRole || !userWithRole.id) {
      // 默认普通用户角色
      c.set('userRole', {
        id: 'user',
        name: 'user',
        display_name: '普通用户',
        permissions: '["search","favorite","history","sync","community:share","community:review"]',
        is_system: 1,
        priority: 10,
        created_at: Date.now(),
        updated_at: Date.now(),
        description: null
      });
    } else {
      c.set('userRole', userWithRole as Role);
    }
    
    await next();
  } catch {
    c.set('userRole', {
      id: 'user',
      name: 'user',
      display_name: '普通用户',
      permissions: '["search","favorite","history","sync","community:share","community:review"]',
      is_system: 1,
      priority: 10,
      created_at: Date.now(),
      updated_at: Date.now(),
      description: null
    });
    await next();
  }
};

/**
 * 管理员中间件 - 检查用户是否为管理员（从数据库实时查询）
 */
export const adminMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json(error('UNAUTHORIZED', '未认证'), 401);
  }

  try {
    const userWithRole = await c.env.DB.prepare(
      'SELECT u.role_id, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?'
    ).bind(user.userId).first<{ role_id: string; role_name: string }>();
    
    const roleName = userWithRole?.role_name || 'user';
    
    if (roleName !== 'admin' && roleName !== 'super_admin') {
      return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
    }
    
    await next();
  } catch {
    return c.json(error('FORBIDDEN', '权限检查失败'), 403);
  }
};

/**
 * 超级管理员中间件 - 检查用户是否为超级管理员（从数据库实时查询）
 */
export const superAdminMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get('user');
  
  if (!user) {
    return c.json(error('UNAUTHORIZED', '未认证'), 401);
  }

  try {
    const userWithRole = await c.env.DB.prepare(
      'SELECT u.role_id, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?'
    ).bind(user.userId).first<{ role_id: string; role_name: string }>();
    
    const roleName = userWithRole?.role_name || 'user';
    
    if (roleName !== 'super_admin') {
      return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
    }
    
    await next();
  } catch {
    return c.json(error('FORBIDDEN', '权限检查失败'), 403);
  }
};

/**
 * 权限检查中间件工厂函数
 * 使用方式：app.use('/api/admin/*', permissionMiddleware('admin:read'))
 * 
 * 权限规则：
 * 1. 通配符 '*' 表示拥有所有权限（超级管理员）
 * 2. 'module:*' 表示拥有该模块所有权限（如 'user:*' 包含 'user:read', 'user:write'）
 * 3. 精确匹配权限字符串
 */
export const permissionMiddleware = (requiredPermission: string) => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user');
    
    if (!user) {
      return c.json(error('UNAUTHORIZED', '未认证'), 401);
    }

    try {
      // 从数据库查询用户角色的权限
      const userWithRole = await c.env.DB.prepare(
        'SELECT u.role_id, r.permissions, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?'
      ).bind(user.userId).first<{ role_id: string; permissions: string; role_name: string }>();
      
      if (!userWithRole) {
        return c.json(error('FORBIDDEN', '无权限'), 403);
      }

      const permissions = JSON.parse(userWithRole.permissions || '[]') as string[];
      
      // 检查是否有通配符权限
      if (permissions.includes('*')) {
        await next();
        return;
      }
      
      // 检查是否有模块通配符权限 (如 user:* 匹配 user:read)
      const moduleWildcard = requiredPermission.split(':')[0] + ':*';
      if (permissions.includes(moduleWildcard)) {
        await next();
        return;
      }
      
      // 检查精确权限
      if (permissions.includes(requiredPermission)) {
        await next();
        return;
      }
      
      return c.json(error('FORBIDDEN', `需要权限: ${requiredPermission}`), 403);
    } catch {
      return c.json(error('FORBIDDEN', '权限检查失败'), 403);
    }
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
