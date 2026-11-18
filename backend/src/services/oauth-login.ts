/**
 * OAuth 登录票据：把「回调换票」拆成两步，避免把长期 JWT 放进回调 URL。
 *
 * 流程：回调校验通过 → 生成一次性 code（只存 hash）→ 302 带 code 回前端；
 * 前端 POST code → 后端消费 code、签发 JWT 并建会话。code 5 分钟过期且只能兑换一次。
 */
import type { Env } from '@/types';
import { generateId, generateToken, hashToken } from '@/utils';
import {
  consumeOAuthLoginCode,
  findActiveOAuthLoginCode,
  insertOAuthLoginCode,
} from '@/repositories/oauth-login-repository';
import { findUserWithRoleById, insertSession, recordLogin } from '@/repositories/user-repository';

/** 票据有效期：只够浏览器完成一次重定向 + 前端立即发起兑换 */
const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;

export interface OAuthExchangeUser {
  id: string;
  username: string;
  email: string;
  settings: Record<string, unknown>;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: number;
  lastLogin: number;
  loginCount: number;
  role: string;
  roleDisplayName: string;
}

export type OAuthExchangeResult =
  | { ok: true; token: string; user: OAuthExchangeUser }
  | { ok: false; reason: 'invalid_code' | 'account_disabled' | 'user_not_found' };

/** 生成 32 字节随机 code（64 位 hex），只把摘要写入 D1 */
export function generateOAuthLoginCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** 回调成功后的第一步：为用户签发一次性登录票据，返回明文 code */
export async function issueOAuthLoginCode(
  env: Env,
  params: { userId: string; provider: string; ipAddress: string | null; userAgent: string | null }
): Promise<string> {
  const code = generateOAuthLoginCode();
  const now = Date.now();
  await insertOAuthLoginCode(env.DB, {
    codeHash: await hashToken(code),
    userId: params.userId,
    provider: params.provider,
    expiresAt: now + OAUTH_CODE_TTL_MS,
    now,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
  return code;
}

/**
 * 第二步：消费 code 并完成登录。
 * 先删除票据再签发会话：并发兑换时只有一个请求能删除成功，其余按无效码拒绝。
 */
export async function exchangeOAuthLoginCode(
  env: Env,
  params: { code: string; ipAddress: string; userAgent: string }
): Promise<OAuthExchangeResult> {
  const codeHash = await hashToken(params.code);
  const now = Date.now();

  const ticket = await findActiveOAuthLoginCode(env.DB, codeHash, now);
  if (!ticket) return { ok: false, reason: 'invalid_code' };

  if (!await consumeOAuthLoginCode(env.DB, codeHash)) {
    return { ok: false, reason: 'invalid_code' };
  }

  const user = await findUserWithRoleById(env.DB, ticket.user_id);
  if (!user) return { ok: false, reason: 'user_not_found' };
  if (!user.is_active) return { ok: false, reason: 'account_disabled' };

  const expiryDays = parseInt(env.JWT_EXPIRY_DAYS || '30', 10);
  const role = user.role_name || 'user';
  const token = await generateToken(user.id, user.username, env.JWT_SECRET, expiryDays, role);
  const tokenHash = await hashToken(token);
  const sessionId = generateId();
  const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

  await insertSession(env.DB, {
    sessionId,
    userId: user.id,
    tokenHash,
    expiresAt,
    now,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
  await recordLogin(env.DB, user.id, now);

  return {
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      settings: (() => {
        try {
          return JSON.parse(user.settings || '{}') as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
      isActive: true,
      emailVerified: user.email_verified === 1,
      createdAt: user.created_at,
      lastLogin: now,
      loginCount: user.login_count + 1,
      role,
      roleDisplayName: user.role_display_name || '普通用户',
    },
  };
}
