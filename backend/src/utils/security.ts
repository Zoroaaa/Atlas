/**
 * 安全功能模块
 * 功能：安全锁定、安全事件记录、密码重置日志
 * 作者：CodeSeek Team
 * 日期：2024
 */
import { SecurityLockout, UserSecurityEvent, Env } from '@/types';
import { generateId } from '@/utils';
import { ConfigService } from '@/services';
import { CONFIG, DB_CONFIG_KEYS } from '@/constants';

const DEFAULT_SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  MAX_VERIFICATION_ATTEMPTS: 3,
  MAX_PASSWORD_RESET_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000,
  PASSWORD_RESET_LOCKOUT_MS: 60 * 60 * 1000,
  RECENT_FAILED_LOGINS_THRESHOLD: 3,
  RECENT_IP_LOGINS_THRESHOLD: 3,
  RECENT_PASSWORD_CHANGES_THRESHOLD: 2,
  SUSPICIOUS_ACTIVITY_THRESHOLD: 50,
};

export interface LockoutCheckResult {
  isLocked: boolean;
  lockedUntil?: number;
  remainingAttempts?: number;
  lockoutType?: string;
}

export async function checkLockout(
  db: D1Database,
  lockoutType: string,
  identifier: string
): Promise<LockoutCheckResult> {
  try {
    const lockout = await db.prepare(
      'SELECT * FROM security_lockouts WHERE lockout_type = ? AND identifier = ? AND locked_until > ?'
    ).bind(lockoutType, identifier, Date.now()).first<SecurityLockout>();

    if (lockout) {
      return {
        isLocked: true,
        lockedUntil: lockout.locked_until,
        lockoutType: lockout.lockout_type,
      };
    }

    const attemptRecord = await db.prepare(
      'SELECT * FROM security_lockouts WHERE lockout_type = ? AND identifier = ?'
    ).bind(lockoutType, identifier).first<SecurityLockout>();

    if (attemptRecord) {
      return {
        isLocked: false,
        remainingAttempts: Math.max(0, attemptRecord.max_attempts - attemptRecord.attempt_count),
      };
    }

    return { isLocked: false };
  } catch (err) {
    console.error('Check lockout error:', err);
    return { isLocked: false };
  }
}

