/**
 * 内部榜单导入路由：POST /api/internal/rankings/import。
 *
 * 约束：只接受带 X-Rankings-Secret 的机器调用，不走 admin JWT；未配置密钥时入口关闭。
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { validateBody, schemas } from '@/validation';
import { importRankingSnapshot } from '@/services/ranking-import';
import { purgeRankingCaches } from '@/services/ranking-cache';

export const rankingsRoutes = new Hono<{ Bindings: Env }>();

/** 定长比较，避免逐字符提前返回带来的时序侧信道；长度不等直接判失败。 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// 导入入口是机器对机器调用：密钥只从环境变量读取，缺失即视为功能未启用
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

/** 导入榜单快照：写入成功后立即失效对应缓存，保证下一次请求拿到新榜。 */
rankingsRoutes.post(
  '/import',
  validateBody(schemas.rankings.import),
  async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof schemas.rankings.import>;

    try {
      const result = await importRankingSnapshot(c.env.DB, body);
      if (result.rejected === 'TOO_FEW_ITEMS') {
        return c.json(error('TOO_FEW_ITEMS', '有效榜单条目过少，已拒绝本次导入'), 400);
      }
      if (result.rejected === 'INVALID_CHANNEL') {
        return c.json(error('INVALID_CHANNEL', '榜单通道或年份不合法'), 400);
      }

      // 写库成功后立即失效对应的榜单缓存，保证下一次请求拿到新榜
      await purgeRankingCaches(new URL(c.req.url).origin, body);

      return c.json(success(result, '榜单导入完成'));
    } catch (err) {
      console.error('[rankings] import error:', err);
      return c.json(error('SERVER_ERROR', '榜单导入失败'), 500);
    }
  }
);
