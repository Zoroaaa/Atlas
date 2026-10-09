import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '@/types';
import { success, error, generateId, hashPassword, hashToken, verifyPassword, generateToken, verifyToken, validateEmail, validateUsername, validatePassword, logUserAction, getClientIP, checkLockout, clearLockout, recordSecurityEvent } from '@/utils';
import { recordFailedAttempt, recordPasswordResetLog, updatePasswordResetLog } from '@/utils/security';
import { EmailVerificationService, emailVerificationUtils, ConfigService } from '@/services';
import { CONFIG, VALIDATION_RULES, DB_CONFIG_KEYS } from '@/constants';
import { authMiddleware } from '@/middleware/auth';
import { validateBody, schemas } from '@/validation';
import { findUserForLogin, findUserWithRoleById, findUserById, findActiveUserByEmail, findUserBasicById, findUsernameById, existsUserByUsernameOrEmail, existsUserByEmail, existsUserByEmailExcluding, recordLogin, updateUserPassword, updateUserEmail, createUserWithSession, resetPasswordAndRevokeSessions, deleteAccountCascade, insertSession, findActiveSessionByToken, touchSession, rotateSessionToken, deleteSessionByToken } from '@/repositories/user-repository';
import { findVerificationByCode, findLatestVerificationByEmailType, listPendingVerificationsByUser, deleteVerificationById, findPendingChangeRequestById, findActiveChangeRequestByUser, insertChangeRequest, markChangeRequestVerified, findChangeRequestById, completeChangeRequest } from '@/repositories/email-verification-repository';

const R = VALIDATION_RULES;

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.use('/request-email-change', authMiddleware);
authRoutes.use('/send-email-change-code', authMiddleware);
authRoutes.use('/verify-email-change-code', authMiddleware);
authRoutes.use('/cancel-email-change-request', authMiddleware);
authRoutes.use('/send-account-delete-code', authMiddleware);
authRoutes.use('/user-verification-status', authMiddleware);

authRoutes.post('/login', validateBody(schemas.auth.login), async (c) => {
  const body = c.get('validatedBody') as { identifier: string; password: string };
  const { identifier, password } = body;

  if (!identifier || !password) {
    return c.json(error('VALIDATION_ERROR', '请输入用户名/邮箱和密码'), 400);
  }

  if (identifier.length > R.EMAIL.MAX_LENGTH) {
    return c.json(error('VALIDATION_ERROR', `用户名/邮箱最多${R.EMAIL.MAX_LENGTH}个字符`), 400);
  }

  if (password.length > R.PASSWORD.MAX_LENGTH) {
    return c.json(error('VALIDATION_ERROR', `密码最多${R.PASSWORD.MAX_LENGTH}个字符`), 400);
  }

  try {
    const clientIP = getClientIP(c);
    const userAgent = c.req.header('User-Agent') || '';

    const lockoutCheck = await checkLockout(c.env.DB, 'login', identifier);
    if (lockoutCheck.isLocked) {
      const remainingTime = lockoutCheck.lockedUntil ? Math.ceil((lockoutCheck.lockedUntil - Date.now()) / 60000) : 0;
      return c.json(error('LOCKED', `账户已锁定，请${remainingTime}分钟后再试`), 423);
    }

    const queryField: 'username' | 'email' = identifier.includes('@') ? 'email' : 'username';
    const user = await findUserForLogin(c.env.DB, queryField, identifier);

    if (!user) {
      const lockoutResult = await recordFailedAttempt(c.env, 'login', identifier, undefined, undefined, clientIP, userAgent);
      return c.json(error('AUTH_ERROR', `用户名/邮箱或密码错误${lockoutResult.remainingAttempts ? `，剩余${lockoutResult.remainingAttempts}次尝试机会` : ''}`), 401);
    }

    if (!user.is_active) {
      await logUserAction(c.env, user.id, 'login_failed', { reason: '账号已被禁用', ip: clientIP }, c);

      c.executionCtx.waitUntil(
        recordSecurityEvent(c.env.DB, {
          userId: user.id,
          eventType: 'login',
          eventStatus: 'failed',
          eventData: { reason: 'account_disabled' },
          ipAddress: clientIP,
          userAgent,
        })
      );

      return c.json(error('AUTH_ERROR', '账号已被禁用'), 403);
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      await logUserAction(c.env, user.id, 'login_failed', { reason: '密码错误', ip: clientIP }, c);

      const lockoutResult = await recordFailedAttempt(c.env, 'login', identifier, undefined, undefined, clientIP, userAgent);

      c.executionCtx.waitUntil(
        recordSecurityEvent(c.env.DB, {
          userId: user.id,
          eventType: 'login',
          eventStatus: 'failed',
          eventData: { reason: 'wrong_password', remainingAttempts: lockoutResult.remainingAttempts },
          ipAddress: clientIP,
          userAgent,
        })
      );

      if (lockoutResult.isLocked) {
        return c.json(error('LOCKED', '登录失败次数过多，账户已锁定1小时'), 423);
      }

      return c.json(error('AUTH_ERROR', `用户名/邮箱或密码错误${lockoutResult.remainingAttempts ? `，剩余${lockoutResult.remainingAttempts}次尝试机会` : ''}`), 401);
    }

    await clearLockout(c.env.DB, 'login', identifier);

    const now = Date.now();
    await recordLogin(c.env.DB, user.id, now);

    const userRole = user.role_name || 'user';
    const expiryDays = parseInt(c.env.JWT_EXPIRY_DAYS || '30', 10);
    const token = await generateToken(user.id, user.username, c.env.JWT_SECRET, expiryDays, userRole);

    const tokenHash = await hashToken(token);
    const sessionId = generateId();
    const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

    await insertSession(c.env.DB, { sessionId, userId: user.id, tokenHash, expiresAt, now, ipAddress: clientIP, userAgent });

    c.executionCtx.waitUntil(logUserAction(c.env, user.id, 'login', { method: 'password', ip: clientIP }, c));

    c.executionCtx.waitUntil(
      recordSecurityEvent(c.env.DB, {
        userId: user.id,
        eventType: 'login',
        eventStatus: 'success',
        ipAddress: clientIP,
        userAgent,
      })
    );

    return c.json(success({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        permissions: (() => { try { return JSON.parse(user.permissions || '[]'); } catch { return []; } })(),
        settings: (() => { try { return JSON.parse(user.settings || '{}'); } catch { return {}; } })(),
        isActive: user.is_active === 1,
        emailVerified: user.email_verified === 1,
        createdAt: user.created_at,
        lastLogin: now,
        loginCount: user.login_count + 1,
        role: userRole,
        roleDisplayName: user.role_display_name || '普通用户',
      },
      token,
    }, '登录成功'));
  } catch (err) {
    console.error('Login error:', err);
    return c.json(error('SERVER_ERROR', '登录失败，请稍后重试'), 500);
  }
});

