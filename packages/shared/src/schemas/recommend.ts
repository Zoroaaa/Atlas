/**
 * 推荐请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';

export const relatedSchema = z.object({
  code: z.string().max(40).optional(),
  actress: z.string().max(100).optional(),
  actors: z.array(z.string().max(100)).max(10).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  publisher: z.string().max(100).optional(),
  excludeCodes: z.array(z.string().max(40)).max(30).optional(),
  limit: z.number().int().min(1).max(12).optional(),
});

export type JavRelatedRequest = z.infer<typeof relatedSchema>;
