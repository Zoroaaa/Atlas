/**
 * 认证相关请求契约 — 前后端共用同一份 zod schema
 * 错误文案保持后端原有中文提示，前端校验与后端返回完全一致
 */
import { z } from 'zod';
import { VALIDATION_RULES, VALIDATION_PATTERNS } from '../validations';

const R = VALIDATION_RULES;

export const loginSchema = z.object({
  identifier: z.string().min(1, '请输入用户名/邮箱').max(R.EMAIL.MAX_LENGTH),
  password: z.string().min(1, '请输入密码'),
});

export const registerSchema = z.object({
  username: z.string()
    .min(R.USERNAME.MIN_LENGTH, `用户名至少${R.USERNAME.MIN_LENGTH}个字符`)
    .max(R.USERNAME.MAX_LENGTH, `用户名最多${R.USERNAME.MAX_LENGTH}个字符`)
    .regex(VALIDATION_PATTERNS.USERNAME, '用户名只能包含字母、数字和下划线'),
  email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
  password: z.string()
    .min(R.PASSWORD.MIN_LENGTH, `密码至少${R.PASSWORD.MIN_LENGTH}个字符`)
    .max(R.PASSWORD.MAX_LENGTH, `密码最多${R.PASSWORD.MAX_LENGTH}个字符`),
  // 注册验证码：强制邮箱验证后才能注册（必填，缺失即 400）
  verificationCode: z.string({ error: '请输入邮箱验证码' }).length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
  verificationCode: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
  code: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`).optional(),
  newPassword: z.string()
    .min(R.PASSWORD.MIN_LENGTH, `密码至少${R.PASSWORD.MIN_LENGTH}个字符`)
    .max(R.PASSWORD.MAX_LENGTH, `密码最多${R.PASSWORD.MAX_LENGTH}个字符`),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string()
    .min(R.PASSWORD.MIN_LENGTH, `新密码至少${R.PASSWORD.MIN_LENGTH}个字符`)
    .max(R.PASSWORD.MAX_LENGTH, `新密码最多${R.PASSWORD.MAX_LENGTH}个字符`),
});

// 删除账户的验证因子是「登录态 + 邮箱验证码 + 确认文字」。
// 不再要求密码：OAuth 注册用户（GitHub/Google）的密码是随机占位串，
// 前端也从未提供密码输入，要求密码会让这部分用户永远无法删号。
export const deleteAccountSchema = z.object({
  verificationCode: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
  confirmText: z.string().min(1, '请输入确认文字'),
});

export const sendRegistrationCodeSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址').max(R.EMAIL.MAX_LENGTH),
});

export const verifyCurrentEmailSchema = z.object({
  code: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
});

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().email('请输入有效的新邮箱地址').max(R.EMAIL.MAX_LENGTH),
  currentPassword: z.string().min(1, '请输入当前密码'),
});

export const verifyEmailChangeCodeSchema = z.object({
  requestId: z.string().min(1, '请求ID不能为空'),
  emailType: z.enum(['old', 'new']),
  code: z.string().length(R.VERIFICATION_CODE.LENGTH, `验证码必须是${R.VERIFICATION_CODE.LENGTH}位`),
});

export const sendEmailChangeCodeSchema = z.object({
  requestId: z.string().min(1, '请求ID不能为空'),
  emailType: z.enum(['old', 'new']),
});

export const cancelEmailChangeRequestSchema = z.object({
  requestId: z.string().min(1, '请求ID不能为空'),
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
export type DeleteAccountRequest = z.infer<typeof deleteAccountSchema>;
export type SendRegistrationCodeRequest = z.infer<typeof sendRegistrationCodeSchema>;
export type VerifyCurrentEmailRequest = z.infer<typeof verifyCurrentEmailSchema>;
export type EmailChangeRequest = z.infer<typeof requestEmailChangeSchema>;
export type VerifyEmailChangeCodeRequest = z.infer<typeof verifyEmailChangeCodeSchema>;
export type SendEmailChangeCodeRequest = z.infer<typeof sendEmailChangeCodeSchema>;
export type CancelEmailChangeRequest = z.infer<typeof cancelEmailChangeRequestSchema>;
