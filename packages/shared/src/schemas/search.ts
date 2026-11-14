/**
 * 搜索请求契约 — 前后端共用同一份 zod schema
 * 说明：后端只消费 keyword / majorCategoryId / javSubMode / page / pageSize，
 * 历史上前端类型里的 sourceIds / categoryId 后端从未读取，已从契约中移除。
 */
import { z } from 'zod';
import { VALIDATION_RULES } from '../validations';

const R = VALIDATION_RULES;

export const searchSchema = z.object({
  keyword: z.string()
    .min(R.KEYWORD.MIN_LENGTH, '搜索关键词不能为空')
    .max(R.KEYWORD.MAX_LENGTH, `关键词最多${R.KEYWORD.MAX_LENGTH}个字符`),
  majorCategoryId: z.string().min(1).max(100).optional(),
  javSubMode: z.enum(['code', 'actress', 'title']).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).optional(),
});

export type SearchRequest = z.infer<typeof searchSchema>;
