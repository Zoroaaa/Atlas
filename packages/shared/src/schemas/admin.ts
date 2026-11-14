/**
 * 管理后台请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';

export const updateUserRoleSchema = z.object({
  roleId: z.string().min(1, '请指定角色'),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const handleReportSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  action: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateDataRecordStatusSchema = z.object({
  status: z.enum(['active', 'hidden']),
});

export type UpdateUserRoleRequest = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatusRequest = z.infer<typeof updateUserStatusSchema>;
export type HandleReportRequest = z.infer<typeof handleReportSchema>;
export type UpdateDataRecordStatusRequest = z.infer<typeof updateDataRecordStatusSchema>;
