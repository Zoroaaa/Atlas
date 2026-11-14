/**
 * 反馈请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';

export const createFeedbackSchema = z.object({
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
});

export const updateFeedbackSchema = z.object({
  status: z.enum(['pending', 'processing', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  adminReply: z.string().optional(),
  adminNotes: z.string().optional(),
  sendEmail: z.boolean().optional(),
});

export type FeedbackCreateRequest = z.infer<typeof createFeedbackSchema>;
export type FeedbackUpdateRequest = z.infer<typeof updateFeedbackSchema>;
