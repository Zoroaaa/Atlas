/**
 * 用户/收藏/历史相关请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';
import { VALIDATION_RULES } from '../validations';

const R = VALIDATION_RULES;

export const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
});

export const addFavoriteSchema = z.object({
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
});

export const updateSearchHistorySchema = z.object({
  title: z.string().optional().nullable(),
  subtitle: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  actors: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  releaseDate: z.string().optional().nullable(),
  publisher: z.string().optional().nullable(),
  keyword: z.string().optional().nullable(),
});

export const batchDeleteSearchHistorySchema = z.object({
  ids: z.array(z.string()).min(1, '请提供要删除的历史记录ID').max(100, '一次最多删除100条记录'),
});

export const updateFavoriteStatusSchema = z.object({
  status: z.enum(['want', 'watched'], { message: '状态必须是 want 或 watched' }),
});

export const updateSourceConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  customPriority: z.number().int().min(1).max(10).optional().nullable(),
  customName: z.string().max(R.USER_CONFIG.CUSTOM_NAME_MAX_LENGTH).optional().nullable(),
  customSubtitle: z.string().max(R.USER_CONFIG.CUSTOM_SUBTITLE_MAX_LENGTH).optional().nullable(),
  customIcon: z.string().max(R.USER_CONFIG.CUSTOM_ICON_MAX_LENGTH).optional().nullable(),
  notes: z.string().max(R.USER_CONFIG.NOTES_MAX_LENGTH).optional().nullable(),
});

export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>;
export type AddFavoriteRequest = z.infer<typeof addFavoriteSchema>;
export type UpdateSearchHistoryRequest = z.infer<typeof updateSearchHistorySchema>;
export type BatchDeleteSearchHistoryRequest = z.infer<typeof batchDeleteSearchHistorySchema>;
export type UpdateFavoriteStatusRequest = z.infer<typeof updateFavoriteStatusSchema>;
export type UpdateUserSourceConfigRequest = z.infer<typeof updateSourceConfigSchema>;