authRoutes.post('/register', validateBody(schemas.auth.register), async (c) => {
  const configService = new ConfigService(c.env);
  const enableRegistration = await configService.getBoolean(DB_CONFIG_KEYS.ENABLE_REGISTRATION, true);
  
  if (!enableRegistration) {
    return c.json(error('FORBIDDEN', '注册功能已关闭'), 403);
  }

  const body = c.get('validatedBody') as { username: string; email: string; password: string; verificationCode?: string };
  const { username, email, password, verificationCode } = body;

  if (!username || !email || !password) {
    return c.json(error('VALIDATION_ERROR', '请填写所有必填项'), 400);
  }

  const usernameMinLength = R.USERNAME.MIN_LENGTH;
  const usernameMaxLength = R.USERNAME.MAX_LENGTH;
  const passwordMinLength = R.PASSWORD.MIN_LENGTH;

  if (!validateUsername(username)) {
    return c.json(error('VALIDATION_ERROR', `用户名需要${usernameMinLength}-${usernameMaxLength}个字符，只能包含字母、数字和下划线`), 400);
  }

  if (!validateEmail(email)) {
    return c.json(error('VALIDATION_ERROR', '请输入有效的邮箱地址'), 400);
  }

  if (!validatePassword(password)) {
    return c.json(error('VALIDATION_ERROR', `密码至少需要${passwordMinLength}个字符`), 400);
  }

  const normalizedEmail = emailVerificationUtils.normalizeEmail(email);

  // 邮箱域名白名单验证：只允许主流邮箱注册
  if (!emailVerificationUtils.isTrustedEmailDomain(normalizedEmail)) {
    return c.json(error('VALIDATION_ERROR', '请使用主流邮箱注册（如 Gmail、QQ邮箱、163邮箱等）'), 400);
  }

  try {
    const exists = await existsUserByUsernameOrEmail(c.env.DB, username, normalizedEmail);

    if (exists) {
      return c.json(error('VALIDATION_ERROR', '用户名或邮箱已被注册'), 400);
    }

    let emailVerified = 0;
    if (verificationCode) {
      const verification = await findVerificationByCode(c.env.DB, { email: normalizedEmail, code: verificationCode, type: 'registration', now: Date.now() });

      if (!verification) {
        return c.json(error('VALIDATION_ERROR', '验证码无效或已过期'), 400);
      }

      emailVerified = 1;
      
      await deleteVerificationById(c.env.DB, verification.id);
    }

    const userId = generateId();
    const now = Date.now();
    const passwordHash = await hashPassword(password);

    const expiryDays = parseInt(c.env.JWT_EXPIRY_DAYS || '30', 10);
    const token = await generateToken(userId, username, c.env.JWT_SECRET, expiryDays);

    const tokenHash = await hashToken(token);
    const sessionId = generateId();
    const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

    await createUserWithSession(c.env.DB, { userId, username, email: normalizedEmail, passwordHash, permissions: JSON.stringify([...CONFIG.Roles.DEFAULT_PERMISSIONS]), settings: JSON.stringify({}), emailVerified, sessionId, tokenHash, expiresAt, now, ipAddress: getClientIP(c), userAgent: c.req.header('User-Agent') || '' });

    await logUserAction(c.env, userId, 'register', { username, email: normalizedEmail }, c);

    return c.json(success({
      user: {
        id: userId,
        username,
        email: normalizedEmail,
        permissions: [...CONFIG.Roles.DEFAULT_PERMISSIONS],
        settings: {},
        isActive: true,
        emailVerified: emailVerified === 1,
        createdAt: now,
        lastLogin: now,
        loginCount: 1,
      },
      token,
    }, '注册成功'));
  } catch (err) {
    console.error('Register error:', err);
    return c.json(error('SERVER_ERROR', '注册失败，请稍后重试'), 500);
  }
});

