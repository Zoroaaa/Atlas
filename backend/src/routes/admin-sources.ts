/**
 * 管理后台系统源站路由：系统大类 / 分类 / 搜索源的增删改与读取。
 *
 * 约束：本路由只操作 owner_id IS NULL 的系统数据；用户私有数据在此不可见、不可改。
 * 鉴权由父级 adminRoutes 的 authMiddleware + adminMiddleware 统一兜底。
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error } from '@/utils';
import { toMajorCategoryDto, toCategoryDto, toSourceDto } from '@/utils/source-dto';
import { invalidateCache } from '@/utils/cache';
import { validateBody, schemas } from '@/validation';
import {
  SourceTreeError,
  getSystemTree,
  getSystemStats,
  createSystemMajorCategory,
  updateSystemMajorCategory,
  deleteSystemMajorCategory,
  createSystemCategory,
  updateSystemCategory,
  deleteSystemCategory,
  createSystemSource,
  updateSystemSource,
  deleteSystemSource,
} from '@/services/source-tree-service';

export const adminSourceRoutes = new Hono<{ Bindings: Env }>();

/** 系统字典缓存失效：大类/分类写操作后必须立即生效 */
function invalidateSystemDictionary(): void {
  invalidateCache('sources:dict');
}

/** 服务层错误 → 统一响应 */
function respondServiceError(c: Context<{ Bindings: Env }>, err: unknown) {
  if (err instanceof SourceTreeError) {
    return c.json(error(err.code, err.message), err.status);
  }
  throw err;
}

// ── 读取 ─────────────────────────────────────────────

adminSourceRoutes.get('/tree', async (c) => {
  try {
    const [tree, stats] = await Promise.all([
      getSystemTree(c.env.DB),
      getSystemStats(c.env.DB),
    ]);
    return c.json(success({
      majorCategories: tree.majorCategories.map(toMajorCategoryDto),
      categories: tree.categories.map(toCategoryDto),
      sources: tree.sources.map(toSourceDto),
      stats,
    }));
  } catch (err) {
    console.error('Admin get source tree error:', err);
    return c.json(error('SERVER_ERROR', '获取系统源站树失败'), 500);
  }
});

// ── 大类 ─────────────────────────────────────────────

adminSourceRoutes.post('/major-categories', validateBody(schemas.sources.createMajorCategory), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createMajorCategory>;
  try {
    const created = await createSystemMajorCategory(c.env.DB, body);
    invalidateSystemDictionary();
    return c.json(success(toMajorCategoryDto(created), '大类创建成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

adminSourceRoutes.put('/major-categories/:id', validateBody(schemas.sources.updateMajorCategory), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateMajorCategory>;
  try {
    await updateSystemMajorCategory(c.env.DB, c.req.param('id'), body);
    invalidateSystemDictionary();
    return c.json(success(null, '大类更新成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

adminSourceRoutes.delete('/major-categories/:id', async (c) => {
  try {
    await deleteSystemMajorCategory(c.env.DB, c.req.param('id'));
    invalidateSystemDictionary();
    return c.json(success(null, '大类已删除'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

// ── 分类 ─────────────────────────────────────────────

adminSourceRoutes.post('/categories', validateBody(schemas.sources.createCategory), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createCategory>;
  try {
    const created = await createSystemCategory(c.env.DB, body);
    invalidateSystemDictionary();
    return c.json(success(toCategoryDto(created), '分类创建成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

adminSourceRoutes.put('/categories/:id', validateBody(schemas.sources.updateCategory), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateCategory>;
  try {
    await updateSystemCategory(c.env.DB, c.req.param('id'), body);
    invalidateSystemDictionary();
    return c.json(success(null, '分类更新成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

adminSourceRoutes.delete('/categories/:id', async (c) => {
  try {
    await deleteSystemCategory(c.env.DB, c.req.param('id'));
    invalidateSystemDictionary();
    return c.json(success(null, '分类已删除'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

// ── 搜索源 ───────────────────────────────────────────

adminSourceRoutes.post('/sources', validateBody(schemas.sources.createSource), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createSource>;
  try {
    const created = await createSystemSource(c.env.DB, body);
    return c.json(success(toSourceDto(created), '搜索源创建成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

adminSourceRoutes.put('/sources/:id', validateBody(schemas.sources.updateSource), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateSource>;
  try {
    await updateSystemSource(c.env.DB, c.req.param('id'), body);
    return c.json(success(null, '搜索源更新成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

adminSourceRoutes.delete('/sources/:id', async (c) => {
  try {
    await deleteSystemSource(c.env.DB, c.req.param('id'));
    return c.json(success(null, '搜索源已删除'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});
