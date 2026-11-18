/**
 * zod 校验入口：共享契约直接透传 @codeseek/shared/schemas，本文件只补后端独有 schema。
 *
 * 约束：共享 schema 是前后端唯一事实来源，改动必须两端同步验证。
 */
import { z } from 'zod';
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '@/types';
import { VALIDATION_RULES } from '@/constants';
import { schemas as sharedSchemas } from '@codeseek/shared/schemas';

// 校验中间件写入的上下文变量，供 handler 通过 c.get('validatedBody'/'validatedQuery') 读取
declare module 'hono' {
  interface ContextVariableMap {
    validatedBody: unknown;
    validatedQuery: unknown;
  }
}

const R = VALIDATION_RULES;

// ── 仅后端使用的 schema（前端没有调用方或对应输入） ─────
const backendOnlySchemas = {
  auth: {
    // smart-send-code 没有前端调用方
    sendVerificationCode: z.object({
      email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
      verificationType: z.enum(['registration', 'password_reset', 'email_change_old', 'email_change_new', 'account_delete']),
      force: z.boolean().optional(),
    }),
  },

  user: {
    // 搜索历史由搜索接口在后端直接写入，前端没有单独的保存调用
    addSearchHistory: z.object({
      query: z.string()
        .min(R.KEYWORD.MIN_LENGTH, '搜索关键词不能为空')
        .max(R.KEYWORD.MAX_LENGTH, `关键词最多${R.KEYWORD.MAX_LENGTH}个字符`),
      source: z.string().max(100).optional(),
      resultsCount: z.number().int().min(0).optional(),
      title: z.string().optional().nullable(),
      subtitle: z.string().optional().nullable(),
      code: z.string().optional().nullable(),
      actors: z.string().optional().nullable(),
      duration: z.string().optional().nullable(),
      tags: z.string().optional().nullable(),
      releaseDate: z.string().optional().nullable(),
      publisher: z.string().optional().nullable(),
      keyword: z.string().optional().nullable(),
    }),
  },

  community: {
    // 前端没有更新标签的调用
    updateTag: z.object({
      name: z.string().min(R.TAG.NAME_MIN_LENGTH).max(R.TAG.NAME_MAX_LENGTH).optional(),
      description: z.string().max(R.TAG.DESCRIPTION_MAX_LENGTH).optional().nullable(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      isActive: z.boolean().optional(),
    }),

    // 前端没有帖子状态变更入口
    updatePostStatus: z.object({
      // 社区没有审核流：只有正常展示与管理员隐藏两种状态
      status: z.enum(['active', 'hidden']),
    }),
  },

  system: {
    // 前端定义了 recordAction 调用但没有任何调用点
    recordAction: z.object({
      userId: z.string().optional(),
      action: z.string().min(1, '行为类型不能为空').max(50),
      data: z.record(z.string(), z.unknown()).optional(),
    }),
  },

  config: {
    // 前端仅使用单条更新与导入，没有批量更新调用
    batchUpdateConfig: z.object({
      configs: z.array(z.object({
        key: z.string().min(1),
        value: z.string(),
      })).min(1, '配置列表不能为空'),
      changeReason: z.string().max(500).optional(),
    }),
  },

  rankings: {
    // 榜单导入由后端任务调用
    import: z.object({
      source: z.enum(['javdb']),
      section: z.enum(['censored', 'uncensored', 'western', 'fc2', 'all']),
      period: z.enum(['weekly', 'monthly', 'top250', 'yearly']),
      year: z.number().int().min(1900).max(2100).optional(),
      fetchedAt: z.number().int().optional(),
      items: z.array(z.object({
        code: z.string().min(1).max(40),
        title: z.string().max(1000).optional(),
        cover: z.string().max(500).optional(),
        rank: z.number().int().min(1).max(500).optional(),
        score: z.union([z.number(), z.string().max(20)]).optional(),
        url: z.string().max(500).optional(),
      })).min(1).max(300),
    }),
  },

  dataStorage: {
    // 封面回填：分钟通道（加速）、小时通道（日常）与共享批次大小，仅管理端调用
    updateCoverBackfill: z
      .object({
        enabled: z.boolean().optional(),
        hourlyEnabled: z.boolean().optional(),
        batchSize: z.number().int().min(1).max(100).optional(),
      })
      .refine(
        (value) =>
          value.enabled !== undefined ||
          value.hourlyEnabled !== undefined ||
          value.batchSize !== undefined,
        { message: '至少提供 enabled、hourlyEnabled 或 batchSize' }
      ),
  },

  follows: {
    // 即将发售同步：GitHub Actions 从 JavDB 拉取后回传
    importUpcoming: z.object({
      fetchedAt: z.number().int().optional(),
      targets: z.array(z.object({
        watchKey: z.string().min(1).max(200),
        entityType: z.enum(['actress', 'director', 'studio', 'series', 'label', 'tag']).optional(),
        ok: z.boolean(),
        javdbEntityId: z.string().max(64).optional(),
        error: z.string().max(300).optional(),
        works: z.array(z.object({
          code: z.string().min(1).max(40),
          title: z.string().max(1000).optional(),
          cover: z.string().max(500).optional(),
          releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })).max(50).optional(),
      })).min(1).max(20),
    }),
  },

  pagination: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    pageSize: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional(),
  }),
};

// 同名分组以后端 schema 合并覆盖共享 schema，保持 schemas.xxx.yyy 的访问方式不变
export const schemas = {
  ...sharedSchemas,
  auth: { ...sharedSchemas.auth, ...backendOnlySchemas.auth },
  user: { ...sharedSchemas.user, ...backendOnlySchemas.user },
  community: { ...sharedSchemas.community, ...backendOnlySchemas.community },
  system: { ...sharedSchemas.system, ...backendOnlySchemas.system },
  config: { ...sharedSchemas.config, ...backendOnlySchemas.config },
  rankings: backendOnlySchemas.rankings,
  dataStorage: backendOnlySchemas.dataStorage,
  follows: backendOnlySchemas.follows,
  pagination: backendOnlySchemas.pagination,
};

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

/** 直接校验任意数据，返回全部 issue 的中文 message；供非 HTTP 流程复用。 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  try {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    const errors = result.error.issues.map(e => e.message);
    return { success: false, errors };
  } catch {
    return { success: false, errors: ['验证失败'] };
  }
}

/** 校验 JSON 请求体并写入 c.get('validatedBody')；解析失败与校验失败都返回 400。 */
export function validateBody<T>(schema: z.ZodSchema<T>): MiddlewareHandler {
  return async (c, next) => {
    try {
      const body = await c.req.json();
      const result = schema.safeParse(body);

      if (!result.success) {
        const errors = result.error.issues.map(e => e.message);
        return c.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: errors.join('; '),
            details: result.error.issues,
          },
        }, 400);
      }

      c.set('validatedBody', result.data);
      await next();
    } catch {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求体解析失败',
        },
      }, 400);
    }
  };
}

/** 校验 query 参数并写入 c.get('validatedQuery')。 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return async (c: Context<{ Bindings: Env; Variables: Record<string, unknown> }>, next: () => Promise<void>) => {
    const query = c.req.query();
    const result = schema.safeParse(query);

    if (!result.success) {
      const errors = result.error.issues.map(e => e.message);
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
        },
      }, 400);
    }

    c.set('validatedQuery', result.data);
    await next();
  };
}