authRoutes.post('/logout', authMiddleware, async (c) => {
  const payload = c.get('user');
  const token = c.get('authToken');

  try {
    const tokenHash = await hashToken(token);
    await deleteSessionByToken(c.env.DB, payload.userId, tokenHash);

    await logUserAction(c.env, payload.userId, 'logout', {}, c);

    return c.json(success(null, '登出成功'));
  } catch (err) {
    console.error('Logout error:', err);
    return c.json(error('SERVER_ERROR', '登出失败'), 500);
  }
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const payload = c.get('user');
  const token = c.get('authToken');

  try {
    const user = await findUserWithRoleById(c.env.DB, payload.userId);

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const tokenHash = await hashToken(token);
    const session = await findActiveSessionByToken(c.env.DB, user.id, tokenHash, Date.now());

    if (!session) {
      return c.json(error('AUTH_ERROR', '会话已过期'), 401);
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if ((session.last_activity as number) < fiveMinutesAgo) {
      c.executionCtx.waitUntil(touchSession(c.env.DB, session.id, Date.now()));
    }

    return c.json(success({
      id: user.id,
      username: user.username,
      email: user.email,
      permissions: (() => { try { return JSON.parse(user.permissions || '[]'); } catch { return []; } })(),
      settings: (() => { try { return JSON.parse(user.settings || '{}'); } catch { return {}; } })(),
      isActive: user.is_active === 1,
      emailVerified: user.email_verified === 1,
      createdAt: user.created_at,
      lastLogin: user.last_login,
      loginCount: user.login_count,
      role: user.role_name || 'user',
      roleDisplayName: user.role_display_name || '普通用户',
    }));
  } catch (err) {
    console.error('Get me error:', err);
    return c.json(error('SERVER_ERROR', '获取用户信息失败'), 500);
  }
});

authRoutes.post('/verify-token', authMiddleware, async (c) => {
  const payload = c.get('user');
  const token = c.get('authToken');

  try {
    const tokenHash = await hashToken(token);
    const session = await findActiveSessionByToken(c.env.DB, payload.userId, tokenHash, Date.now());

    if (!session) {
      return c.json(error('AUTH_ERROR', '会话已过期'), 401);
    }

    const user = await findUserBasicById(c.env.DB, payload.userId);

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    return c.json(success({
      valid: true,
      userId: user.id,
      username: user.username,
    }));
  } catch (err) {
    console.error('Verify token error:', err);
    return c.json(error('SERVER_ERROR', '验证失败'), 500);
  }
});

authRoutes.post('/forgot-password', validateBody(schemas.auth.forgotPassword), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.forgotPassword>;
  const { email } = body;

  const configService = new ConfigService(c.env);
  
  const verificationCodeExpiry = await configService.getInt(DB_CONFIG_KEYS.RESET_PASSWORD_CODE_EXPIRY, 30 * 60 * 1000);
  
  const normalizedEmail = emailVerificationUtils.normalizeEmail(email);
  const maskedEmail = emailVerificationUtils.maskEmail(normalizedEmail);
  const expiresIn = Math.floor(verificationCodeExpiry / 1000);

  try {
    const user = await findActiveUserByEmail(c.env.DB, normalizedEmail);

    if (!user) {
      return c.json(success({ 
        maskedEmail,
        expiresIn 
      }, '如果该邮箱已注册，您将收到密码重置邮件'));
    }

    const emailService = new EmailVerificationService(c.env);
    const ipAddress = getClientIP(c);
    const userAgent = c.req.header('User-Agent') || '';

    const resetLogId = await recordPasswordResetLog(c.env.DB, {
      userId: user.id,
      email: normalizedEmail,
      requestType: 'forgot_password',
      requestStatus: 'initiated',
      ipAddress,
      userAgent,
    });

    try {
      await emailService.checkEmailRateLimit(normalizedEmail, ipAddress);

      const verification = await emailService.createEmailVerification(
        normalizedEmail, 
        'forgot_password', 
        user.id, 
        { ipAddress, requestedAt: Date.now() }
      );

      await emailService.sendVerificationEmail(
        normalizedEmail,
        verification.code,
        'forgot_password',
        { username: user.username }
      );

      await updatePasswordResetLog(c.env.DB, resetLogId, {
        requestStatus: 'code_sent',
        verificationCodeSent: true,
        codeSentAt: Date.now(),
      });

      await logUserAction(c.env, user.id, 'forgot_password', { email: normalizedEmail }, c);
    } catch (sendError) {
      console.error('发送密码重置邮件失败:', sendError);
      await updatePasswordResetLog(c.env.DB, resetLogId, {
        requestStatus: 'failed',
      });
      return c.json(error('SERVER_ERROR', '验证码发送失败，请稍后重试'), 500);
    }

    return c.json(success({ 
      maskedEmail,
      expiresIn 
    }, '如果该邮箱已注册，您将收到密码重置邮件'));
  } catch (err) {
    console.error('Forgot password error:', err);
    return c.json(error('SERVER_ERROR', '请求失败，请稍后重试'), 500);
  }
});

