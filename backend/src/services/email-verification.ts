import { Env } from '@/types';
import { generateId, hashToken, maskEmail } from '@/utils';
import { CONFIG, DB_CONFIG_KEYS } from '@/constants';
import { ConfigService } from './config';
import {
  sendResendEmail,
  logEmailSend as writeEmailSendLog,
  assertVerificationEmailRateLimit,
} from './email-sender';

export type VerificationType =
  | 'registration'
  | 'password_reset'
  | 'forgot_password'
  | 'email_change_old'
  | 'email_change_new'
  | 'email_verify'
  | 'account_delete';

export interface PendingVerification {
  id: string;
  email: string;
  verificationType: string;
  expiresAt: number;
  remainingTime: number;
  canResend: boolean;
  attemptCount: number;
  maxAttempts: number;
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface EmailChangeRequestStatus {
  id: string;
  oldEmail: string;
  newEmail: string;
  oldEmailVerified: boolean;
  newEmailVerified: boolean;
  expiresAt: number;
  remainingTime: number;
  createdAt: number;
  verifications: {
    oldEmail: PendingVerification | null;
    newEmail: PendingVerification | null;
  };
}

export interface CanResendResult {
  canResend: boolean;
  reason: string;
  waitTime?: number;
  remainingTime?: number;
  existingVerification?: PendingVerification;
}

export interface VerificationResult {
  success: boolean;
  verificationId: string;
  metadata: Record<string, unknown>;
}

export interface EmailTemplate {
  template_type: string;
  template_name: string;
  subject_template: string;
  html_template: string;
  text_template: string | null;
  version: number;
  is_active: number;
}

export const emailVerificationUtils = {
  isValidEmail(email: string): boolean {
    return CONFIG.VALIDATION.EMAIL_REGEX.test(email);
  },

  normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  },

  maskEmail(email: string): string {
    return maskEmail(email);
  },

  isValidVerificationCode(code: string): boolean {
    return CONFIG.VALIDATION.VERIFICATION_CODE_REGEX.test(code);
  },

  isTrustedEmailDomain(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    return CONFIG.TrustedEmail.DOMAINS.includes(domain as typeof CONFIG.TrustedEmail.DOMAINS[number]);
  },

  generateSecureEmailLink(baseUrl: string, action: string, token: string): string {
    return `${baseUrl}/email/${action}?token=${encodeURIComponent(token)}`;
  },
};

export class EmailVerificationService {
  private env: Env;
  private resendApiKey: string | undefined;
  private defaultFromEmail: string;
  private siteUrl: string;

  constructor(env: Env) {
    this.env = env;
    this.resendApiKey = env.RESEND_API_KEY;
    this.defaultFromEmail = env.DEFAULT_FROM_EMAIL || 'noreply@tempemail.pp.ua';
    this.siteUrl = env.SITE_URL || 'https://tempemail.pp.ua';
  }

  async getPendingVerification(
    email: string,
    verificationType: VerificationType,
    userId: string | null = null
  ): Promise<PendingVerification | null> {
    const emailHash = await hashToken(email);
    const now = Date.now();

    const query = `
      SELECT * FROM email_verifications 
      WHERE email_hash = ? AND verification_type = ?
      AND status = 'pending' AND expires_at > ?
      ${userId ? 'AND user_id = ?' : 'AND user_id IS NULL'}
      ORDER BY created_at DESC LIMIT 1
    `;

    const params = userId ? [emailHash, verificationType, now, userId] : [emailHash, verificationType, now];

    const verification = await this.env.DB.prepare(query)
      .bind(...params)
      .first();

    if (!verification) {
      return null;
    }

    const v = verification as {
      id: string;
      expires_at: number;
      created_at: number;
      attempt_count: number;
      max_attempts: number;
      metadata: string;
    };

    const remainingTime = v.expires_at - now;
    const canResend = remainingTime <= 60000;

    return {
      id: v.id,
      email: emailVerificationUtils.maskEmail(email),
      verificationType,
      expiresAt: v.expires_at,
      remainingTime,
      canResend,
      attemptCount: v.attempt_count,
      maxAttempts: v.max_attempts,
      createdAt: v.created_at,
      metadata: JSON.parse(v.metadata || '{}'),
    };
  }

