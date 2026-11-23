/**
 * 搜索源共享读取与用户私有树路由。
 *
 * 约束：系统树只读；用户只能读写 owner_id = 自己 的私有节点；
 * 系统源的启停与自定义展示走用户配置，不修改系统源本身。
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { Env, SearchSource, UserSearchSourceConfig } from '@/types';
import { success, error, escapeLikePattern } from '@/utils';
import { toMajorCategoryDto, toCategoryDto, toSourceDto } from '@/utils/source-dto';
import { csvCell, xmlAttr } from '@/utils/source-export';
import { cached } from '@/utils/cache';
import { authMiddleware } from '@/middleware/auth';
import { VALIDATION_RULES } from '@/constants';
import { validateBody, schemas } from '@/validation';
import {
  listSystemMajorCategories,
  listSystemCategories,
  listSourceCatalog,
  listSystemSourcesWithConfig,
  listUserSources,
  listUserMajorCategories,
  listUserCategories,
  findVisibleSourceById,
  findVisibleSourceDetail,
  incrementSourceUsage,
  bumpUserSourceRevision,
  type SourceCatalogRow,
} from '@/repositories/search-source-repository';
import {
  getUserSourceStats,
  getUserVisibleBoardStats,
  getUserVisibleSourceBreakdown,
  findLatestSourceStatus,
} from '@/repositories/search-source-management-repository';
import {
  findUserSourceConfig,
  upsertUserSourceConfig,
  deleteUserSourceConfig,
} from '@/repositories/user-source-config-repository';
import {
  SourceTreeError,
  getUserTree,
  createUserMajorCategory,
  updateUserMajorCategory,
  deleteUserMajorCategory,
  createUserCategory,
  updateUserCategory,
  deleteUserCategory,
  createUserSource,
  updateUserSource,
  deleteUserSource,
} from '@/services/source-tree-service';

const R = VALIDATION_RULES;

export const sourceRoutes = new Hono<{ Bindings: Env }>();

sourceRoutes.use('*', authMiddleware);

// ── 序列化 ───────────────────────────────────────────

/** 兼容旧 catalog 契约：保留 snake_case 源字段 + camelCase 分类别名 */
function toCatalogItem(row: SourceCatalogRow) {
  const {
    category_name,
    category_icon,
    category_color,
    major_category_id,
    major_category_name,
    config_id,
    config_is_enabled,
    config_custom_priority,
    config_custom_name,
    config_custom_subtitle,
    config_custom_icon,
    config_notes,
    ...source
  } = row;

  return {
    ...source,
    categoryName: category_name,
    categoryIcon: category_icon,
    categoryColor: category_color,
    majorCategoryId: major_category_id,
    majorCategoryName: major_category_name,
    enabled: config_is_enabled !== 0,
    userConfig: config_id
      ? {
          id: config_id,
          user_id: '',
          source_id: source.id,
          is_enabled: config_is_enabled ?? 1,
          custom_priority: config_custom_priority,
          custom_name: config_custom_name,
          custom_subtitle: config_custom_subtitle,
          custom_icon: config_custom_icon,
          notes: config_notes,
        }
      : null,
  };
}

/** 服务层错误 → 统一响应 */
function respondServiceError(c: Context<{ Bindings: Env }>, err: unknown) {
  if (err instanceof SourceTreeError) {
    return c.json(error(err.code, err.message), err.status);
  }
  throw err;
}

// ── 系统字典 ─────────────────────────────────────────

sourceRoutes.get('/major-categories', async (c) => {
  try {
    const categories = await cached('sources:dict:system:majors', 5 * 60_000, () =>
      listSystemMajorCategories(c.env.DB)
    );
    return c.json(success({ categories }));
  } catch (err) {
    console.error('Get major categories error:', err);
    return c.json(error('SERVER_ERROR', '获取主分类失败'), 500);
  }
});

sourceRoutes.get('/categories', async (c) => {
  try {
    const majorCategoryId = c.req.query('majorCategoryId');
    const categories = await cached(
      `sources:dict:system:categories:${majorCategoryId || 'all'}`,
      5 * 60_000,
      () => listSystemCategories(c.env.DB, majorCategoryId)
    );
    return c.json(success({ categories }));
  } catch (err) {
    console.error('Get categories error:', err);
    return c.json(error('SERVER_ERROR', '获取分类失败'), 500);
  }
});

// ── 用户源站树 ───────────────────────────────────────

