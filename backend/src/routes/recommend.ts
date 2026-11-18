/**
 * 推荐路由：JAV 个性化推荐、热门推荐与相关推荐。
 *
 * 约束：所有入口需登录；结果每次随机并禁止缓存；for-you 无命中时回退热门。
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

/** 推荐统一限流：每用户每分钟 30 次，管理员跳过（随机推荐成本较高）。 */
async function checkRecommendRateLimit(c: Context<{ Bindings: Env }>) {
  const user = c.get('user');
  const key = `recommend:${user.userId}`;
  if (await checkIsAdmin(c)) return { allowed: true };
  return checkRateLimitD1(c.env.DB, key, 60_000, 30);
}

/** 获取 JAV 推荐：mode=popular 走热门榜，默认按用户画像推荐。 */
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

/** 获取相关推荐：按演员 / 标签 / 发行商等种子字段匹配相似作品。 */
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