authRoutes.post('/reset-password', validateBody(schemas.auth.resetPassword), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.resetPassword>;
  const { email, code, verificationCode, newPassword } = body;
  
  const actualCode = code || verificationCode;

  const normalizedEmail = emailVerificationUtils.normalizeEmail(email);
  const ipAddress = getClientIP(c);
  const userAgent = c.req.header('User-Agent') || '';

  try {
    const user = await findActiveUserByEmail(c.env.DB, normalizedEmail);

    if (!user) {
      return c.json(error('VALIDATION_ERROR', '用户不存在或已被禁用'), 400);
    }

    const resetLogId = await recordPasswordResetLog(c.env.DB, {
      userId: user.id,
      email: normalizedEmail,
      requestType: 'forgot_password',
      requestStatus: 'initiated',
      ipAddress,
      userAgent,
    });

    const emailService = new EmailVerificationService(c.env);

    try {
      await emailService.verifyCode(normalizedEmail, actualCode, 'forgot_password', user.id);
      await updatePasswordResetLog(c.env.DB, resetLogId, {
        requestStatus: 'code_verified',
        verifiedAt: Date.now(),
      });
    } catch (verifyError) {
      await updatePasswordResetLog(c.env.DB, resetLogId, {
        requestStatus: 'failed',
      });
      return c.json(error('VALIDATION_ERROR', (verifyError as Error).message || '验证码无效或已过期'), 400);
    }

    const passwordHash = await hashPassword(newPassword);
    const now = Date.now();

    await resetPasswordAndRevokeSessions(c.env.DB, user.id, passwordHash, now);

    await updatePasswordResetLog(c.env.DB, resetLogId, {
      requestStatus: 'completed',
      completedAt: now,
    });

    await logUserAction(c.env, user.id, 'reset_password', { email: normalizedEmail }, c);

    return c.json(success(null, '密码重置成功，请重新登录'));
  } catch (err) {
    console.error('Reset password error:', err);
    return c.json(error('SERVER_ERROR', '重置失败，请稍后重试'), 500);
  }
});

