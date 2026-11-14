/**
 * 系统观测请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';
import { VALIDATION_RULES } from '../validations';

const R = VALIDATION_RULES;

export const reportErrorSchema = z.object({
  source: z.string().optional(),
  errorType: z.string().optional(),
  message: z.string().optional(),
  stack: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  lineNumber: z.number().optional().nullable(),
  columnNumber: z.number().optional().nullable(),
  sessionId: z.string().optional().nullable(),
  context: z.unknown().optional(),
});

export const batchSourceStatusSchema = z.object({
  sourceIds: z.array(z.string().min(1))
    .min(1, '请提供搜索源ID列表')
    .max(R.SOURCE_CHECK.MAX_BATCH_CHECK, `单次最多检查${R.SOURCE_CHECK.MAX_BATCH_CHECK}个搜索源`),
});

export type ReportErrorRequest = z.infer<typeof reportErrorSchema>;
export type BatchSourceStatusRequest = z.infer<typeof batchSourceStatusSchema>;
