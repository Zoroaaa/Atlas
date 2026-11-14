/**
 * 公告请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(2, '标题长度应在 2~200 个字符之间').max(200, '标题长度应在 2~200 个字符之间'),
  content: z.string().trim().min(5, '内容长度应在 5~5000 个字符之间').max(5000, '内容长度应在 5~5000 个字符之间'),
  type: z.enum(['info', 'warning', 'success', 'error']).optional(),
  isPinned: z.boolean().optional(),
  // 创建时允许直接设为停用（前端表单有「启用」开关），缺失时默认启用
  isActive: z.boolean().optional(),
  startTime: z.number().optional().nullable(),
  endTime: z.number().optional().nullable(),
});

export const updateAnnouncementSchema = z.object({
  title: z.string().min(2, '标题长度应在 2~200 个字符之间').max(200, '标题长度应在 2~200 个字符之间').optional(),
  content: z.string().min(5, '内容长度应在 5~5000 个字符之间').max(5000, '内容长度应在 5~5000 个字符之间').optional(),
  type: z.enum(['info', 'warning', 'success', 'error']).optional(),
  isPinned: z.union([z.boolean(), z.number()]).optional(),
  isActive: z.union([z.boolean(), z.number()]).optional(),
  startTime: z.number().optional().nullable(),
  endTime: z.number().optional().nullable(),
});

export type AnnouncementCreateRequest = z.infer<typeof createAnnouncementSchema>;
export type AnnouncementUpdateRequest = z.infer<typeof updateAnnouncementSchema>;
