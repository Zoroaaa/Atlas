/**
 * 账号安全工具：失败尝试计数与锁定、安全事件与密码重置审计日志、可疑登录打分。
 *
 * 统一采用 fail-open：安全表查询/写入异常时只打日志并放行，避免 D1 抖动导致登录不可用。
 */
import { SecurityLockout, UserSecurityEvent, Env } from '@/types';
import { generateId, hashToken } from '@/utils';
import { ConfigService } from '@/services';
import { CONFIG, DB_CONFIG_KEYS } from '@/constants';

/** DB 配置缺失时的兜底值；次数单位见键名，时长单位为毫秒，后台 system_config 可覆盖 */
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

/** 锁定检查结果：isLocked=false 时 remainingAttempts 为剩余可尝试次数 */
export interface LockoutCheckResult {
  isLocked: boolean;
  lockedUntil?: number;
  remainingAttempts?: number;
  lockoutType?: string;
}

/** 查询指定标识是否处于锁定期；未锁定时尽量返回剩余尝试次数。 */
export async function checkLockout(
  db: D1Database,
  lockoutType: string,
  identifier: string
): Promise<LockoutCheckResult> {
  try {
    const identifierHash = await hashToken(identifier);
    const lockout = await db.prepare(
      'SELECT * FROM security_lockouts WHERE lockout_type = ? AND identifier_hash = ? AND locked_until > ?'
    ).bind(lockoutType, identifierHash, Date.now()).first<SecurityLockout>();

    if (lockout) {
      return {
        isLocked: true,
        lockedUntil: lockout.locked_until,
        lockoutType: lockout.lockout_type,
      };
    }

    const attemptRecord = await db.prepare(
      'SELECT * FROM security_lockouts WHERE lockout_type = ? AND identifier_hash = ?'
    ).bind(lockoutType, identifierHash).first<SecurityLockout>();

    if (attemptRecord) {
      return {
        isLocked: false,
        remainingAttempts: Math.max(0, attemptRecord.max_attempts - attemptRecord.attempt_count),
      };
    }

    return { isLocked: false };
  } catch (err) {
    // fail-open：安全表不可用时按未锁定处理，保证正常用户仍能登录
    console.error('Check lockout error:', err);
    return { isLocked: false };
  }
}

/** 记录一次失败尝试；达到阈值时写入锁定截止时间并返回剩余次数/锁定信息。 */
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
  const identifierHash = await hashToken(identifier);
  
  const securityConfig = await configService.getGroup('security');
  
  const configMaxLoginAttempts = parseInt(securityConfig[DB_CONFIG_KEYS.MAX_LOGIN_ATTEMPTS] || String(DEFAULT_SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS), 10);
  const configMaxVerificationAttempts = parseInt(securityConfig[DB_CONFIG_KEYS.MAX_VERIFICATION_ATTEMPTS] || String(DEFAULT_SECURITY_CONFIG.MAX_VERIFICATION_ATTEMPTS), 10);
  const configMaxPasswordResetAttempts = parseInt(securityConfig[DB_CONFIG_KEYS.PASSWORD_RESET_MAX_ATTEMPTS] || String(DEFAULT_SECURITY_CONFIG.MAX_PASSWORD_RESET_ATTEMPTS), 10);
  const configLockoutDuration = parseInt(securityConfig[DB_CONFIG_KEYS.LOCKOUT_DURATION_MS] || String(DEFAULT_SECURITY_CONFIG.LOCKOUT_DURATION_MS), 10);
  const configPasswordResetLockout = parseInt(securityConfig[DB_CONFIG_KEYS.PASSWORD_RESET_LOCKOUT_DURATION] || String(DEFAULT_SECURITY_CONFIG.PASSWORD_RESET_LOCKOUT_MS), 10);

  // 显式传入的阈值/时长优先，否则按 lockoutType 取对应配置（登录 / 验证码 / 重置密码口径不同）
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
      'SELECT * FROM security_lockouts WHERE lockout_type = ? AND identifier_hash = ?'
    ).bind(lockoutType, identifierHash).first<SecurityLockout>();

    if (existing) {
      // 仍在锁定期内：不再累加次数，直接返回剩余锁定时间
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
        id, lockout_type, identifier, identifier_hash, attempt_count, max_attempts, lockout_duration,
        first_attempt_at, last_attempt_at, locked_until, created_at, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, lockoutType, identifier, identifierHash, max, duration, now, now, 0, now, ipAddress || null, userAgent || null).run();

    return {
      isLocked: false,
      remainingAttempts: max - 1,
    };
  } catch (err) {
    // fail-open：计数写入失败不阻断本次登录/重置尝试
    console.error('Record failed attempt error:', err);
    return { isLocked: false };
  }
}

/** 清除指定标识的锁定记录（登录成功或重置密码流程完成后调用）。 */
export async function clearLockout(
  db: D1Database,
  lockoutType: string,
  identifier: string
): Promise<void> {
  try {
    const identifierHash = await hashToken(identifier);
    await db.prepare(
      'DELETE FROM security_lockouts WHERE lockout_type = ? AND identifier_hash = ?'
    ).bind(lockoutType, identifierHash).run();
  } catch (err) {
    console.error('Clear lockout error:', err);
  }
}

/** 写一条安全事件；eventData / riskFactors 以 JSON 字符串落库，写入失败不抛错。 */
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

/** 写一条密码重置审计日志并返回日志 id，供后续按 id 回填状态。 */
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
  const emailHash = await hashToken(params.email);

  try {
    await db.prepare(`
      INSERT INTO password_reset_logs (
        id, user_id, email, email_hash, request_type, request_status, ip_address, user_agent,
        verification_code_sent, verification_attempts, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).bind(
      id,
      params.userId || null,
      params.email,
      emailHash,
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

/** 增量更新重置日志；只处理显式传入的字段，全部缺省时不产生 SQL。 */
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
    // 字段映射逐项显式列出，避免把外部对象直接展开进 SET 子句
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

/** 读取用户最近的安全事件，默认 20 条，按时间倒序。 */
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

/**
 * 按固定时间窗给一次登录打分：失败登录（24h）、新 IP（7d/30d）、频繁改密（24h）。
 * 阈值直接取代码内默认值，不读 DB 配置，修改需重新部署。
 */
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

  // 近 24h 失败登录达到 3 次：+20
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

  // 近 7 天出现 ≥3 个不同 IP，且当前 IP 近 30 天没有成功登录记录：+15
  if (recentIpLogins && recentIpLogins.count >= recentIpLoginsThreshold && (!knownIpLogin || knownIpLogin.count === 0)) {
    factors.push('新IP地址登录');
    riskScore += 15;
  }

  const recentPasswordChanges = await db.prepare(
    `SELECT COUNT(*) as count FROM user_security_events 
     WHERE user_id = ? AND event_type = 'password_change' AND created_at > ?`
  ).bind(userId, Date.now() - CONFIG.Stats.DAY_IN_MS).first<{ count: number }>();

  // 近 24h 改密达到 2 次：+30
  if (recentPasswordChanges && recentPasswordChanges.count >= recentPasswordChangesThreshold) {
    factors.push('频繁修改密码');
    riskScore += 30;
  }

  // 单项分数都低于 50，需至少两类信号叠加才判定可疑；对外封顶 100
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