sourceRoutes.get('/tree', async (c) => {
  const user = c.get('user');
  try {
    const tree = await getUserTree(c.env.DB, user.userId);
    return c.json(success({
      system: {
        majorCategories: tree.system.majorCategories.map(toMajorCategoryDto),
        categories: tree.system.categories.map(toCategoryDto),
        sources: tree.system.sources.map((source) => ({
          ...toSourceDto(source),
          enabled: source.enabled,
          userConfig: mapUserConfig(source.userConfig),
        })),
      },
      mine: {
        majorCategories: tree.mine.majorCategories.map(toMajorCategoryDto),
        categories: tree.mine.categories.map(toCategoryDto),
        sources: tree.mine.sources.map(toSourceDto),
      },
      stats: tree.stats,
    }));
  } catch (err) {
    console.error('Get source tree error:', err);
    return c.json(error('SERVER_ERROR', '获取源站树失败'), 500);
  }
});

// ── 目录与统计 ───────────────────────────────────────

sourceRoutes.get('/catalog', async (c) => {
  const user = c.get('user');
  try {
    const keyword = (c.req.query('keyword') || '').trim();
    const majorCategoryId = c.req.query('majorCategoryId');
    const categoryId = c.req.query('categoryId');
    const siteType = c.req.query('siteType');
    const searchable = c.req.query('searchable');
    const scope = c.req.query('scope') || 'all';
    const sort = c.req.query('sort') || 'default';

    const pageSize = Math.min(
      Math.max(
        1,
        parseInt(c.req.query('pageSize') || String(R.PAGINATION.DEFAULT_PAGE_SIZE), 10)
          || R.PAGINATION.DEFAULT_PAGE_SIZE
      ),
      R.PAGINATION.MAX_PAGE_SIZE
    );
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);

    const { items, total } = await listSourceCatalog(c.env.DB, {
      userId: user.userId,
      keyword: keyword || undefined,
      majorCategoryId: majorCategoryId || undefined,
      categoryId: categoryId || undefined,
      siteType: siteType || undefined,
      searchable: searchable === undefined ? undefined : searchable === 'true',
      scope,
      sort,
      page,
      pageSize,
      escapeLikePattern,
    });

    return c.json(success({
      items: items.map(toCatalogItem),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }));
  } catch (err) {
    console.error('Get source catalog error:', err);
    return c.json(error('SERVER_ERROR', '获取源目录失败'), 500);
  }
});

sourceRoutes.get('/stats', async (c) => {
  const user = c.get('user');
  try {
    const [board, userStats, breakdown] = await Promise.all([
      getUserVisibleBoardStats(c.env.DB, user.userId),
      getUserSourceStats(c.env.DB, user.userId),
      getUserVisibleSourceBreakdown(c.env.DB, user.userId),
    ]);

    return c.json(success({
      totalSources: board.totalSources,
      searchableSources: board.searchableSources,
      enabledSources: board.enabledSources,
      availableSources: board.availableSources,
      totalCategories: board.totalCategories,
      totalMajorCategories: board.totalMajorCategories,
      ...breakdown,
      ...userStats,
    }));
  } catch (err) {
    console.error('Get sources stats error:', err);
    return c.json(error('SERVER_ERROR', '获取统计失败'), 500);
  }
});

// ── 导出 ─────────────────────────────────────────────