authRoutes.put('/change-password', authMiddleware, validateBody(schemas.auth.changePassword), async (c) => {
  const payload = c.get('user');

  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.changePassword>;
  const { currentPassword, newPassword } = body;

  try {
    const user = await findUserById(c.env.DB, payload.userId);

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return c.json(error('AUTH_ERROR', '当前密码错误'), 400);
    }

    const passwordHash = await hashPassword(newPassword);
    const now = Date.now();

    await updateUserPassword(c.env.DB, user.id, passwordHash, now);

    await logUserAction(c.env, user.id, 'change_password', {}, c);

    return c.json(success(null, '密码修改成功'));
  } catch (err) {
    console.error('Change password error:', err);
    return c.json(error('SERVER_ERROR', '修改失败，请稍后重试'), 500);
  }
});

authRoutes.delete('/account', authMiddleware, validateBody(schemas.auth.deleteAccount), async (c) => {
  const payload = c.get('user');

  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.deleteAccount>;
  const { password, verificationCode, confirmText } = body;

  if (confirmText !== '删除我的账户') {
    return c.json(error('VALIDATION_ERROR', '请输入正确的确认文字'), 400);
  }

  try {
    const user = await findUserById(c.env.DB, payload.userId);

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const verification = await findVerificationByCode(c.env.DB, { email: user.email, code: verificationCode, type: 'account_delete', now: Date.now(), userId: user.id });

    if (!verification) {
      return c.json(error('VALIDATION_ERROR', '验证码无效或已过期'), 400);
    }

    await deleteVerificationById(c.env.DB, verification.id);

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return c.json(error('AUTH_ERROR', '密码错误'), 400);
    }

    await deleteAccountCascade(c.env.DB, user.id);

    return c.json(success(null, '账户已删除'));
  } catch (err) {
    console.error('Delete account error:', err);
    return c.json(error('SERVER_ERROR', '删除失败，请稍后重试'), 500);
  }
});

authRoutes.post('/refresh', authMiddleware, async (c) => {
  const payload = c.get('user');
  const oldToken = c.get('authToken');

  try {
    const oldTokenHash = await hashToken(oldToken);
    const session = await findActiveSessionByToken(c.env.DB, payload.userId, oldTokenHash, Date.now());

    if (!session) {
      return c.json(error('AUTH_ERROR', '会话已过期'), 401);
    }

    const expiryDays = parseInt(c.env.JWT_EXPIRY_DAYS || '30', 10);
    const newToken = await generateToken(payload.userId, payload.username, c.env.JWT_SECRET, expiryDays);
    const newTokenHash = await hashToken(newToken);
    const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000;

    await rotateSessionToken(c.env.DB, session.id, newTokenHash, expiresAt, Date.now());

    await logUserAction(c.env, payload.userId, 'token_refresh', {}, c);

    return c.json(success({ token: newToken }, 'Token刷新成功'));
  } catch (err) {
    console.error('Token refresh error:', err);
    return c.json(error('SERVER_ERROR', 'Token刷新失败'), 500);
  }
});

authRoutes.post('/send-registration-code', validateBody(schemas.auth.sendRegistrationCode), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.sendRegistrationCode>;
  const { email } = body;

  const normalizedEmail = emailVerificationUtils.normalizeEmail(email);

  // 邮箱域名白名单验证：只允许主流邮箱注册
  if (!emailVerificationUtils.isTrustedEmailDomain(normalizedEmail)) {
    return c.json(error('VALIDATION_ERROR', '请使用主流邮箱注册（如 Gmail、QQ邮箱、163邮箱等）'), 400);
  }

  try {
    const exists = await existsUserByEmail(c.env.DB, normalizedEmail);

    if (exists) {
      return c.json(error('VALIDATION_ERROR', '该邮箱已被注册'), 400);
    }

    const emailService = new EmailVerificationService(c.env);
    const ipAddress = getClientIP(c);

    try {
      await emailService.checkEmailRateLimit(normalizedEmail, ipAddress);
    } catch (rateLimitError) {
      return c.json(error('RATE_LIMIT', (rateLimitError as Error).message), 429);
    }

    const verification = await emailService.createEmailVerification(
      normalizedEmail, 
      'registration', 
      null, 
      { ipAddress }
    );

    try {
      await emailService.sendVerificationEmail(
        normalizedEmail,
        verification.code,
        'registration',
        { username: '新用户' }
      );
    } catch (sendError) {
      console.error('发送注册验证码失败:', sendError);
      return c.json(error('SERVER_ERROR', '验证码发送失败，请稍后重试'), 500);
    }

    return c.json(success({ 
      maskedEmail: emailVerificationUtils.maskEmail(normalizedEmail),
      expiresIn: 900
    }, '验证码已发送'));
  } catch (err) {
    console.error('Send registration code error:', err);
    return c.json(error('SERVER_ERROR', '发送验证码失败'), 500);
  }
});

