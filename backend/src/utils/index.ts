/**
 * 通用工具桶文件：响应体、ID/密码/Token、客户端信息、基础校验与行为日志，
 * 末尾统一转出 security / fetch / format / error / rate-limit / oauth-redirect。
 */
import { Context } from 'hono';
import { Env, JwtPayload } from '@/types';
import * as jose from 'jose';

/** 统一成功响应体 */
export const success = <T>(data: T, message?: string) => ({
  success: true as const,
  data,
  message,
});

/** 统一错误响应体；code 供前端分支判断，message 面向用户 */
export const error = (code: string, message: string, details?: unknown) => ({
  success: false as const,
  error: { code, message, details },
});

/** 生成 UUID（数据库主键） */
export const generateId = (): string => {
  return crypto.randomUUID();
};

/**
 * PBKDF2-SHA256 哈希，输出 `$pbkdf2-sha256$迭代数$盐$摘要`。
 * 迭代数写进结果串，调整成本参数时旧密码仍可校验。
 */
export const hashPassword = async (password: string): Promise<string> => {
  // 16 字节随机盐 + 10 万次迭代：在 Worker CPU 预算内尽量抬高离线爆破成本
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

  return `$pbkdf2-sha256$100000$${saltBase64}$${hashBase64}`;
};

/** SHA-256 十六进制摘要，用于会话 token 与限流标识，明文不落库 */
export const hashToken = async (token: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** 校验密码；兼容早期无盐 SHA-256 十六进制摘要（历史账号） */
export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  try {
    if (!storedHash.startsWith('$pbkdf2-sha256$')) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const legacyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return legacyHash === storedHash;
    }

    const [, , iterationsStr, saltBase64, hashBase64] = storedHash.split('$');
    const iterations = parseInt(iterationsStr, 10);
    const saltBytes = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const computedHashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
    return computedHashBase64 === hashBase64;
  } catch {
    return false;
  }
};

/** 签发 HS256 JWT；默认 30 天。role 仅在调用方明确传入时写入 payload。 */
export const generateToken = async (userId: string, username: string, secret: string, expiryDays: number = 30, role?: string): Promise<string> => {
  const secretKey = new TextEncoder().encode(secret);
  const payload: { userId: string; username: string; role?: string } = { userId, username };
  if (role) {
    payload.role = role;
  }
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiryDays}d`)
    .sign(secretKey);
  return token;
};

/** 校验 JWT 并返回 payload；签名错误或已过期一律返回 null。 */
export const verifyToken = async (token: string, secret: string): Promise<JwtPayload | null> => {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
};

export const getClientIP = (c: Context): string => {
  // 优先取 CF-Connecting-IP：由 Cloudflare 边缘节点写入，客户端无法伪造；
  // x-forwarded-for / x-real-ip 可能携带客户端自报值，仅作为非 Cloudflare 环境兜底
  return c.req.header('CF-Connecting-IP') ||
         c.req.header('x-forwarded-for') || 
         c.req.header('x-real-ip') || 
         'unknown';
};

import { CONFIG } from '@/constants';

/** 基础邮箱格式校验（CONFIG 中的默认正则）；正式流程仍需 zod 与发信验证兜底 */
export const validateEmail = (email: string): boolean => {
  return CONFIG.VALIDATION.EMAIL_REGEX.test(email);
};

/** 基础用户名格式校验（CONFIG 中的默认正则） */
export const validateUsername = (username: string): boolean => {
  return CONFIG.VALIDATION.USERNAME_REGEX.test(username);
};

/** 仅做最小长度 6 的快速校验；注册/改密链路应以 ConfigService 的密码策略为准 */
export const validatePassword = (password: string): boolean => {
  return password.length >= 6;
};

/** 写用户行为日志；未开启 ENABLE_ACTION_LOGGING 时直接短路，写失败不影响主流程。 */
export const logUserAction = async (
  env: Env, 
  userId: string | null, 
  action: string, 
  data: Record<string, unknown>,
  c: Context
): Promise<void> => {
  if (env.ENABLE_ACTION_LOGGING !== 'true') return;
  
  try {
    const actionId = generateId();
    const ip = getClientIP(c);
    const userAgent = c.req.header('User-Agent') || '';
    
    await env.DB.prepare(`
      INSERT INTO user_actions (id, user_id, action, data, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      actionId,
      userId,
      action,
      JSON.stringify(data),
      ip,
      userAgent,
      Date.now()
    ).run();
  } catch (error) {
    console.error('记录用户行为失败:', error);
  }
};

/** 邮箱脱敏：本地部分最多保留前 2 位，域名原样保留 */
export const maskEmail = (email: string): string => {
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }
  return `${localPart.slice(0, 2)}***@${domain}`;
};

export * from './security';
export * from './fetch';
export * from './format';
export * from './error';
export * from './rate-limit';
export * from './oauth-redirect';
export * from './sql';
export * from './fingerprint';
export * from './concurrency';