/** 导出当前用户私有源；系统源通过源看板单独浏览 */
async function buildUserExport(c: {
  env: Env;
  req: { query: (key: string) => string | undefined };
  json: (body: unknown) => Response;
}, userId: string): Promise<Response> {
  const format = c.req.query('format') || 'json';
  const [sources, categories, majors] = await Promise.all([
    listUserSources(c.env.DB, userId),
    listUserCategories(c.env.DB, userId),
    listUserMajorCategories(c.env.DB, userId),
  ]);
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const majorMap = new Map(majors.map(major => [major.id, major]));

  const rows = sources.map(source => {
    const category = categoryMap.get(source.category_id);
    const major = category ? majorMap.get(category.major_category_id) : undefined;
    return {
      ...source,
      category_name: category?.name || '',
      major_category_name: major?.name || '',
    };
  });

  if (format === 'csv') {
    const headers = ['ID', '名称', '副标题', 'URL模板', '分类', '大类', '站点类型', '搜索优先级', '使用次数', '是否可搜索'];
    const csvRows = rows.map(row => [
      row.id,
      row.name,
      row.subtitle || '',
      row.url_template,
      row.category_name,
      row.major_category_name,
      row.site_type,
      String(row.search_priority),
      String(row.usage_count),
      row.searchable ? '是' : '否',
    ]);
    const csv = [headers.map(csvCell).join(','), ...csvRows.map(row => row.map(csvCell).join(','))].join('\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="my-search-sources.csv"',
      },
    });
  }

  if (format === 'opml') {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Atlas 我的搜索源</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
  </head>
  <body>
${rows.map(row => `    <outline type="link" text="${xmlAttr(row.name)}" htmlUrl="${xmlAttr(row.url_template)}" description="${xmlAttr(row.subtitle)}" category="${xmlAttr(row.category_name)}"/>`).join('\n')}
  </body>
</opml>`;
    return new Response(opml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': 'attachment; filename="my-search-sources.opml"',
      },
    });
  }

  return c.json(success({
    sources: rows,
    exportedAt: Date.now(),
    count: rows.length,
  }));
}

sourceRoutes.get('/mine/export', async (c) => {
  const user = c.get('user');
  try {
    return await buildUserExport(c, user.userId);
  } catch (err) {
    console.error('Export my sources error:', err);
    return c.json(error('SERVER_ERROR', '导出失败'), 500);
  }
});

// ── 兼容旧读取接口 ───────────────────────────────────

sourceRoutes.get('/with-user-config/:userId', async (c) => {
  const user = c.get('user');
  const requestedUserId = c.req.param('userId');
  if (requestedUserId !== user.userId) {
    return c.json(error('FORBIDDEN', '无权访问他人配置'), 403);
  }

  try {
    const [systemSources, mySources] = await Promise.all([
      listSystemSourcesWithConfig(c.env.DB, user.userId),
      listUserSources(c.env.DB, user.userId),
    ]);
    return c.json(success({
      sources: [
        ...systemSources,
        ...mySources.map(source => ({ ...source, enabled: true, userConfig: null })),
      ],
    }));
  } catch (err) {
    console.error('Get sources with user config error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索源失败'), 500);
  }
});

// ── 用户私有树写操作 ─────────────────────────────────

sourceRoutes.post('/mine/major-categories', validateBody(schemas.sources.createMajorCategory), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createMajorCategory>;
  try {
    const created = await createUserMajorCategory(c.env.DB, user.userId, body);
    return c.json(success(toMajorCategoryDto(created), '大类创建成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

sourceRoutes.put('/mine/major-categories/:id', validateBody(schemas.sources.updateMajorCategory), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateMajorCategory>;
  try {
    await updateUserMajorCategory(c.env.DB, user.userId, c.req.param('id'), body);
    return c.json(success(null, '大类更新成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

sourceRoutes.delete('/mine/major-categories/:id', async (c) => {
  const user = c.get('user');
  try {
    await deleteUserMajorCategory(c.env.DB, user.userId, c.req.param('id'));
    return c.json(success(null, '大类已删除'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

sourceRoutes.post('/mine/categories', validateBody(schemas.sources.createCategory), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createCategory>;
  try {
    const created = await createUserCategory(c.env.DB, user.userId, body);
    return c.json(success(toCategoryDto(created), '分类创建成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

sourceRoutes.put('/mine/categories/:id', validateBody(schemas.sources.updateCategory), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateCategory>;
  try {
    await updateUserCategory(c.env.DB, user.userId, c.req.param('id'), body);
    return c.json(success(null, '分类更新成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

sourceRoutes.delete('/mine/categories/:id', async (c) => {
  const user = c.get('user');
  try {
    await deleteUserCategory(c.env.DB, user.userId, c.req.param('id'));
    return c.json(success(null, '分类已删除'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

sourceRoutes.post('/mine/sources', validateBody(schemas.sources.createSource), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.createSource>;
  try {
    const created = await createUserSource(c.env.DB, user.userId, body);
    return c.json(success(toSourceDto(created), '搜索源创建成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

sourceRoutes.put('/mine/sources/:id', validateBody(schemas.sources.updateSource), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.updateSource>;
  try {
    await updateUserSource(c.env.DB, user.userId, c.req.param('id'), body);
    return c.json(success(null, '搜索源更新成功'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

sourceRoutes.delete('/mine/sources/:id', async (c) => {
  const user = c.get('user');
  try {
    await deleteUserSource(c.env.DB, user.userId, c.req.param('id'));
    return c.json(success(null, '搜索源已删除'));
  } catch (err) {
    return respondServiceError(c, err);
  }
});

// ── 兼容旧写接口：只允许写用户私有源 ─────────────────

// ── 用户配置 ─────────────────────────────────────────

sourceRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('id');
  try {
    const source = await findVisibleSourceDetail(c.env.DB, sourceId, user.userId);
    if (!source) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }

    const [userConfig, statusCache] = await Promise.all([
      findUserSourceConfig(c.env.DB, user.userId, sourceId),
      findLatestSourceStatus(c.env.DB, sourceId),
    ]);

    const {
      category_name,
      category_icon,
      category_color,
      major_category_id,
      major_category_name,
      ...sourceFields
    } = source;

    return c.json(success({
      source: {
        ...toSourceDto(sourceFields as SearchSource),
        categoryName: category_name,
        categoryIcon: category_icon,
        categoryColor: category_color,
        majorCategoryId: major_category_id,
        majorCategoryName: major_category_name,
      },
      categoryPath: [
        { id: major_category_id, name: major_category_name || '', type: 'major' as const },
        { id: source.category_id, name: category_name || '', type: 'category' as const },
      ],
      // 个人源没有启停语义，避免历史配置行把已删除/停用状态带到 UI
      enabled: sourceFields.owner_id !== null ? true : (userConfig ? userConfig.is_enabled !== 0 : true),
      userConfig: userConfig || null,
      status: statusCache
        ? {
            status: statusCache.status,
            available: statusCache.available === 1,
            responseTime: statusCache.response_time,
            error: statusCache.check_error,
            checkedAt: statusCache.created_at,
          }
        : null,
    }));
  } catch (err) {
    console.error('Get source error:', err);
    return c.json(error('SERVER_ERROR', '获取搜索源失败'), 500);
  }
});

sourceRoutes.post('/:id/increment-usage', async (c) => {
  const user = c.get('user');
  const sourceId = c.req.param('id');
  try {
    const source = await findVisibleSourceById(c.env.DB, sourceId, user.userId);
    if (!source) {
      return c.json(error('NOT_FOUND', '搜索源不存在'), 404);
    }
    await incrementSourceUsage(c.env.DB, sourceId);
    return c.json(success(null, '使用次数已更新'));
  } catch (err) {
    console.error('Increment usage error:', err);
    return c.json(error('SERVER_ERROR', '更新失败'), 500);
  }
});

sourceRoutes.post('/user-configs/batch', validateBody(schemas.sources.batchUpdateUserConfigs), async (c) => {
  const user = c.get('user');
  const body = c.get('validatedBody') as z.infer<typeof schemas.sources.batchUpdateUserConfigs>;
  try {
    const now = Date.now();
    let updatedCount = 0;
    for (const config of body.configs) {
      // 个人源没有启停/自定义语义，跳过而不是写入无效配置行
      const source = await findVisibleSourceById(c.env.DB, config.sourceId, user.userId);
      if (!source || source.owner_id !== null) continue;
      await upsertUserSourceConfig(c.env.DB, user.userId, config.sourceId, {
        isEnabled: config.isEnabled,
        customPriority: config.customPriority,
        customName: config.customName?.trim() || null,
        customSubtitle: config.customSubtitle?.trim() || null,
        customIcon: config.customIcon?.trim() || null,
        notes: config.notes?.trim() || null,
      }, now);
      updatedCount++;
    }
    await bumpUserSourceRevision(c.env.DB, user.userId);
    return c.json(success({ updatedCount }, '批量更新成功'));
  } catch (err) {
    console.error('Batch update user configs error:', err);
    return c.json(error('SERVER_ERROR', '批量更新失败'), 500);
  }
});

sourceRoutes.delete('/user-configs/:sourceId', async (c) => {
  const user = c.get('user');
  try {
    const deleted = await deleteUserSourceConfig(c.env.DB, user.userId, c.req.param('sourceId'));
    if (!deleted) {
      return c.json(error('NOT_FOUND', '配置不存在'), 404);
    }
    await bumpUserSourceRevision(c.env.DB, user.userId);
    return c.json(success(null, '配置已删除'));
  } catch (err) {
    console.error('Delete user config error:', err);
    return c.json(error('SERVER_ERROR', '删除配置失败'), 500);
  }
});

/** 用户配置映射，供旧前端读取 */
export function mapUserConfig(config: UserSearchSourceConfig | null) {
  if (!config) return null;
  return {
    id: config.id,
    userId: config.user_id,
    sourceId: config.source_id,
    isEnabled: config.is_enabled === 1,
    customPriority: config.custom_priority,
    customName: config.custom_name,
    customSubtitle: config.custom_subtitle,
    customIcon: config.custom_icon,
    notes: config.notes,
  };
}