authRoutes.post('/request-email-change', validateBody(schemas.auth.requestEmailChange), async (c) => {
  const payload = c.get('user');

  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.requestEmailChange>;
  const { newEmail, currentPassword } = body;

  const normalizedNewEmail = emailVerificationUtils.normalizeEmail(newEmail);

  // 邮箱域名白名单验证：与注册保持一致，只允许主流邮箱
  if (!emailVerificationUtils.isTrustedEmailDomain(normalizedNewEmail)) {
    return c.json(error('VALIDATION_ERROR', '请使用主流邮箱（如 Gmail、QQ邮箱、163邮箱等）'), 400);
  }

  try {
    const user = await findUserById(c.env.DB, payload.userId);

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return c.json(error('AUTH_ERROR', '当前密码错误'), 400);
    }

    if (normalizedNewEmail === user.email.toLowerCase()) {
      return c.json(error('VALIDATION_ERROR', '新邮箱不能与当前邮箱相同'), 400);
    }

    const exists = await existsUserByEmailExcluding(c.env.DB, normalizedNewEmail, user.id);

    if (exists) {
      return c.json(error('VALIDATION_ERROR', '该邮箱已被其他用户使用'), 400);
    }

    const emailService = new EmailVerificationService(c.env);
    const changePendingExpiryMinutes = R.EMAIL_CHANGE.PENDING_EXPIRY_MINUTES;
    await emailService.cancelExpiredPendingRequests(user.id, changePendingExpiryMinutes);

    const activeRequest = await findActiveChangeRequestByUser(c.env.DB, { userId: user.id, now: Date.now() });

    if (activeRequest) {
      const createdAt = activeRequest.created_at;
      const elapsedMinutes = Math.floor((Date.now() - createdAt) / 60000);
      const remainingMinutes = changePendingExpiryMinutes - elapsedMinutes;
      return c.json(error('VALIDATION_ERROR', `您已有进行中的邮箱更改请求，请等待${remainingMinutes > 0 ? remainingMinutes : 1}分钟后再试或手动取消`), 400);
    }

    const requestId = generateId();
    const changeRequestExpiryMs = R.EMAIL_CHANGE.REQUEST_EXPIRY_MS;
    const expiresAt = Date.now() + changeRequestExpiryMs;
    const expiresIn = Math.floor(changeRequestExpiryMs / 1000);
    const newEmailHash = await hashPassword(normalizedNewEmail);

    await insertChangeRequest(c.env.DB, { requestId, userId: user.id, oldEmail: user.email, newEmail: normalizedNewEmail, newEmailHash, expiresAt, now: Date.now() });

    return c.json(success({
      requestId,
      oldEmail: emailVerificationUtils.maskEmail(user.email),
      newEmail: emailVerificationUtils.maskEmail(normalizedNewEmail),
      expiresIn
    }, '邮箱更改请求已创建，请验证新邮箱'));
  } catch (err) {
    console.error('Request email change error:', err);
    return c.json(error('SERVER_ERROR', '请求失败'), 500);
  }
});

authRoutes.post('/send-email-change-code', validateBody(schemas.auth.sendEmailChangeCode), async (c) => {
  const payload = c.get('user');

  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.sendEmailChangeCode>;
  const { requestId, emailType } = body;

  try {
    const changeRequest = await findPendingChangeRequestById(c.env.DB, { requestId, userId: payload.userId, now: Date.now() });

    if (!changeRequest) {
      return c.json(error('NOT_FOUND', '邮箱更改请求不存在或已过期'), 404);
    }

    const targetEmail = emailType === 'old' ? changeRequest.old_email : changeRequest.new_email;
    const verificationType = emailType === 'old' ? 'email_change_old' : 'email_change_new';

    const emailService = new EmailVerificationService(c.env);
    const ipAddress = getClientIP(c);

    try {
      await emailService.checkEmailRateLimit(targetEmail, ipAddress);
    } catch (rateLimitError) {
      return c.json(error('RATE_LIMIT', (rateLimitError as Error).message), 429);
    }

    const verification = await emailService.createEmailVerification(
      targetEmail, 
      verificationType, 
      payload.userId, 
      { requestId, emailType, ipAddress }
    );

    const username = await findUsernameById(c.env.DB, payload.userId);

    try {
      await emailService.sendVerificationEmail(
        targetEmail,
        verification.code,
        verificationType as 'email_change_old' | 'email_change_new',
        { 
          username: username || '用户',
          oldEmail: changeRequest.old_email,
          newEmail: changeRequest.new_email
        }
      );
    } catch (sendError) {
      console.error('发送邮箱更改验证码失败:', sendError);
      return c.json(error('SERVER_ERROR', '验证码发送失败，请稍后重试'), 500);
    }

    return c.json(success({ 
      emailType,
      maskedEmail: emailVerificationUtils.maskEmail(targetEmail),
      expiresIn: 900
    }, '验证码已发送'));
  } catch (err) {
    console.error('Send email change code error:', err);
    return c.json(error('SERVER_ERROR', '发送验证码失败'), 500);
  }
});