  async getPendingEmailChangeRequest(userId: string): Promise<EmailChangeRequestStatus | null> {
    const now = Date.now();

    const request = await this.env.DB.prepare(
      `SELECT * FROM email_change_requests 
       WHERE user_id = ? AND status = 'pending' AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(userId, now)
      .first();

    if (!request) {
      return null;
    }

    const r = request as {
      id: string;
      old_email: string;
      new_email: string;
      old_email_verified: number;
      new_email_verified: number;
      expires_at: number;
      created_at: number;
    };

    const oldEmailVerification = await this.getPendingVerification(r.old_email, 'email_change_old', userId);
    const newEmailVerification = await this.getPendingVerification(r.new_email, 'email_change_new', userId);

    return {
      id: r.id,
      oldEmail: emailVerificationUtils.maskEmail(r.old_email),
      newEmail: emailVerificationUtils.maskEmail(r.new_email),
      oldEmailVerified: Boolean(r.old_email_verified),
      newEmailVerified: Boolean(r.new_email_verified),
      expiresAt: r.expires_at,
      remainingTime: r.expires_at - now,
      createdAt: r.created_at,
      verifications: {
        oldEmail: oldEmailVerification,
        newEmail: newEmailVerification,
      },
    };
  }

  async canResendVerification(
    email: string,
    verificationType: VerificationType,
    userId: string | null = null
  ): Promise<CanResendResult> {
    const pending = await this.getPendingVerification(email, verificationType, userId);

    if (!pending) {
      return { canResend: true, reason: 'no_pending_verification' };
    }

    const timeSinceCreated = Date.now() - pending.createdAt;

    if (timeSinceCreated < 60000) {
      return {
        canResend: false,
        reason: 'too_soon',
        waitTime: 60000 - timeSinceCreated,
        remainingTime: pending.remainingTime,
      };
    }

    return {
      canResend: true,
      reason: 'can_resend',
      existingVerification: pending,
    };
  }

  generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async checkEmailRateLimit(email: string, ipAddress: string): Promise<boolean> {
    await assertVerificationEmailRateLimit(this.env, email, ipAddress);
    return true;
  }

  async createEmailVerification(
    email: string,
    verificationType: VerificationType,
    userId: string | null = null,
    metadata: Record<string, unknown> = {}
  ): Promise<{ id: string; code: string; expiresAt: number }> {
    const emailHash = await hashToken(email);

    const clearQuery = `
      UPDATE email_verifications 
      SET status = 'expired'
      WHERE email_hash = ? AND verification_type = ? AND status = 'pending'
      ${userId ? 'AND user_id = ?' : 'AND user_id IS NULL'}
    `;
    const clearParams = userId ? [emailHash, verificationType, userId] : [emailHash, verificationType];
    await this.env.DB.prepare(clearQuery).bind(...clearParams).run();

    const verificationCode = this.generateVerificationCode();
    const codeHash = await hashToken(verificationCode);
    const configService = new ConfigService(this.env);
    const expiryTime = Date.now() + await configService.getInt(DB_CONFIG_KEYS.VERIFICATION_CODE_EXPIRY, 900000);
    const maxAttempts = await configService.getInt(DB_CONFIG_KEYS.MAX_VERIFICATION_ATTEMPTS, 3);

    const verificationId = generateId();

    await this.env.DB.prepare(
      `INSERT INTO email_verifications (
        id, user_id, email, email_hash, verification_code, code_hash,
        verification_type, status, max_attempts, expires_at, created_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        verificationId,
        userId,
        email,
        emailHash,
        verificationCode,
        codeHash,
        verificationType,
        'pending',
        maxAttempts,
        expiryTime,
        Date.now(),
        JSON.stringify(metadata)
      )
      .run();

    return {
      id: verificationId,
      code: verificationCode,
      expiresAt: expiryTime,
    };
  }

  async verifyCode(
    email: string,
    inputCode: string,
    verificationType: VerificationType,
    userId: string | null = null
  ): Promise<VerificationResult> {
    const emailHash = await hashToken(email);
    const codeHash = await hashToken(inputCode);
    const now = Date.now();
    const userFilter = userId ? ' AND user_id = ?' : ' AND user_id IS NULL';
    const userBinds = userId ? [userId] : [];

    const latest = await this.env.DB.prepare(
      `SELECT id, attempt_count, max_attempts, expires_at
       FROM email_verifications
       WHERE email_hash = ? AND verification_type = ? AND status = 'pending'${userFilter}
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(emailHash, verificationType, ...userBinds)
      .first<{ id: string; attempt_count: number; max_attempts: number; expires_at: number }>();

    if (!latest) {
      throw new Error('验证码无效或已过期');
    }

    if (latest.expires_at <= now) {
      throw new Error('验证码无效或已过期');
    }

    if ((latest.attempt_count || 0) >= (latest.max_attempts || 3)) {
      throw new Error('验证尝试次数已达上限，请重新申请验证码');
    }

    const matched = await this.env.DB.prepare(
      'SELECT id, metadata FROM email_verifications WHERE id = ? AND code_hash = ?'
    )
      .bind(latest.id, codeHash)
      .first<{ id: string; metadata: string }>();

    if (!matched) {
      await this.recordFailedAttempt(emailHash, inputCode, verificationType);
      throw new Error('验证码无效或已过期');
    }

    await this.env.DB.prepare(
      `UPDATE email_verifications 
       SET status = 'used', used_at = ?
       WHERE id = ?`
    )
      .bind(now, matched.id)
      .run();

    return {
      success: true,
      verificationId: matched.id,
      metadata: JSON.parse(matched.metadata || '{}'),
    };
  }

  private async recordFailedAttempt(
    emailHash: string,
    _inputCode: string,
    verificationType: string
  ): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE email_verifications 
       SET attempt_count = attempt_count + 1, last_attempt_at = ?
       WHERE email_hash = ? AND verification_type = ? AND status = 'pending'`
    )
      .bind(Date.now(), emailHash, verificationType)
      .run();
  }

  /**
   * 校验用户侧验证码并累计失败次数（注册 / 改邮箱 / 当前邮箱验证共用）。
   * 与 verifyCode 的区别：不依赖 metadata，超过 max_attempts 后把待用验证码置为 expired。
   */
  async verifyCodeWithAttempts(params: {
    email: string;
    code: string;
    type: VerificationType;
    userId?: string | null;
  }): Promise<
    | { success: true; verificationId: string }
    | { success: false; reason: 'invalid' | 'expired' | 'max_attempts' }
  > {
    const now = Date.now();
    const userFilter = params.userId ? ' AND user_id = ?' : '';
    const userBinds: string[] = params.userId ? [params.userId] : [];

    const latest = await this.env.DB.prepare(
      `SELECT id, attempt_count, max_attempts, expires_at
       FROM email_verifications
       WHERE email = ? AND verification_type = ? AND status = 'pending'${userFilter}
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(params.email, params.type, ...userBinds)
      .first<{ id: string; attempt_count: number; max_attempts: number; expires_at: number }>();

    if (!latest) {
      return { success: false, reason: 'invalid' };
    }

    const maxAttempts = latest.max_attempts || 3;

    if (latest.expires_at <= now) {
      await this.expirePendingVerifications(params.email, params.type, params.userId);
      return { success: false, reason: 'expired' };
    }

    if ((latest.attempt_count || 0) >= maxAttempts) {
      await this.expirePendingVerifications(params.email, params.type, params.userId);
      return { success: false, reason: 'max_attempts' };
    }

    const matched = await this.env.DB.prepare(
      `SELECT id FROM email_verifications
       WHERE email_hash = ? AND code_hash = ? AND verification_type = ?
       AND status = 'pending' AND expires_at > ?${userFilter}
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(await hashToken(params.email), await hashToken(params.code), params.type, now, ...userBinds)
      .first<{ id: string }>();

    if (!matched) {
      await this.env.DB.prepare(
        `UPDATE email_verifications
         SET attempt_count = attempt_count + 1, last_attempt_at = ?
         WHERE email = ? AND verification_type = ? AND status = 'pending'${userFilter}`
      )
        .bind(now, params.email, params.type, ...userBinds)
        .run();

      const after = await this.env.DB.prepare(
        `SELECT MAX(attempt_count) AS max_count
         FROM email_verifications
         WHERE email = ? AND verification_type = ? AND status = 'pending'${userFilter}`
      )
        .bind(params.email, params.type, ...userBinds)
        .first<{ max_count: number | null }>();

      if ((after?.max_count || 0) >= maxAttempts) {
        await this.expirePendingVerifications(params.email, params.type, params.userId);
        return { success: false, reason: 'max_attempts' };
      }

      return { success: false, reason: 'invalid' };
    }

    await this.env.DB.prepare(
      `UPDATE email_verifications SET status = 'used', used_at = ? WHERE id = ?`
    )
      .bind(now, matched.id)
      .run();

    return { success: true, verificationId: matched.id };
  }

  /** 将待用验证码置为过期（超过尝试次数或已过期时） */
  private async expirePendingVerifications(
    email: string,
    type: VerificationType,
    userId?: string | null
  ): Promise<void> {
    const userFilter = userId ? ' AND user_id = ?' : '';
    const binds: string[] = userId ? [userId] : [];
    await this.env.DB.prepare(
      `UPDATE email_verifications
       SET status = 'expired'
       WHERE email = ? AND verification_type = ? AND status = 'pending'${userFilter}`
    )
      .bind(email, type, ...binds)
      .run();
  }

  async sendVerificationEmail(
    email: string,
    verificationCode: string,
    templateType: VerificationType,
    templateVars: Record<string, unknown> = {},
    logContext: { userId?: string | null; ipAddress?: string | null } = {}
  ): Promise<{ success: boolean; messageId?: string; message: string }> {
    if (!this.resendApiKey) {
      throw new Error('邮件服务未配置');
    }

    const configService = new ConfigService(this.env);
    const verificationCodeExpiry = await configService.getInt(DB_CONFIG_KEYS.VERIFICATION_CODE_EXPIRY, 900000);
    const defaultFromName = this.env.DEFAULT_FROM_NAME || 'Atlas';

    const mappedTemplateType = this.getTemplateType(templateType);
    const template = (await this.getEmailTemplate(mappedTemplateType))
      // 兼容尚未执行 06_data_system.sql 新增模板的存量库
      ?? (templateType === 'email_verify' ? await this.getEmailTemplate('registration') : null);

    if (!template) {
      throw new Error(`邮件模板不存在: ${mappedTemplateType}`);
    }

    const vars = {
      siteName: defaultFromName,
      siteUrl: this.siteUrl,
      verificationCode,
      expiryMinutes: Math.floor(verificationCodeExpiry / 60000),
      ...templateVars,
    };

    const subject = this.renderTemplate(template.subject_template, vars);
    const htmlContent = this.renderTemplate(template.html_template, vars);
    const textContent = this.renderTemplate(template.text_template || '', vars);

    try {
      const result = await sendResendEmail(this.env, {
        to: email,
        subject,
        html: htmlContent,
        text: textContent,
        fromName: defaultFromName,
        fromEmail: this.defaultFromEmail,
        tags: [
          { name: 'type', value: mappedTemplateType },
          { name: 'source', value: 'email-verification' },
        ],
      });

      if (!result.ok) {
        throw new Error(result.error || '邮件发送失败');
      }

      await writeEmailSendLog(this.env.DB, {
        recipientEmail: email,
        emailType: mappedTemplateType,
        status: 'sent',
        messageId: result.messageId,
        subject,
        templateName: template.template_name,
        userId: logContext.userId,
        ipAddress: logContext.ipAddress,
      });

      return {
        success: true,
        messageId: result.messageId,
        message: '验证邮件已发送',
      };
    } catch (error) {
      console.error('发送邮件失败:', error);

      await writeEmailSendLog(this.env.DB, {
        recipientEmail: email,
        emailType: mappedTemplateType,
        status: 'failed',
        error: (error as Error).message,
        subject,
        templateName: template.template_name,
        userId: logContext.userId,
        ipAddress: logContext.ipAddress,
      });

      throw new Error('邮件发送失败: ' + (error as Error).message, { cause: error });
    }
  }

  private async getEmailTemplate(templateType: string): Promise<EmailTemplate | null> {
    return (await this.env.DB.prepare(
      `SELECT * FROM email_templates 
       WHERE template_type = ? AND is_active = 1
       ORDER BY version DESC LIMIT 1`
    )
      .bind(templateType)
      .first()) as EmailTemplate | null;
  }

  private renderTemplate(template: string, vars: Record<string, unknown>): string {
    if (!template) return '';

    let rendered = template;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, String(value || ''));
    }
    return rendered;
  }

