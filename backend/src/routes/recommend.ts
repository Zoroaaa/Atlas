/**
 * 推荐路由
 *
 * GET  /api/recommend/jav?mode=for-you|popular
 * POST /api/recommend/jav/related
 *
 * 所有入口都需要登录（与搜索接口一致）；推荐只做 JAV。
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { authMiddleware } from '@/middleware';
import { checkIsAdmin } from '@/middleware/auth';
import { checkRateLimitD1 } from '@/utils/rate-limit';
import { validateBody, schemas } from '@/validation';
import {
  getUserProfile,
  recommendForYou,
  recommendRelated,
} from '@/services/recommendation';
import { recommendPopular } from '@/services/hot-list';

export const recommendRoutes = new Hono<{ Bindings: Env }>();

// 推荐每次请求重新随机，禁止浏览器/边缘缓存
recommendRoutes.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

recommendRoutes.use('*', authMiddleware);

async function checkRecommendRateLimit(c: Context<{ Bindings: Env }>) {
  const user = c.get('user');
  const key = `recommend:${user.userId}`;
  if (await checkIsAdmin(c)) return { allowed: true };
  return checkRateLimitD1(c.env.DB, key, 60_000, 30);
}

recommendRoutes.get('/jav', async (c) => {
  const rl = await checkRecommendRateLimit(c);
  if (!rl.allowed) {
    return c.json(error('RATE_LIMITED', '推荐请求过于频繁，请稍后再试'), 429);
  }

  const user = c.get('user');
  const mode = c.req.query('mode') === 'popular' ? 'popular' : 'for-you';

  try {
    const profile = await getUserProfile(c.env.DB, user.userId);

    if (mode === 'popular') {
      return c.json(
        success(await recommendPopular(c.env.DB, user.userId, profile.isNewUser))
      );
    }

    const personalized = await recommendForYou(c.env.DB, user.userId, profile);
    if (personalized) {
      return c.json(success(personalized));
    }

    // 新用户 / 画像无命中 → 回退独立热门列表，响应 mode='popular'
    return c.json(
      success(await recommendPopular(c.env.DB, user.userId, profile.isNewUser))
    );
  } catch (err) {
    console.error('[recommend] get error:', err);
    return c.json(error('SERVER_ERROR', '获取推荐失败'), 500);
  }
});

recommendRoutes.post(
  '/jav/related',
  validateBody(schemas.recommend.related),
  async (c) => {
    const rl = await checkRecommendRateLimit(c);
    if (!rl.allowed) {
      return c.json(error('RATE_LIMITED', '推荐请求过于频繁，请稍后再试'), 429);
    }

    const user = c.get('user');
    const body = c.get('validatedBody') as z.infer<typeof schemas.recommend.related>;

    try {
      return c.json(success(await recommendRelated(c.env.DB, user.userId, body)));
    } catch (err) {
      console.error('[recommend] related error:', err);
      return c.json(error('SERVER_ERROR', '获取相关推荐失败'), 500);
    }
  }
);
