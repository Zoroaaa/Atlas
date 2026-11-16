/**
 * 配置中心请求契约 — 前后端共用同一份 zod schema
 */
import { z } from 'zod';
import { VALIDATION_RULES } from '../validations';

const R = VALIDATION_RULES;

export const importConfigSchema = z.object({
  configs: z.array(z.object({
    key: z.string().min(1),
    // 配置值在数据库中统一按文本存储。导入的 JSON 可能把数字/布尔写成原生类型，
    // 这里是系统边界，统一转成字符串；对象/数组/null 仍然拒绝，避免存进去无法还原的值。
    value: z.preprocess(
      (value) => (typeof value === 'number' || typeof value === 'boolean' ? String(value) : value),
      z.string({ error: '配置值必须是字符串、数字或布尔值' }),
    ),
    description: z.string().optional(),
    configType: z.string().optional(),
    configGroup: z.string().optional(),
    isPublic: z.boolean().optional(),
    isSensitive: z.boolean().optional(),
  })),
  overwrite: z.boolean().optional(),
});

export const recordAnalyticsEventSchema = z.object({
  userId: z.string().max(100).optional(),
  sessionId: z.string().max(200).optional().nullable(),
  eventType: z.enum(['page_view', 'login', 'search'], { error: '不支持的事件类型' }),
  eventData: z.unknown().optional(),
  referer: z.string().max(500).optional().nullable(),
}).superRefine((val, ctx) => {
  if (val.eventData !== undefined && JSON.stringify(val.eventData).length > 4096) {
    ctx.addIssue({ code: 'custom', message: 'eventData 不能超过 4KB' });
  }
});

export const updateConfigSchema = z.object({
  value: z.string(),
  description: z.string().optional().nullable(),
  configType: z.string().optional().nullable(),
  configGroup: z.string().optional().nullable(),
  isPublic: z.boolean().optional().nullable(),
  isSensitive: z.boolean().optional().nullable(),
  changeReason: z.string().max(500).optional().nullable(),
});

/** 管理员测试邮件：指定收件人与发送服务商 */
export const testEmailSchema = z.object({
  to: z.string().trim().toLowerCase().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
  provider: z.enum(['cloudflare', 'resend', 'mailtrap', 'brevo'], {
    error: '不支持的邮件服务商',
  }),
});

export type ConfigImportRequest = z.infer<typeof importConfigSchema>;
export type AnalyticsEvent = z.infer<typeof recordAnalyticsEventSchema>;
export type UpdateConfigRequest = z.infer<typeof updateConfigSchema>;
export type TestEmailRequest = z.infer<typeof testEmailSchema>;
