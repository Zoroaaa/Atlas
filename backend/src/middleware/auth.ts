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
      c.set('userRole', { id: 'user', name: 'user', display_name: '普通用户', permissions: '["search","favorite","history","sync"]', is_system: 1, priority: 10, created_at: Date.now(), updated_at: Date.now(), description: null });
    } else {
      c.set('userRole', userWithRole as Role);
    }
    
    await next();
  } catch {
    c.set('userRole', { id: 'user', name: 'user', display_name: '普通用户', permissions: '["search","favorite","history","sync"]', is_system: 1, priority: 10, created_at: Date.now(), updated_at: Date.now(), description: null });
    await next();
  }
};

export const adminMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get('user');
  
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return c.json(error('FORBIDDEN', '需要管理员权限'), 403);
  }
  
  await next();
};

export const superAdminMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get('user');
  
  if (!user || user.role !== 'super_admin') {
    return c.json(error('FORBIDDEN', '需要超级管理员权限'), 403);
  }
  
  await next();
};

export const permissionMiddleware = (requiredPermission: string) => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const userRole = c.get('userRole');
    
    if (!userRole) {
      return c.json(error('FORBIDDEN', '无权限'), 403);
    }
    
    const permissions = JSON.parse(userRole.permissions || '[]') as string[];
    const hasWildcard = permissions.includes('*');
    const hasPermission = permissions.includes(requiredPermission) || 
                          permissions.some(p => requiredPermission.startsWith(p.replace('*', '')));
    
    if (!hasWildcard && !hasPermission) {
      return c.json(error('FORBIDDEN', `需要权限: ${requiredPermission}`), 403);
    }
    
    await next();
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
