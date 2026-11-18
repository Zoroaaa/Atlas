/**
 * OAuth 登录票据兑换路由：POST /api/auth/oauth/exchange。
 *
 * 约束：cb 回调不再把 JWT 放进 URL，前端用一次性 code 换 token；
 * code 只能兑换一次，兑换接口按 IP 限流，失败信息区分「码无效」与「账号禁用」。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '@/types';
import { error, getClientIP, logUserAction, recordSecurityEvent, success } from '@/utils';
import { checkRateLimitD1 } from '@/utils/rate-limit';
import { validateBody, schemas } from '@/validation';
import { exchangeOAuthLoginCode } from '@/services/oauth-login';

export const oauthExchangeRoutes = new Hono<{ Bindings: Env }>();

oauthExchangeRoutes.post('/oauth/exchange', validateBody(schemas.auth.exchangeOAuthCode), async (c) => {
  const { code } = c.get('validatedBody') as z.infer<typeof schemas.auth.exchangeOAuthCode>;
  const ipAddress = getClientIP(c);
  const userAgent = c.req.header('User-Agent') || '';

  // code 有 256 位熵，限流只是降低无意义刷接口的成本
  const limited = await checkRateLimitD1(c.env.DB, `oauth:exchange:ip:${ipAddress}`, 60_000, 20);
  if (!limited.allowed) {
    return c.json(error('RATE_LIMITED', '请求过于频繁，请稍后再试'), 429);
  }

  try {
    const result = await exchangeOAuthLoginCode(c.env, { code, ipAddress, userAgent });

    if (!result.ok) {
      if (result.reason === 'account_disabled') {
        return c.json(error('AUTH_ERROR', '账号已被禁用'), 403);
      }
      if (result.reason === 'user_not_found') {
        return c.json(error('AUTH_ERROR', '用户不存在'), 404);
      }
      return c.json(error('AUTH_ERROR', '登录凭证无效或已过期，请重新登录'), 401);
    }

    c.executionCtx.waitUntil(logUserAction(c.env, result.user.id, 'login', { method: 'oauth', ip: ipAddress }, c));
    c.executionCtx.waitUntil(
      recordSecurityEvent(c.env.DB, {
        userId: result.user.id,
        eventType: 'login',
        eventStatus: 'success',
        ipAddress,
        userAgent,
      })
    );

    return c.json(success({ user: result.user, token: result.token }, '登录成功'));
  } catch (err) {
    console.error('OAuth code exchange error:', err);
    return c.json(error('SERVER_ERROR', '登录失败，请稍后重试'), 500);
  }
});