  async getUserActiveEmailChangeRequest(userId: string): Promise<{
    id: string;
    user_id: string;
    old_email: string;
    new_email: string;
    status: string;
    expires_at: number;
    created_at: number;
  } | null> {
    return (await this.env.DB.prepare(
      `SELECT * FROM email_change_requests 
       WHERE user_id = ? AND status = 'pending' AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
      .bind(userId, Date.now())
      .first()) as {
      id: string;
      user_id: string;
      old_email: string;
      new_email: string;
      status: string;
      expires_at: number;
      created_at: number;
    } | null;
  }

  async cancelEmailChangeRequest(requestId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const request = await this.env.DB.prepare(
      `SELECT * FROM email_change_requests 
       WHERE id = ? AND user_id = ? AND status = 'pending'`
    )
      .bind(requestId, userId)
      .first();

    if (!request) {
      throw new Error('邮箱更改请求不存在或已处理');
    }

    await this.env.DB.prepare(
      `UPDATE email_change_requests 
       SET status = 'cancelled', updated_at = ?
       WHERE id = ?`
    )
      .bind(Date.now(), requestId)
      .run();

    return {
      success: true,
      message: '邮箱更改请求已取消',
    };
  }

  async cancelExpiredPendingRequests(userId: string, expireAfterMinutes: number = 30): Promise<number> {
    const expireThreshold = Date.now() - expireAfterMinutes * 60 * 1000;

    const result = await this.env.DB.prepare(
      `UPDATE email_change_requests 
       SET status = 'cancelled', updated_at = ?
       WHERE user_id = ? AND status = 'pending' AND created_at < ?`
    )
      .bind(Date.now(), userId, expireThreshold)
      .run();

    return (result.meta as { changes?: number })?.changes || 0;
  }

  private getTemplateType(verificationType: VerificationType): string {
    const mapping: Record<string, string> = {
      registration: 'registration',
      password_reset: 'forgot_password',
      forgot_password: 'forgot_password',
      email_change_old: 'email_change',
      email_change_new: 'email_change',
      email_verify: 'email_verify',
      account_delete: 'account_delete',
    };
    return mapping[verificationType] || verificationType;
  }

  async getUserByEmail(email: string): Promise<{
    id: string;
    username: string;
    email: string;
    is_active: number;
  } | null> {
    const normalizedEmail = emailVerificationUtils.normalizeEmail(email);
    return (await this.env.DB.prepare(
      `SELECT id, username, email, is_active 
       FROM users 
       WHERE email = ?`
    )
      .bind(normalizedEmail)
      .first()) as {
      id: string;
      username: string;
      email: string;
      is_active: number;
    } | null;
  }

  async createForgotPasswordVerification(
    email: string,
    ipAddress: string
  ): Promise<{
    verification: { id: string; code: string; expiresAt: number };
    user: { id: string; username: string };
  } | null> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.is_active) {
      return null;
    }

    const verification = await this.createEmailVerification(email, 'forgot_password', user.id, {
      ipAddress,
      requestedAt: Date.now(),
    });

    return {
      verification,
      user: { id: user.id, username: user.username },
    };
  }

  async verifyForgotPasswordCode(
    email: string,
    verificationCode: string
  ): Promise<VerificationResult & { userId: string; username: string }> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.is_active) {
      throw new Error('用户不存在或已被禁用');
    }

    const result = await this.verifyCode(email, verificationCode, 'forgot_password', user.id);

    return {
      ...result,
      userId: user.id,
      username: user.username,
    };
  }

  async cleanupOldVerifications(daysOld = 30): Promise<number> {
    const cutoffTime = Date.now() - daysOld * CONFIG.Stats.DAY_IN_MS;

    const deleted = await this.env.DB.prepare(
      `DELETE FROM email_verifications 
       WHERE created_at < ? AND status IN ('used', 'expired', 'failed')`
    )
      .bind(cutoffTime)
      .run();

    return (deleted.meta as { changes?: number })?.changes || 0;
  }
}