authRoutes.post('/verify-email-change-code', validateBody(schemas.auth.verifyEmailChangeCode), async (c) => {
  const payload = c.get('user');

  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.verifyEmailChangeCode>;
  const { requestId, emailType, code } = body;

  try {
    const changeRequest = await findPendingChangeRequestById(c.env.DB, { requestId, userId: payload.userId, now: Date.now() });

    if (!changeRequest) {
      return c.json(error('NOT_FOUND', '邮箱更改请求不存在或已过期'), 404);
    }

    const targetEmail = emailType === 'old' ? changeRequest.old_email : changeRequest.new_email;
    const verificationType = emailType === 'old' ? 'email_change_old' : 'email_change_new';

    const verification = await findVerificationByCode(c.env.DB, { email: targetEmail, code, type: verificationType, now: Date.now() });

    if (!verification) {
      return c.json(error('VALIDATION_ERROR', '验证码无效或已过期'), 400);
    }

    const updateField: 'old_email_verified' | 'new_email_verified' = emailType === 'old' ? 'old_email_verified' : 'new_email_verified';
    await markChangeRequestVerified(c.env.DB, requestId, updateField, Date.now());

    await deleteVerificationById(c.env.DB, verification.id);

    const updatedRequest = await findChangeRequestById(c.env.DB, requestId);

    if (updatedRequest && updatedRequest.new_email_verified === 1) {
      await updateUserEmail(c.env.DB, payload.userId, changeRequest.new_email, Date.now());

      await completeChangeRequest(c.env.DB, requestId, Date.now());

      await logUserAction(c.env, payload.userId, 'email_change', {
        oldEmail: changeRequest.old_email,
        newEmail: changeRequest.new_email
      }, c);

      return c.json(success({ 
        completed: true,
        newEmail: changeRequest.new_email.replace(/(.{2}).*(@.*)/, '$1***$2')
      }, '邮箱更改成功！'));
    }

    return c.json(success({ 
      completed: false,
      message: `${emailType === 'old' ? '原' : '新'}邮箱验证成功`
    }, '验证成功'));
  } catch (err) {
    console.error('Verify email change code error:', err);
    return c.json(error('SERVER_ERROR', '验证失败'), 500);
  }
});

authRoutes.post('/cancel-email-change-request', validateBody(schemas.auth.cancelEmailChangeRequest), async (c) => {
  const payload = c.get('user');

  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.cancelEmailChangeRequest>;
  const { requestId } = body;

  try {
    const emailService = new EmailVerificationService(c.env);
    const result = await emailService.cancelEmailChangeRequest(requestId, payload.userId);

    await logUserAction(c.env, payload.userId, 'email_change_cancelled', {
      requestId
    }, c);

    return c.json(success(result, result.message));
  } catch (err) {
    console.error('Cancel email change request error:', err);
    const errorMessage = err instanceof Error ? err.message : '取消失败';
    return c.json(error('SERVER_ERROR', errorMessage), 500);
  }
});

authRoutes.post('/send-account-delete-code', async (c) => {
  const payload = c.get('user');

  try {
    const user = await findUserById(c.env.DB, payload.userId);

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const emailService = new EmailVerificationService(c.env);
    const ipAddress = getClientIP(c);

    try {
      await emailService.checkEmailRateLimit(user.email, ipAddress);
    } catch (rateLimitError) {
      return c.json(error('RATE_LIMIT', (rateLimitError as Error).message), 429);
    }

    const verification = await emailService.createEmailVerification(
      user.email, 
      'account_delete', 
      user.id, 
      { ipAddress }
    );

    try {
      await emailService.sendVerificationEmail(
        user.email,
        verification.code,
        'account_delete',
        { username: user.username }
      );
    } catch (sendError) {
      console.error('发送账户删除验证码失败:', sendError);
      return c.json(error('SERVER_ERROR', '验证码发送失败，请稍后重试'), 500);
    }

    return c.json(success({ 
      maskedEmail: emailVerificationUtils.maskEmail(user.email),
      expiresIn: 900 
    }, '验证码已发送'));
  } catch (err) {
    console.error('Send account delete code error:', err);
    return c.json(error('SERVER_ERROR', '发送验证码失败'), 500);
  }
});

