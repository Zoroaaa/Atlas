/**
 * 本地库只读路由：搜索历史 / 收藏点击后直接展示详情卡片，数据全部来自 data_records。
 *
 * 约束：数据本身是全局共享资产（无 user_id），登录要求仅用于防止匿名枚举。
 */
import { Hono } from 'hono';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { authMiddleware } from '@/middleware';
import { getLibraryRecord } from '@/services/library-record';

export const libraryRoutes = new Hono<{ Bindings: Env }>();

libraryRoutes.use('*', authMiddleware);

/** 按 type / code / url / title 任一条件查本地库记录，四个参数至少传一个。 */
libraryRoutes.get('/record', async (c) => {
  const type = c.req.query('type')?.trim() || undefined;
  const code = c.req.query('code')?.trim() || undefined;
  const url = c.req.query('url')?.trim() || undefined;
  const title = c.req.query('title')?.trim() || undefined;

  if (!type && !code && !url && !title) {
    return c.json(error('VALIDATION_ERROR', '缺少查询条件'), 400);
  }

  try {
    const result = await getLibraryRecord(c.env.DB, { type, code, url, title });
    return c.json(success(result));
  } catch (err) {
    console.error('[library] get record error:', err);
    return c.json(error('SERVER_ERROR', '读取本地库失败'), 500);
  }
});
