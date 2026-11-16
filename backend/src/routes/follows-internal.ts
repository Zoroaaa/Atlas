/**
 * 内部关注同步路由（GitHub Actions 调用）
 *
 * GET  /api/internal/follows/upcoming/targets  本轮需要刷新的关注对象
 * POST /api/internal/follows/upcoming/import   JavDB 即将发售快照
 *
 * 与榜单导入共用 RANKINGS_IMPORT_SECRET，避免再维护一套机器密钥。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { validateBody, schemas } from '@/validation';
import { FOLLOW } from '@/constants';
import { listUpcomingTargets, importUpcomingSnapshot } from '@/services/follow-upcoming';

export const followsInternalRoutes = new Hono<{ Bindings: Env }>();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

followsInternalRoutes.use('*', async (c, next) => {
  const secret = c.env.RANKINGS_IMPORT_SECRET;
  if (!secret) {
    return c.json(error('IMPORT_DISABLED', '内部同步未配置密钥'), 503);
  }

  const provided = c.req.header('x-rankings-secret') || c.req.header('x-internal-secret') || '';
  if (!safeEqual(provided, secret)) {
    return c.json(error('UNAUTHORIZED', '内部同步密钥不匹配'), 401);
  }

  await next();
});

followsInternalRoutes.get('/upcoming/targets', async (c) => {
  try {
    const raw = parseInt(c.req.query('limit') || '', 10);
    const limit = Number.isFinite(raw) && raw > 0 ? raw : FOLLOW.UPCOMING_BATCH_DEFAULT;
    const targets = await listUpcomingTargets(c.env.DB, limit);
    return c.json(success({ targets }));
  } catch (err) {
    console.error('[follow-upcoming] list targets failed:', err);
    return c.json(error('SERVER_ERROR', '获取同步目标失败'), 500);
  }
});

followsInternalRoutes.post(
  '/upcoming/import',
  validateBody(schemas.follows.importUpcoming),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof schemas.follows.importUpcoming>;

    try {
      const result = await importUpcomingSnapshot(c.env.DB, body);
      return c.json(success(result, '即将发售同步完成'));
    } catch (err) {
      console.error('[follow-upcoming] import failed:', err);
      return c.json(error('SERVER_ERROR', '即将发售同步失败'), 500);
    }
  }
);
