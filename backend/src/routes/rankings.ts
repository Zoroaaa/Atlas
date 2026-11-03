/**
 * 内部榜单导入路由
 *
 * POST /api/internal/rankings/import
 * 只接受带 X-Rankings-Secret 的机器调用，不走 admin JWT。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { validateBody, schemas } from '@/validation';
import { importRankingSnapshot } from '@/services/ranking-import';

export const rankingsRoutes = new Hono<{ Bindings: Env }>();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

rankingsRoutes.use('/import', async (c, next) => {
  const secret = c.env.RANKINGS_IMPORT_SECRET;
  if (!secret) {
    return c.json(error('IMPORT_DISABLED', '榜单导入未配置密钥'), 503);
  }

  const provided = c.req.header('x-rankings-secret') || '';
  if (!safeEqual(provided, secret)) {
    return c.json(error('UNAUTHORIZED', '榜单导入密钥不匹配'), 401);
  }

  await next();
});

rankingsRoutes.post(
  '/import',
  validateBody(schemas.rankings.import),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof schemas.rankings.import>;

    try {
      const result = await importRankingSnapshot(c.env.DB, body);
      return c.json(success(result, '榜单导入完成'));
    } catch (err) {
      console.error('[rankings] import error:', err);
      return c.json(error('SERVER_ERROR', '榜单导入失败'), 500);
    }
  }
);
