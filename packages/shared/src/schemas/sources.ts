/**
 * 搜索源/分类/用户源配置请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';
import { VALIDATION_RULES } from '../validations';

const R = VALIDATION_RULES;

export const createMajorCategorySchema = z.object({
  name: z.string()
    .min(1, '大类名称不能为空')
    .max(R.MAJOR_CATEGORY.NAME_MAX_LENGTH, `大类名称最多${R.MAJOR_CATEGORY.NAME_MAX_LENGTH}个字符`),
  description: z.string().max(R.MAJOR_CATEGORY.DESCRIPTION_MAX_LENGTH).optional(),
  icon: z.string().max(R.MAJOR_CATEGORY.ICON_MAX_LENGTH).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式不正确').optional(),
});

export const updateMajorCategorySchema = z.object({
  name: z.string().min(1).max(R.MAJOR_CATEGORY.NAME_MAX_LENGTH).optional(),
  description: z.string().max(R.MAJOR_CATEGORY.DESCRIPTION_MAX_LENGTH).optional().nullable(),
  icon: z.string().max(R.MAJOR_CATEGORY.ICON_MAX_LENGTH).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const createCategorySchema = z.object({
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
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(R.CATEGORY.NAME_MAX_LENGTH).optional(),
  description: z.string().max(R.CATEGORY.DESCRIPTION_MAX_LENGTH).optional().nullable(),
  icon: z.string().max(R.CATEGORY.ICON_MAX_LENGTH).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  defaultSearchable: z.boolean().optional(),
  defaultSiteType: z.enum(['search', 'browse', 'reference']).optional(),
  searchPriority: z.number().int().min(0).max(10).optional(),
});

export const createSourceSchema = z.object({
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
});

export const updateSourceSchema = z.object({
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
});

export const batchUpdateUserConfigsSchema = z.object({
  configs: z.array(z.object({
    sourceId: z.string().min(1),
    isEnabled: z.boolean().optional(),
    customPriority: z.number().int().min(1).max(10).optional().nullable(),
    customName: z.string().max(R.USER_CONFIG.CUSTOM_NAME_MAX_LENGTH).optional().nullable(),
    customSubtitle: z.string().max(R.USER_CONFIG.CUSTOM_SUBTITLE_MAX_LENGTH).optional().nullable(),
    customIcon: z.string().max(R.USER_CONFIG.CUSTOM_ICON_MAX_LENGTH).optional().nullable(),
    notes: z.string().max(R.USER_CONFIG.NOTES_MAX_LENGTH).optional().nullable(),
  })).min(1, '配置列表不能为空').max(R.USER_CONFIG.BATCH_UPDATE_MAX_COUNT, `批量更新不能超过${R.USER_CONFIG.BATCH_UPDATE_MAX_COUNT}个配置`),
});

export type CreateMajorCategoryRequest = z.infer<typeof createMajorCategorySchema>;
export type UpdateMajorCategoryRequest = z.infer<typeof updateMajorCategorySchema>;
export type CreateCategoryRequest = z.infer<typeof createCategorySchema>;
export type UpdateCategoryRequest = z.infer<typeof updateCategorySchema>;
export type CreateSourceRequest = z.infer<typeof createSourceSchema>;
export type UpdateSourceRequest = z.infer<typeof updateSourceSchema>;
export type BatchUpdateUserSourceConfigRequest = z.infer<typeof batchUpdateUserConfigsSchema>;
