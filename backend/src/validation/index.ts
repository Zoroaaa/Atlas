/**
 * 请求参数验证模块
 * 功能：使用Zod进行请求参数schema验证
 * 说明：所有验证规则统一从 constants.ts 的 VALIDATION_RULES 导入
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { z } from 'zod';
import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '@/types';
import { VALIDATION_RULES, CONFIG } from '@/constants';

// 校验中间件写入的上下文变量，供 handler 通过 c.get('validatedBody'/'validatedQuery') 读取
declare module 'hono' {
  interface ContextVariableMap {
    validatedBody: unknown;
    validatedQuery: unknown;
  }
}

const R = VALIDATION_RULES;

export const schemas = {
  auth: {
    login: z.object({
      identifier: z.string().min(1, '请输入用户名/邮箱').max(R.EMAIL.MAX_LENGTH),
      password: z.string().min(1, '请输入密码'),
    }),

    register: z.object({
      username: z.string()
        .min(R.USERNAME.MIN_LENGTH, `用户名至少${R.USERNAME.MIN_LENGTH}个字符`)
        .max(R.USERNAME.MAX_LENGTH, `用户名最多${R.USERNAME.MAX_LENGTH}个字符`)
        .regex(CONFIG.VALIDATION.USERNAME_REGEX, '用户名只能包含字母、数字和下划线'),
      email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
      password: z.string()
        .min(R.PASSWORD.MIN_LENGTH, `密码至少${R.PASSWORD.MIN_LENGTH}个字符`)
        .max(R.PASSWORD.MAX_LENGTH, `密码最多${R.PASSWORD.MAX_LENGTH}个字符`),
      // 注册验证码：强制邮箱验证后才能注册（必填，缺失即 400）
      verificationCode: z.string({ error: '请输入邮箱验证码' }).length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
    }),

    forgotPassword: z.object({
      email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
    }),

    resetPassword: z.object({
      email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
      verificationCode: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
      code: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`).optional(),
      newPassword: z.string()
        .min(R.PASSWORD.MIN_LENGTH, `密码至少${R.PASSWORD.MIN_LENGTH}个字符`)
        .max(R.PASSWORD.MAX_LENGTH, `密码最多${R.PASSWORD.MAX_LENGTH}个字符`),
    }),

    changePassword: z.object({
      currentPassword: z.string().min(1, '请输入当前密码'),
      newPassword: z.string()
        .min(R.PASSWORD.MIN_LENGTH, `新密码至少${R.PASSWORD.MIN_LENGTH}个字符`)
        .max(R.PASSWORD.MAX_LENGTH, `新密码最多${R.PASSWORD.MAX_LENGTH}个字符`),
    }),

    deleteAccount: z.object({
      verificationCode: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
      confirmText: z.string().min(1, '请输入确认文字'),
      password: z.string().min(1, '请输入密码确认删除'),
    }),

    sendVerificationCode: z.object({
      email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
      verificationType: z.enum(['registration', 'password_reset', 'email_change_old', 'email_change_new', 'account_delete']),
      force: z.boolean().optional(),
    }),

    requestEmailChange: z.object({
      newEmail: z.string().email('请输入有效的新邮箱地址').max(R.EMAIL.MAX_LENGTH),
      currentPassword: z.string().min(1, '请输入当前密码'),
    }),

    verifyEmailChangeCode: z.object({
      requestId: z.string().min(1, '请求ID不能为空'),
      emailType: z.enum(['old', 'new']),
      code: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
    }),

    sendRegistrationCode: z.object({
      email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
    }),

    sendEmailChangeCode: z.object({
      requestId: z.string().min(1, '请求ID不能为空'),
      emailType: z.enum(['old', 'new']),
    }),

    cancelEmailChangeRequest: z.object({
      requestId: z.string().min(1, '请求ID不能为空'),
    }),
  },

  user: {
    updateSettings: z.object({
      settings: z.record(z.string(), z.unknown()),
    }),

    addFavorite: z.object({
      title: z.string().min(1, '标题不能为空').max(R.FAVORITES.TITLE_MAX_LENGTH, `标题最多${R.FAVORITES.TITLE_MAX_LENGTH}个字符`),
      subtitle: z.string().max(R.FAVORITES.SUBTITLE_MAX_LENGTH, `副标题最多${R.FAVORITES.SUBTITLE_MAX_LENGTH}个字符`).optional().nullable(),
      url: z.string().url('请输入有效的URL').max(R.FAVORITES.URL_MAX_LENGTH, `URL最多${R.FAVORITES.URL_MAX_LENGTH}个字符`),
      icon: z.string().max(R.FAVORITES.ICON_MAX_LENGTH, `图标最多${R.FAVORITES.ICON_MAX_LENGTH}个字符`).optional().nullable(),
      keyword: z.string().max(R.KEYWORD.MAX_LENGTH, `关键词最多${R.KEYWORD.MAX_LENGTH}个字符`).optional(),
      code: z.string().max(200).optional().nullable(),
      cover: z.string().max(2000).optional().nullable(),
      actors: z.string().max(2000).optional().nullable(),
      duration: z.string().max(200).optional().nullable(),
      tags: z.string().max(2000).optional().nullable(),
      releaseDate: z.string().max(200).optional().nullable(),
      publisher: z.string().max(500).optional().nullable(),
      magnetLink: z.string().max(2000).optional().nullable(),
      status: z.string().max(50).optional(),
    }),

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

    updateSearchHistory: z.object({
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

    batchDeleteSearchHistory: z.object({
      ids: z.array(z.string()).min(1, '请提供要删除的历史记录ID').max(100, '一次最多删除100条记录'),
    }),

    updateFavoriteStatus: z.object({
      status: z.enum(['want', 'watched'], { message: '状态必须是 want 或 watched' }),
    }),

    updateSourceConfig: z.object({
      isEnabled: z.boolean().optional(),
      customPriority: z.number().int().min(1).max(10).optional().nullable(),
      customName: z.string().max(R.USER_CONFIG.CUSTOM_NAME_MAX_LENGTH).optional().nullable(),
      customSubtitle: z.string().max(R.USER_CONFIG.CUSTOM_SUBTITLE_MAX_LENGTH).optional().nullable(),
      customIcon: z.string().max(R.USER_CONFIG.CUSTOM_ICON_MAX_LENGTH).optional().nullable(),
      notes: z.string().max(R.USER_CONFIG.NOTES_MAX_LENGTH).optional().nullable(),
    }),
  },

  search: {
    search: z.object({
      keyword: z.string()
        .min(R.KEYWORD.MIN_LENGTH, '搜索关键词不能为空')
        .max(R.KEYWORD.MAX_LENGTH, `关键词最多${R.KEYWORD.MAX_LENGTH}个字符`),
      majorCategoryId: z.string().min(1).max(100).optional(),
      javSubMode: z.enum(['code', 'actress', 'title']).optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).optional(),
    }),
  },

  sources: {
    createMajorCategory: z.object({
      name: z.string()
        .min(1, '大类名称不能为空')
        .max(R.MAJOR_CATEGORY.NAME_MAX_LENGTH, `大类名称最多${R.MAJOR_CATEGORY.NAME_MAX_LENGTH}个字符`),
      description: z.string().max(R.MAJOR_CATEGORY.DESCRIPTION_MAX_LENGTH).optional(),
      icon: z.string().max(R.MAJOR_CATEGORY.ICON_MAX_LENGTH).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式不正确').optional(),
    }),

    updateMajorCategory: z.object({
      name: z.string().min(1).max(R.MAJOR_CATEGORY.NAME_MAX_LENGTH).optional(),
      description: z.string().max(R.MAJOR_CATEGORY.DESCRIPTION_MAX_LENGTH).optional().nullable(),
      icon: z.string().max(R.MAJOR_CATEGORY.ICON_MAX_LENGTH).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      displayOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    }),

    createCategory: z.object({
      majorCategoryId: z.string().min(1, '大类ID不能为空'),
      name: z.string()
        .min(1, '分类名称不能为空')
        .max(R.CATEGORY.NAME_MAX_LENGTH, `分类名称最多${R.CATEGORY.NAME_MAX_LENGTH}个字符`),
      description: z.string().max(R.CATEGORY.DESCRIPTION_MAX_LENGTH).optional(),
      icon: z.string().max(R.CATEGORY.ICON_MAX_LENGTH).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      defaultSearchable: z.boolean().optional(),
      defaultSiteType: z.enum(['search', 'browse', 'reference']).optional(),
      searchPriority: z.number().int().min(0).max(10).optional(),
    }),

    updateCategory: z.object({
      name: z.string().min(1).max(R.CATEGORY.NAME_MAX_LENGTH).optional(),
      description: z.string().max(R.CATEGORY.DESCRIPTION_MAX_LENGTH).optional().nullable(),
      icon: z.string().max(R.CATEGORY.ICON_MAX_LENGTH).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      defaultSearchable: z.boolean().optional(),
      defaultSiteType: z.enum(['search', 'browse', 'reference']).optional(),
      searchPriority: z.number().int().min(0).max(10).optional(),
    }),

    createSource: z.object({
      categoryId: z.string().min(1, '分类ID不能为空'),
      name: z.string().min(1, '搜索源名称不能为空').max(R.SOURCE.NAME_MAX_LENGTH),
      subtitle: z.string().max(R.SOURCE.SUBTITLE_MAX_LENGTH).optional().nullable(),
      description: z.string().max(R.SOURCE.DESCRIPTION_MAX_LENGTH).optional().nullable(),
      icon: z.string().max(R.SOURCE.ICON_MAX_LENGTH).optional(),
      urlTemplate: z.string()
        .min(1, 'URL模板不能为空')
        .max(R.SOURCE.URL_MAX_LENGTH)
        .regex(/^https?:\/\/.+/, 'URL模板格式不正确'),
      homepageUrl: z.union([z.string().url('主页URL格式不正确').max(R.SOURCE.URL_MAX_LENGTH), z.literal('')]).optional().nullable(),
      siteType: z.enum(['search', 'browse', 'reference']).optional(),
      searchable: z.boolean().optional(),
      searchPriority: z.number().int().min(0).max(10).optional(),
    }),

    updateSource: z.object({
      categoryId: z.string().optional(),
      name: z.string().min(1).max(R.SOURCE.NAME_MAX_LENGTH).optional(),
      subtitle: z.string().max(R.SOURCE.SUBTITLE_MAX_LENGTH).optional().nullable(),
      description: z.string().max(R.SOURCE.DESCRIPTION_MAX_LENGTH).optional().nullable(),
      icon: z.string().max(R.SOURCE.ICON_MAX_LENGTH).optional(),
      urlTemplate: z.string().regex(/^https?:\/\/.+/).max(R.SOURCE.URL_MAX_LENGTH).optional(),
      homepageUrl: z.union([z.string().url().max(R.SOURCE.URL_MAX_LENGTH), z.literal('')]).optional().nullable(),
      siteType: z.enum(['search', 'browse', 'reference']).optional(),
      searchable: z.boolean().optional(),
      searchPriority: z.number().int().min(0).max(10).optional(),
    }),

    batchUpdateUserConfigs: z.object({
      configs: z.array(z.object({
        sourceId: z.string().min(1),
        isEnabled: z.boolean().optional(),
        customPriority: z.number().int().min(1).max(10).optional().nullable(),
        customName: z.string().max(R.USER_CONFIG.CUSTOM_NAME_MAX_LENGTH).optional().nullable(),
        customSubtitle: z.string().max(R.USER_CONFIG.CUSTOM_SUBTITLE_MAX_LENGTH).optional().nullable(),
        customIcon: z.string().max(R.USER_CONFIG.CUSTOM_ICON_MAX_LENGTH).optional().nullable(),
        notes: z.string().max(R.USER_CONFIG.NOTES_MAX_LENGTH).optional().nullable(),
      })).min(1, '配置列表不能为空').max(R.USER_CONFIG.BATCH_UPDATE_MAX_COUNT, `批量更新不能超过${R.USER_CONFIG.BATCH_UPDATE_MAX_COUNT}个配置`),
    }),
  },

  community: {
    createTag: z.object({
      name: z.string()
        .min(R.TAG.NAME_MIN_LENGTH, `标签名称至少${R.TAG.NAME_MIN_LENGTH}个字符`)
        .max(R.TAG.NAME_MAX_LENGTH, `标签名称最多${R.TAG.NAME_MAX_LENGTH}个字符`),
      description: z.string().max(R.TAG.DESCRIPTION_MAX_LENGTH).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式不正确').optional(),
    }),

    updateTag: z.object({
      name: z.string().min(R.TAG.NAME_MIN_LENGTH).max(R.TAG.NAME_MAX_LENGTH).optional(),
      description: z.string().max(R.TAG.DESCRIPTION_MAX_LENGTH).optional().nullable(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      isActive: z.boolean().optional(),
    }),

    createPost: z.object({
      postType: z.enum(['jav', 'anime', 'movie', 'manga', 'novel', 'actress']),
      title: z.string().min(1, '标题不能为空'),
      coverImage: z.string().min(1, '封面图片不能为空'),
      contentData: z.string().min(1, '内容数据不能为空'),
      caption: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),

    updatePost: z.object({
      caption: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),

    updatePostStatus: z.object({
      status: z.enum(['active', 'pending', 'rejected', 'hidden']),
    }),

    featurePost: z.object({
      isFeatured: z.boolean(),
    }),

    createComment: z.object({
      postId: z.string().min(1, '帖子ID不能为空'),
      content: z.string().min(1, '评论内容不能为空').max(1000, '评论内容最多1000个字符'),
    }),

    reportPost: z.object({
      reason: z.string().min(1, '请提供举报原因').max(R.REPORT.REASON_MAX_LENGTH, `举报原因最多${R.REPORT.REASON_MAX_LENGTH}个字符`),
      details: z.string().max(R.REPORT.DETAILS_MAX_LENGTH).optional(),
    }),

    createSharedSource: z.object({
      sourceName: z.string()
        .min(R.SHARED_SOURCE.NAME_MIN_LENGTH, `搜索源名称至少${R.SHARED_SOURCE.NAME_MIN_LENGTH}个字符`)
        .max(R.SHARED_SOURCE.NAME_MAX_LENGTH),
      sourceSubtitle: z.string().max(R.SHARED_SOURCE.SUBTITLE_MAX_LENGTH).optional().nullable(),
      sourceIcon: z.string().max(R.SOURCE.ICON_MAX_LENGTH).optional(),
      sourceUrlTemplate: z.string()
        .min(1, 'URL模板不能为空')
        .max(R.SHARED_SOURCE.URL_MAX_LENGTH)
        .regex(/^https?:\/\/.+/, 'URL模板格式不正确'),
      sourceCategory: z.string().min(1, '分类不能为空'),
      description: z.string().max(R.SHARED_SOURCE.DESCRIPTION_MAX_LENGTH).optional(),
      tags: z.array(z.string()).max(R.TAG.MAX_COUNT_PER_SOURCE, `最多${R.TAG.MAX_COUNT_PER_SOURCE}个标签`).optional(),
    }),

    updateSharedSource: z.object({
      sourceName: z.string().min(R.SHARED_SOURCE.NAME_MIN_LENGTH).max(R.SHARED_SOURCE.NAME_MAX_LENGTH).optional(),
      sourceSubtitle: z.string().max(R.SHARED_SOURCE.SUBTITLE_MAX_LENGTH).optional().nullable(),
      sourceIcon: z.string().max(R.SOURCE.ICON_MAX_LENGTH).optional(),
      description: z.string().max(R.SHARED_SOURCE.DESCRIPTION_MAX_LENGTH).optional(),
      tags: z.array(z.string()).max(R.TAG.MAX_COUNT_PER_SOURCE).optional(),
      sourceCategory: z.string().optional(),
    }),

    createReview: z.object({
      sharedSourceId: z.string().min(1, '搜索源ID不能为空'),
      rating: z.number().int().min(1, '评分最低1分').max(5, '评分最高5分'),
      comment: z.string().max(R.REVIEW.COMMENT_MAX_LENGTH, `评论最多${R.REVIEW.COMMENT_MAX_LENGTH}个字符`).optional(),
    }),

    reportSource: z.object({
      reason: z.string().min(1, '举报原因不能为空').max(R.REPORT.REASON_MAX_LENGTH, `举报原因最多${R.REPORT.REASON_MAX_LENGTH}个字符`),
      details: z.string().max(R.REPORT.DETAILS_MAX_LENGTH).optional(),
    }),
  },

  system: {
    recordAction: z.object({
      userId: z.string().optional(),
      action: z.string().min(1, '行为类型不能为空').max(50),
      data: z.record(z.string(), z.unknown()).optional(),
    }),

    reportError: z.object({
      source: z.string().optional(),
      errorType: z.string().optional(),
      message: z.string().optional(),
      stack: z.string().optional().nullable(),
      url: z.string().optional().nullable(),
      lineNumber: z.number().optional().nullable(),
      columnNumber: z.number().optional().nullable(),
      sessionId: z.string().optional().nullable(),
      context: z.unknown().optional(),
    }),

    batchSourceStatus: z.object({
      sourceIds: z.array(z.string().min(1))
        .min(1, '请提供搜索源ID列表')
        .max(R.SOURCE_CHECK.MAX_BATCH_CHECK, `单次最多检查${R.SOURCE_CHECK.MAX_BATCH_CHECK}个搜索源`),
    }),
  },

  admin: {
    updateUserRole: z.object({
      roleId: z.string().min(1, '请指定角色'),
    }),

    updateUserStatus: z.object({
      isActive: z.boolean(),
      reason: z.string().max(500).optional(),
    }),

    updateUserPermissions: z.object({
      permissions: z.array(z.string()),
    }),

    handleReport: z.object({
      status: z.enum(['resolved', 'dismissed']),
      action: z.string().max(100).optional(),
      notes: z.string().max(2000).optional(),
    }),

    updateDataRecordStatus: z.object({
      status: z.enum(['active', 'hidden']),
    }),
  },

  config: {
    importConfig: z.object({
      configs: z.array(z.object({
        key: z.string().min(1),
        value: z.string(),
        description: z.string().optional(),
        configType: z.string().optional(),
        configGroup: z.string().optional(),
        isPublic: z.boolean().optional(),
        isSensitive: z.boolean().optional(),
      })),
      overwrite: z.boolean().optional(),
    }),

    recordAnalyticsEvent: z.object({
      userId: z.string().optional(),
      sessionId: z.string().optional().nullable(),
      eventType: z.string().min(1, '事件类型不能为空'),
      eventData: z.unknown().optional(),
      referer: z.string().optional().nullable(),
    }),

    batchUpdateConfig: z.object({
      configs: z.array(z.object({
        key: z.string().min(1),
        value: z.string(),
      })).min(1, '配置列表不能为空'),
      changeReason: z.string().max(500).optional(),
    }),

    updateConfig: z.object({
      value: z.string(),
      description: z.string().optional().nullable(),
      configType: z.string().optional().nullable(),
      configGroup: z.string().optional().nullable(),
      isPublic: z.boolean().optional().nullable(),
      isSensitive: z.boolean().optional().nullable(),
      changeReason: z.string().max(500).optional().nullable(),
    }),
  },

  announcement: {
    create: z.object({
      title: z.string().trim().min(2, '标题长度应在 2~200 个字符之间').max(200, '标题长度应在 2~200 个字符之间'),
      content: z.string().trim().min(5, '内容长度应在 5~5000 个字符之间').max(5000, '内容长度应在 5~5000 个字符之间'),
      type: z.enum(['info', 'warning', 'success', 'error']).optional(),
      isPinned: z.boolean().optional(),
      startTime: z.number().optional().nullable(),
      endTime: z.number().optional().nullable(),
    }),

    update: z.object({
      title: z.string().min(2, '标题长度应在 2~200 个字符之间').max(200, '标题长度应在 2~200 个字符之间').optional(),
      content: z.string().min(5, '内容长度应在 5~5000 个字符之间').max(5000, '内容长度应在 5~5000 个字符之间').optional(),
      type: z.enum(['info', 'warning', 'success', 'error']).optional(),
      isPinned: z.union([z.boolean(), z.number()]).optional(),
      isActive: z.union([z.boolean(), z.number()]).optional(),
      startTime: z.number().optional().nullable(),
      endTime: z.number().optional().nullable(),
    }),
  },

  feedback: {
    create: z.object({
      type: z.enum(['bug', 'suggestion', 'other'], { message: '请选择反馈类型' }),
      title: z.string().trim()
        .min(5, '标题长度应在 5~100 个字符之间')
        .max(100, '标题长度应在 5~100 个字符之间'),
      content: z.string().trim()
        .min(10, '内容长度应在 10~2000 个字符之间')
        .max(2000, '内容长度应在 10~2000 个字符之间'),
      contactEmail: z.string().optional().nullable(),
      pageUrl: z.string().optional().nullable(),
      priority: z.string().optional(),
      email: z.string().optional(),
      screenshots: z.string().optional(),
    }),

    update: z.object({
      status: z.enum(['pending', 'processing', 'resolved', 'closed']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      adminReply: z.string().optional(),
      adminNotes: z.string().optional(),
      sendEmail: z.boolean().optional(),
    }),
  },

  pagination: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    pageSize: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional(),
  }),
};

export type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; errors: string[] };

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