authRoutes.get('/verification-status', async (c) => {
  const email = c.req.query('email');
  const verificationType = c.req.query('type');

  if (!email || !verificationType) {
    return c.json(error('VALIDATION_ERROR', '缺少必要参数：email 和 type'), 400);
  }

  if (!validateEmail(email)) {
    return c.json(error('VALIDATION_ERROR', '邮箱格式不正确'), 400);
  }

  try {
    const verification = await findLatestVerificationByEmailType(c.env.DB, { email, type: verificationType, now: Date.now() });

    if (!verification) {
      return c.json(success({
        hasPendingVerification: false,
        canResend: true
      }));
    }

    const remainingTime = verification.expires_at - Date.now();
    const resendIntervalMs = R.VERIFICATION_CODE.RESEND_INTERVAL_MS;
    const canResend = remainingTime <= resendIntervalMs;

    return c.json(success({
      hasPendingVerification: true,
      canResend,
      remainingTime,
      expiresAt: verification.expires_at
    }));
  } catch (err) {
    console.error('Check verification status error:', err);
    return c.json(error('SERVER_ERROR', '检查验证状态失败'), 500);
  }
});

authRoutes.get('/user-verification-status', async (c) => {
  const payload = c.get('user');

  try {
    const verifications = await listPendingVerificationsByUser(c.env.DB, payload.userId, Date.now());

    const emailChangeRequest = await findActiveChangeRequestByUser(c.env.DB, { userId: payload.userId, now: Date.now() });

    return c.json(success({
      pendingVerifications: verifications,
      emailChangeRequest,
      hasAnyPendingVerifications: verifications.length > 0 || !!emailChangeRequest
    }));
  } catch (err) {
    console.error('Get user verification status error:', err);
    return c.json(error('SERVER_ERROR', '获取用户验证状态失败'), 500);
  }
});

authRoutes.post('/smart-send-code', validateBody(schemas.auth.sendVerificationCode), async (c) => {
  const body = c.get('validatedBody') as z.infer<typeof schemas.auth.sendVerificationCode>;
  const { email, verificationType, force = false } = body;

  const normalizedEmail = emailVerificationUtils.normalizeEmail(email);

  let userId: string | null = null;
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    if (payload) {
      userId = payload.userId;
    }
  }

  if (['password_reset', 'email_change_old', 'email_change_new', 'account_delete'].includes(verificationType) && !userId) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  try {
    const emailService = new EmailVerificationService(c.env);
    const ipAddress = getClientIP(c);

    if (!force) {
      const canResend = await emailService.canResendVerification(normalizedEmail, verificationType, userId);
      if (!canResend.canResend) {
        return c.json(success({
          canResend: false,
          reason: canResend.reason,
          waitTime: canResend.waitTime,
          remainingTime: canResend.remainingTime
        }, '存在有效的验证码'));
      }
    }

    try {
      await emailService.checkEmailRateLimit(normalizedEmail, ipAddress);
    } catch (rateLimitError) {
      return c.json(error('RATE_LIMIT', (rateLimitError as Error).message), 429);
    }

    const verification = await emailService.createEmailVerification(
      normalizedEmail, 
      verificationType, 
      userId, 
      { ipAddress }
    );

    const username = (userId ? await findUsernameById(c.env.DB, userId) : null) ?? '用户';

    try {
      await emailService.sendVerificationEmail(
        normalizedEmail,
        verification.code,
        verificationType as 'registration' | 'password_reset' | 'forgot_password' | 'email_change_old' | 'email_change_new' | 'account_delete',
        { username }
      );
    } catch (sendError) {
      console.error('发送验证码失败:', sendError);
      return c.json(error('SERVER_ERROR', '验证码发送失败，请稍后重试'), 500);
    }

    return c.json(success({
      maskedEmail: emailVerificationUtils.maskEmail(normalizedEmail),
      expiresIn: 900
    }, '验证码已发送'));
  } catch (err) {
    console.error('Smart send code error:', err);
    return c.json(error('SERVER_ERROR', '发送验证码失败'), 500);
  }
});
