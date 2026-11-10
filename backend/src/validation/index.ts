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

// ──────────────────────────────────────────────
// 社区帖子 contentData 结构校验
// contentData 是前端把整份搜索结果 JSON.stringify 后整体提交的字符串。
// 之前只限制总长度、不校验内容，等价于允许任意大文本入库，
// 且结构与渲染层假设不一致时只能等到渲染报错才发现。
// 这里按 postType 校验渲染层依赖的字段，并把上限收敛到真实数据规模
// （各 provider 返回条数均有上限：anime ≤30/源、movie ≤20、manga/novel ≤20、jav 磁力 ≤30）。
// ──────────────────────────────────────────────
const COMMUNITY_CONTENT_MAX_LENGTH = 128_000;
const COMMUNITY_COVER_MAX_LENGTH = 4_000;

type CommunityContent = Record<string, unknown>;

const isPlainObject = (value: unknown): value is CommunityContent =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 可选字符串字段：缺省/null 放行，出现则必须是长度受限的字符串 */
const checkOptionalString = (data: CommunityContent, key: string, max: number): string | null => {
  const value = data[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `${key} 必须是字符串`;
  if (value.length > max) return `${key} 最多 ${max} 个字符`;
  return null;
};

/** 必填字符串字段：用于渲染层强依赖的标识（番号/女优名） */
const checkRequiredString = (data: CommunityContent, key: string, max: number): string | null => {
  const value = data[key];
  if (typeof value !== 'string' || value.trim().length === 0) return `缺少 ${key}`;
  if (value.length > max) return `${key} 最多 ${max} 个字符`;
  return null;
};

/** 可选数组字段：缺省/null 放行，出现则必须是长度受限的数组 */
const checkArray = (data: CommunityContent, key: string, max: number): string | null => {
  const value = data[key];
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return `${key} 必须是数组`;
  if (value.length > max) return `${key} 最多 ${max} 项`;
  return null;
};

const firstError = (...errors: (string | null)[]): string | null =>
  errors.find((message): message is string => message !== null) ?? null;

const COMMUNITY_CONTENT_VALIDATORS: Record<
  'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress',
  (data: CommunityContent) => string | null
> = {
  jav: (data) => firstError(
    checkRequiredString(data, 'code', 64),
    checkOptionalString(data, 'title', 500),
    checkArray(data, 'tags', 20),
    checkArray(data, 'actresses', 50),
    checkArray(data, 'magnets', 100),
  ),
  anime: (data) => firstError(
    checkOptionalString(data, 'keyword', 200),
    checkArray(data, 'bgm', 20),
    checkArray(data, 'nyaa', 60),
    checkArray(data, 'mikan', 60),
    checkArray(data, 'animetosho', 60),
    checkArray(data, 'showrss', 60),
  ),
  movie: (data) => firstError(
    checkOptionalString(data, 'keyword', 200),
    checkArray(data, 'results', 30),
    checkArray(data, 'resources', 60),
  ),
  manga: (data) => firstError(
    checkOptionalString(data, 'keyword', 200),
    checkArray(data, 'manga', 30),
  ),
  novel: (data) => firstError(
    checkOptionalString(data, 'keyword', 200),
    checkArray(data, 'novels', 30),
  ),
  actress: (data) => firstError(
    checkRequiredString(data, 'name', 200),
    checkOptionalString(data, 'detailUrl', 1000),
  ),
};

/** 返回错误文案；null 表示通过 */
const validateCommunityContentData = (
  postType: keyof typeof COMMUNITY_CONTENT_VALIDATORS,
  raw: string,
): string | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '内容数据必须是合法的 JSON';
  }
  if (!isPlainObject(parsed)) return '内容数据必须是 JSON 对象';
  return COMMUNITY_CONTENT_VALIDATORS[postType](parsed);
};

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

    verifyCurrentEmail: z.object({
      code: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
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
      title: z.string().min(1, '标题不能为空').max(200, '标题最多200个字符'),
      // 封面只允许 http(s) 或站内相对路径，避免把任意文本/大体积内联数据塞进列表卡片
      coverImage: z.string().min(1, '封面图片不能为空').max(COMMUNITY_COVER_MAX_LENGTH, '封面图片地址过长')
        .regex(/^(https?:\/\/|\/)/, '封面图片必须是有效地址'),
      contentData: z.string().min(1, '内容数据不能为空').max(COMMUNITY_CONTENT_MAX_LENGTH, '内容数据过大'),
      caption: z.string().max(2000, '简介最多2000个字符').optional(),
      tags: z.array(z.string().min(1).max(R.TAG.NAME_MAX_LENGTH))
        .max(R.TAG.MAX_COUNT_PER_SOURCE, `最多${R.TAG.MAX_COUNT_PER_SOURCE}个标签`)
        .optional(),
    }).superRefine((value, ctx) => {
      const message = validateCommunityContentData(value.postType, value.contentData);
      if (message) {
        ctx.addIssue({ code: 'custom', path: ['contentData'], message });
      }
    }),

    updatePost: z.object({
      caption: z.string().max(2000, '简介最多2000个字符').optional(),
      tags: z.array(z.string().min(1).max(R.TAG.NAME_MAX_LENGTH))
        .max(R.TAG.MAX_COUNT_PER_SOURCE, `最多${R.TAG.MAX_COUNT_PER_SOURCE}个标签`)
        .optional(),
    }),

    updatePostStatus: z.object({
      // 社区没有审核流：只有正常展示与管理员隐藏两种状态
      status: z.enum(['active', 'hidden']),
    }),

    createComment: z.object({
      postId: z.string().min(1, '帖子ID不能为空'),
      content: z.string().min(1, '评论内容不能为空').max(1000, '评论内容最多1000个字符'),
    }),

    reportPost: z.object({
      reason: z.string().min(1, '请提供举报原因').max(R.REPORT.REASON_MAX_LENGTH, `举报原因最多${R.REPORT.REASON_MAX_LENGTH}个字符`),
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
      userId: z.string().max(100).optional(),
      sessionId: z.string().max(200).optional().nullable(),
      eventType: z.enum(['page_view', 'login', 'search'], { error: '不支持的事件类型' }),
      eventData: z.unknown().optional(),
      referer: z.string().max(500).optional().nullable(),
    }).superRefine((val, ctx) => {
      if (val.eventData !== undefined && JSON.stringify(val.eventData).length > 4096) {
        ctx.addIssue({ code: 'custom', message: 'eventData 不能超过 4KB' });
      }
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

  recommend: {
    related: z.object({
      code: z.string().max(40).optional(),
      actress: z.string().max(100).optional(),
      actors: z.array(z.string().max(100)).max(10).optional(),
      tags: z.array(z.string().max(100)).max(20).optional(),
      publisher: z.string().max(100).optional(),
      excludeCodes: z.array(z.string().max(40)).max(30).optional(),
      limit: z.number().int().min(1).max(12).optional(),
    }),
  },

  rankings: {
    import: z.object({
      source: z.enum(['javdb']),
      section: z.enum(['censored', 'uncensored']),
      period: z.enum(['weekly', 'monthly']),
      fetchedAt: z.number().int().optional(),
      items: z.array(z.object({
        code: z.string().min(1).max(40),
        title: z.string().max(1000).optional(),
        cover: z.string().max(500).optional(),
        rank: z.number().int().min(1).max(500).optional(),
        score: z.union([z.number(), z.string().max(20)]).optional(),
        url: z.string().max(500).optional(),
      })).min(1).max(200),
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