export async function recordFailedAttempt(
  env: Env,
  lockoutType: string,
  identifier: string,
  maxAttempts?: number,
  lockoutDuration?: number,
  ipAddress?: string,
  userAgent?: string
): Promise<LockoutCheckResult> {
  const configService = new ConfigService(env);
  const db = env.DB;
  const now = Date.now();
  
  const configMaxLoginAttempts = await configService.getInt(DB_CONFIG_KEYS.MAX_LOGIN_ATTEMPTS, DEFAULT_SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS);
  const configMaxVerificationAttempts = await configService.getInt(DB_CONFIG_KEYS.MAX_VERIFICATION_ATTEMPTS, DEFAULT_SECURITY_CONFIG.MAX_VERIFICATION_ATTEMPTS);
  const configMaxPasswordResetAttempts = await configService.getInt(DB_CONFIG_KEYS.PASSWORD_RESET_MAX_ATTEMPTS, DEFAULT_SECURITY_CONFIG.MAX_PASSWORD_RESET_ATTEMPTS);
  const configLockoutDuration = await configService.getInt(DB_CONFIG_KEYS.LOCKOUT_DURATION_MS, DEFAULT_SECURITY_CONFIG.LOCKOUT_DURATION_MS);
  const configPasswordResetLockout = await configService.getInt(DB_CONFIG_KEYS.PASSWORD_RESET_LOCKOUT_DURATION, DEFAULT_SECURITY_CONFIG.PASSWORD_RESET_LOCKOUT_MS);

  const max = maxAttempts || (
    lockoutType === 'password_reset' ? configMaxPasswordResetAttempts :
    lockoutType === 'verification' ? configMaxVerificationAttempts :
    configMaxLoginAttempts
  );
  const duration = lockoutDuration || (
    lockoutType === 'password_reset' ? configPasswordResetLockout : configLockoutDuration
  );

  try {
    const existing = await db.prepare(
      'SELECT * FROM security_lockouts WHERE lockout_type = ? AND identifier = ?'
    ).bind(lockoutType, identifier).first<SecurityLockout>();

    if (existing) {
      if (existing.locked_until > now) {
        return {
          isLocked: true,
          lockedUntil: existing.locked_until,
        };
      }

      const newAttemptCount = existing.attempt_count + 1;

      if (newAttemptCount >= max) {
        const lockedUntil = now + duration;
        await db.prepare(`
          UPDATE security_lockouts 
          SET attempt_count = ?, last_attempt_at = ?, locked_until = ?, ip_address = ?, user_agent = ?
          WHERE id = ?
        `).bind(newAttemptCount, now, lockedUntil, ipAddress || null, userAgent || null, existing.id).run();

        return {
          isLocked: true,
          lockedUntil: lockedUntil,
          remainingAttempts: 0,
        };
      }

      await db.prepare(`
        UPDATE security_lockouts 
        SET attempt_count = ?, last_attempt_at = ?, ip_address = ?, user_agent = ?
        WHERE id = ?
      `).bind(newAttemptCount, now, ipAddress || null, userAgent || null, existing.id).run();

      return {
        isLocked: false,
        remainingAttempts: max - newAttemptCount,
      };
    }

    const id = generateId();
    await db.prepare(`
      INSERT INTO security_lockouts (
        id, lockout_type, identifier, attempt_count, max_attempts, lockout_duration,
        first_attempt_at, last_attempt_at, locked_until, created_at, ip_address, user_agent
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, lockoutType, identifier, max, duration, now, now, 0, now, ipAddress || null, userAgent || null).run();

    return {
      isLocked: false,
      remainingAttempts: max - 1,
    };
  } catch (err) {
    console.error('Record failed attempt error:', err);
    return { isLocked: false };
  }
}

export async function clearLockout(
  db: D1Database,
  lockoutType: string,
  identifier: string
): Promise<void> {
  try {
    await db.prepare(
      'DELETE FROM security_lockouts WHERE lockout_type = ? AND identifier = ?'
    ).bind(lockoutType, identifier).run();
  } catch (err) {
    console.error('Clear lockout error:', err);
  }
}

export async function recordSecurityEvent(
  db: D1Database,
  params: {
    userId?: string | null;
    eventType: string;
    eventSubtype?: string;
    eventStatus?: string;
    eventData?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    riskScore?: number;
    riskFactors?: string[];
  }
): Promise<void> {
  try {
    const id = generateId();
    await db.prepare(`
      INSERT INTO user_security_events (
        id, user_id, event_type, event_subtype, event_status, event_data,
        ip_address, user_agent, session_id, risk_score, risk_factors, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      params.userId || null,
      params.eventType,
      params.eventSubtype || null,
      params.eventStatus || 'success',
      JSON.stringify(params.eventData || {}),
      params.ipAddress || null,
      params.userAgent || null,
      params.sessionId || null,
      params.riskScore || 0,
      JSON.stringify(params.riskFactors || []),
      Date.now()
    ).run();
  } catch (err) {
    console.error('Record security event error:', err);
  }
}

export async function recordPasswordResetLog(
  db: D1Database,
  params: {
    userId?: string | null;
    email: string;
    requestType: string;
    requestStatus?: string;
    ipAddress?: string;
    userAgent?: string;
    verificationCodeSent?: boolean;
  }
): Promise<string> {
  const id = generateId();
  const now = Date.now();

  try {
    await db.prepare(`
      INSERT INTO password_reset_logs (
        id, user_id, email, request_type, request_status, ip_address, user_agent,
        verification_code_sent, verification_attempts, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).bind(
      id,
      params.userId || null,
      params.email,
      params.requestType,
      params.requestStatus || 'initiated',
      params.ipAddress || null,
      params.userAgent || null,
      params.verificationCodeSent ? 1 : 0,
      now
    ).run();
  } catch (err) {
    console.error('Record password reset log error:', err);
  }

  return id;
}

export async function updatePasswordResetLog(
  db: D1Database,
  logId: string,
  updates: {
    requestStatus?: string;
    verificationCodeSent?: boolean;
    verificationAttempts?: number;
    codeSentAt?: number;
    verifiedAt?: number;
    completedAt?: number;
  }
): Promise<void> {
  try {
    const setClauses: string[] = [];
    const values: (number | string)[] = [];

    if (updates.requestStatus !== undefined) {
      setClauses.push('request_status = ?');
      values.push(updates.requestStatus);
    }
    if (updates.verificationCodeSent !== undefined) {
      setClauses.push('verification_code_sent = ?');
      values.push(updates.verificationCodeSent ? 1 : 0);
    }
    if (updates.verificationAttempts !== undefined) {
      setClauses.push('verification_attempts = ?');
      values.push(updates.verificationAttempts);
    }
    if (updates.codeSentAt !== undefined) {
      setClauses.push('code_sent_at = ?');
      values.push(updates.codeSentAt);
    }
    if (updates.verifiedAt !== undefined) {
      setClauses.push('verified_at = ?');
      values.push(updates.verifiedAt);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push('completed_at = ?');
      values.push(updates.completedAt);
    }

    if (setClauses.length === 0) return;

    values.push(logId);
    await db.prepare(
      `UPDATE password_reset_logs SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...values).run();
  } catch (err) {
    console.error('Update password reset log error:', err);
  }
}

export async function getRecentSecurityEvents(
  db: D1Database,
  userId: string,
  limit: number = 20
): Promise<UserSecurityEvent[]> {
  try {
    const result = await db.prepare(
      'SELECT * FROM user_security_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).bind(userId, limit).all<UserSecurityEvent>();

    return result.results || [];
  } catch (err) {
    console.error('Get recent security events error:', err);
    return [];
  }
}

export async function detectSuspiciousActivity(
  env: Env,
  userId: string,
  ipAddress: string
): Promise<{ isSuspicious: boolean; riskScore: number; factors: string[] }> {
  const factors: string[] = [];
  let riskScore = 0;
  const db = env.DB;

  try {
    const recentFailedLoginsThreshold = DEFAULT_SECURITY_CONFIG.RECENT_FAILED_LOGINS_THRESHOLD;
    const recentIpLoginsThreshold = DEFAULT_SECURITY_CONFIG.RECENT_IP_LOGINS_THRESHOLD;
    const recentPasswordChangesThreshold = DEFAULT_SECURITY_CONFIG.RECENT_PASSWORD_CHANGES_THRESHOLD;
    const suspiciousActivityThreshold = DEFAULT_SECURITY_CONFIG.SUSPICIOUS_ACTIVITY_THRESHOLD;

    const recentFailedLogins = await db.prepare(
    `SELECT COUNT(*) as count FROM user_security_events 
     WHERE user_id = ? AND event_type = 'login' AND event_status = 'failed' AND created_at > ?`
  ).bind(userId, Date.now() - CONFIG.Stats.DAY_IN_MS).first<{ count: number }>();

  if (recentFailedLogins && recentFailedLogins.count >= recentFailedLoginsThreshold) {
    factors.push('多次登录失败');
    riskScore += 20;
  }

  const recentIpLogins = await db.prepare(
    `SELECT COUNT(DISTINCT ip_address) as count FROM user_security_events 
     WHERE user_id = ? AND event_type = 'login' AND event_status = 'success' AND created_at > ? AND ip_address IS NOT NULL`
  ).bind(userId, Date.now() - CONFIG.Stats.WEEK_IN_MS).first<{ count: number }>();

  const knownIpLogin = await db.prepare(
    `SELECT COUNT(*) as count FROM user_security_events 
     WHERE user_id = ? AND event_type = 'login' AND event_status = 'success' AND ip_address = ? AND created_at > ?`
  ).bind(userId, ipAddress, Date.now() - CONFIG.Stats.MONTH_IN_MS).first<{ count: number }>();

  if (recentIpLogins && recentIpLogins.count >= recentIpLoginsThreshold && (!knownIpLogin || knownIpLogin.count === 0)) {
    factors.push('新IP地址登录');
    riskScore += 15;
  }

  const recentPasswordChanges = await db.prepare(
    `SELECT COUNT(*) as count FROM user_security_events 
     WHERE user_id = ? AND event_type = 'password_change' AND created_at > ?`
  ).bind(userId, Date.now() - CONFIG.Stats.DAY_IN_MS).first<{ count: number }>();

  if (recentPasswordChanges && recentPasswordChanges.count >= recentPasswordChangesThreshold) {
    factors.push('频繁修改密码');
    riskScore += 30;
  }

  return {
    isSuspicious: riskScore >= suspiciousActivityThreshold,
    riskScore: Math.min(riskScore, 100),
    factors,
  };
  } catch (err) {
    console.error('Detect suspicious activity error:', err);
    return { isSuspicious: false, riskScore: 0, factors: [] };
  }
}
