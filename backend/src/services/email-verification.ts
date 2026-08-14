import { Env } from '@/types';
import { generateId, hashToken } from '@/utils';
import { CONFIG, DB_CONFIG_KEYS, VALIDATION_RULES } from '@/constants';
import { ConfigService } from './config';

const R = VALIDATION_RULES;

export type VerificationType =
  | 'registration'
  | 'password_reset'
  | 'forgot_password'
  | 'email_change_old'
  | 'email_change_new'
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

  isTempEmail(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    return CONFIG.TempEmail.DOMAINS.includes(domain as typeof CONFIG.TempEmail.DOMAINS[number]);
  },

  normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  },

  maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return email;
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`;
    }
    const masked = localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1];
    return `${masked}@${domain}`;
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

  async getUserPendingVerifications(userId: string): Promise<PendingVerification[]> {
    const now = Date.now();

    const verifications = await this.env.DB.prepare(
      `SELECT * FROM email_verifications 
       WHERE user_id = ? AND status = 'pending' AND expires_at > ?
       ORDER BY created_at DESC`
    )
      .bind(userId, now)
      .all();

    return verifications.results.map((v) => {
      const verification = v as {
        id: string;
        email: string;
        verification_type: string;
        expires_at: number;
        created_at: number;
        attempt_count: number;
        max_attempts: number;
        metadata: string;
      };
      return {
        id: verification.id,
        email: emailVerificationUtils.maskEmail(verification.email),
        verificationType: verification.verification_type,
        expiresAt: verification.expires_at,
        remainingTime: verification.expires_at - now,
        canResend: verification.expires_at - now <= 60000,
        attemptCount: verification.attempt_count,
        maxAttempts: verification.max_attempts,
        createdAt: verification.created_at,
        metadata: JSON.parse(verification.metadata || '{}'),
      };
    });
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

  async getVerificationStatus(
    email: string,
    verificationType: VerificationType,
    userId: string | null = null
  ): Promise<PendingVerification | EmailChangeRequestStatus | null> {
    if (verificationType.includes('email_change') && userId) {
      return await this.getPendingEmailChangeRequest(userId);
    }

    return await this.getPendingVerification(email, verificationType, userId);
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

  async getVerificationStateForFrontend(
    email: string,
    verificationType: VerificationType,
    userId: string | null = null,
    additionalData: Record<string, unknown> = {}
  ): Promise<{
    hasPendingVerification: boolean;
    verificationStatus: PendingVerification | EmailChangeRequestStatus | null;
    canResend: boolean;
    resendReason: string;
    waitTime?: number;
  } & Record<string, unknown>> {
    const status = await this.getVerificationStatus(email, verificationType, userId);
    const canResend = await this.canResendVerification(email, verificationType, userId);

    return {
      hasPendingVerification: !!status,
      verificationStatus: status,
      canResend: canResend.canResend,
      resendReason: canResend.reason,
      waitTime: canResend.waitTime,
      ...additionalData,
    };
  }

  generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async checkEmailRateLimit(email: string, ipAddress: string): Promise<boolean> {
    const configService = new ConfigService(this.env);
    const now = Date.now();
    const oneHourAgo = now - CONFIG.Stats.HOUR_IN_MS;
    const oneDayAgo = now - CONFIG.Stats.DAY_IN_MS;

    const hourlyCount = (await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM email_send_logs 
       WHERE (recipient_email = ? OR ip_address = ?) 
       AND created_at > ? AND send_status = 'sent'`
    )
      .bind(email, ipAddress, oneHourAgo)
      .first()) as { count: number };

    const hourlyLimit = await configService.getInt(DB_CONFIG_KEYS.EMAIL_RATE_LIMIT_PER_HOUR, 5);
    if (hourlyCount.count >= hourlyLimit) {
      throw new Error(`发送频率过快，请1小时后再试（每小时限制${hourlyLimit}次）`);
    }

    const dailyCount = (await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM email_send_logs 
       WHERE (recipient_email = ? OR ip_address = ?) 
       AND created_at > ? AND send_status = 'sent'`
    )
      .bind(email, ipAddress, oneDayAgo)
      .first()) as { count: number };

    const dailyLimit = await configService.getInt(DB_CONFIG_KEYS.EMAIL_RATE_LIMIT_PER_DAY, 20);
    if (dailyCount.count >= dailyLimit) {
      throw new Error(`今日发送次数已达上限，请明天再试（每日限制${dailyLimit}次）`);
    }

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

    const verificationId = generateId();

    await this.env.DB.prepare(
      `INSERT INTO email_verifications (
        id, user_id, email, email_hash, verification_code, code_hash,
        verification_type, status, expires_at, created_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

    const query = `
      SELECT * FROM email_verifications 
      WHERE email_hash = ? AND code_hash = ? AND verification_type = ?
      AND status = 'pending' AND expires_at > ?
      ${userId ? 'AND user_id = ?' : 'AND user_id IS NULL'}
      ORDER BY created_at DESC LIMIT 1
    `;

    const params = userId ? [emailHash, codeHash, verificationType, now, userId] : [emailHash, codeHash, verificationType, now];

    const verification = await this.env.DB.prepare(query)
      .bind(...params)
      .first();

    if (!verification) {
      await this.recordFailedAttempt(emailHash, inputCode, verificationType);
      throw new Error('验证码无效或已过期');
    }

    const v = verification as {
      id: string;
      attempt_count: number;
      max_attempts: number;
      metadata: string;
    };

    if (v.attempt_count >= v.max_attempts) {
      throw new Error('验证尝试次数已达上限，请重新申请验证码');
    }

    await this.env.DB.prepare(
      `UPDATE email_verifications 
       SET status = 'used', used_at = ?
       WHERE id = ?`
    )
      .bind(now, v.id)
      .run();

    return {
      success: true,
      verificationId: v.id,
      metadata: JSON.parse(v.metadata || '{}'),
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

  async sendVerificationEmail(
    email: string,
    verificationCode: string,
    templateType: VerificationType,
    templateVars: Record<string, unknown> = {}
  ): Promise<{ success: boolean; messageId?: string; message: string }> {
    if (!this.resendApiKey) {
      throw new Error('邮件服务未配置');
    }

    const configService = new ConfigService(this.env);
    const verificationCodeExpiry = await configService.getInt(DB_CONFIG_KEYS.VERIFICATION_CODE_EXPIRY, 900000);
    const defaultFromName = this.env.DEFAULT_FROM_NAME || 'Atlas';

    const mappedTemplateType = this.getTemplateType(templateType);
    const template = await this.getEmailTemplate(mappedTemplateType);

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
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${defaultFromName} <${this.defaultFromEmail}>`,
          to: [email],
          subject: subject,
          html: htmlContent,
          text: textContent,
          tags: [
            {
              name: 'type',
              value: mappedTemplateType,
            },
            {
              name: 'source',
              value: 'email-verification',
            },
          ],
        }),
      });

      const result = (await response.json()) as { id?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.message || '邮件发送失败');
      }

      await this.logEmailSend(email, mappedTemplateType, 'sent', {
        messageId: result.id,
        subject,
        templateName: template.template_name,
      });

      return {
        success: true,
        messageId: result.id,
        message: '验证邮件已发送',
      };
    } catch (error) {
      console.error('发送邮件失败:', error);

      await this.logEmailSend(email, mappedTemplateType, 'failed', {
        error: (error as Error).message,
        subject,
        templateName: template.template_name,
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

  private async logEmailSend(
    email: string,
    emailType: string,
    status: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    const logId = generateId();
    await this.env.DB.prepare(
      `INSERT INTO email_send_logs (
        id, recipient_email, email_type, send_status, provider,
        provider_message_id, template_name, subject, send_error,
        created_at, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        logId,
        email,
        emailType,
        status,
        'resend',
        (details.messageId as string) || null,
        (details.templateName as string) || null,
        (details.subject as string) || null,
        (details.error as string) || null,
        Date.now(),
        status === 'sent' ? Date.now() : null
      )
      .run();
  }

  async cleanupExpiredVerifications(): Promise<number> {
    const deleted = await this.env.DB.prepare(
      `DELETE FROM email_verifications 
       WHERE expires_at < ? AND status = 'pending'`
    )
      .bind(Date.now())
      .run();

    return (deleted.meta as { changes?: number })?.changes || 0;
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

  async createEmailChangeRequest(
    userId: string,
    oldEmail: string,
    newEmail: string
  ): Promise<{ id: string; expiresAt: number }> {
    const requestId = generateId();
    const newEmailHash = await hashToken(newEmail);
    const expiryTime = Date.now() + R.EMAIL_CHANGE.REQUEST_EXPIRY_MS;

    await this.env.DB.prepare(
      `INSERT INTO email_change_requests (
        id, user_id, old_email, new_email, new_email_hash,
        status, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(requestId, userId, oldEmail, newEmail, newEmailHash, 'pending', expiryTime, Date.now())
      .run();

    return {
      id: requestId,
      expiresAt: expiryTime,
    };
  }

  async completeEmailChange(
    requestId: string,
    userId: string
  ): Promise<{ success: boolean; newEmail: string; message: string }> {
    const request = await this.env.DB.prepare(
      `SELECT * FROM email_change_requests 
       WHERE id = ? AND user_id = ? AND status = 'pending'
       AND expires_at > ?`
    )
      .bind(requestId, userId, Date.now())
      .first();

    if (!request) {
      throw new Error('邮箱更改请求不存在或已过期');
    }

    const r = request as {
      new_email: string;
      new_email_verified: number;
    };

    if (!r.new_email_verified) {
      throw new Error('新邮箱尚未验证');
    }

    try {
      await this.env.DB.prepare(`UPDATE users SET email = ?, updated_at = ? WHERE id = ?`)
        .bind(r.new_email, Date.now(), userId)
        .run();

      await this.env.DB.prepare(
        `UPDATE email_change_requests 
         SET status = 'completed', completed_at = ?
         WHERE id = ?`
      )
        .bind(Date.now(), requestId)
        .run();

      return {
        success: true,
        newEmail: r.new_email,
        message: '邮箱更改成功',
      };
    } catch (error) {
      console.error('完成邮箱更改失败:', error);
      throw new Error('邮箱更改失败', { cause: error });
    }
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

  async markEmailVerificationCompleted(requestId: string, verificationType: string): Promise<void> {
    const updateField = verificationType === 'email_change_old' ? 'old_email_verified = 1' : 'new_email_verified = 1';

    await this.env.DB.prepare(
      `UPDATE email_change_requests 
       SET ${updateField}, updated_at = ?
       WHERE id = ?`
    )
      .bind(Date.now(), requestId)
      .run();
  }

  async getVerificationStats(timeRange = 'day'): Promise<{
    verifications: Array<{ verification_type: string; status: string; count: number }>;
    emails: Array<{ send_status: string; count: number }>;
    period: string;
  }> {
    const timeMap: Record<string, number> = {
      day: Date.now() - CONFIG.Stats.DAY_IN_MS,
      week: Date.now() - CONFIG.Stats.WEEK_IN_MS,
      month: Date.now() - 30 * CONFIG.Stats.DAY_IN_MS,
    };

    const since = timeMap[timeRange] || timeMap.day;

    const stats = await this.env.DB.prepare(
      `SELECT 
        verification_type,
        status,
        COUNT(*) as count
      FROM email_verifications 
      WHERE created_at > ?
      GROUP BY verification_type, status`
    )
      .bind(since)
      .all();

    const emailStats = await this.env.DB.prepare(
      `SELECT 
        send_status,
        COUNT(*) as count
      FROM email_send_logs 
      WHERE created_at > ?
      GROUP BY send_status`
    )
      .bind(since)
      .all();

    return {
      verifications: stats.results as Array<{ verification_type: string; status: string; count: number }>,
      emails: emailStats.results as Array<{ send_status: string; count: number }>,
      period: timeRange,
    };
  }

  private getTemplateType(verificationType: VerificationType): string {
    const mapping: Record<string, string> = {
      registration: 'registration',
      password_reset: 'forgot_password',
      forgot_password: 'forgot_password',
      email_change_old: 'email_change',
      email_change_new: 'email_change',
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
