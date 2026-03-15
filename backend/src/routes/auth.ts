import { Hono } from 'hono';
import { Env, User, EmailVerification, EmailChangeRequest } from '@/types';
import { success, error, generateId, hashPassword, verifyPassword, generateToken, verifyToken, validateEmail, validateUsername, validatePassword, logUserAction, getClientIP, checkLockout, clearLockout, recordSecurityEvent } from '@/utils';
import { recordFailedAttempt, recordPasswordResetLog, updatePasswordResetLog } from '@/utils/security';
import { EmailVerificationService, emailVerificationUtils, ConfigService } from '@/services';
import { CONFIG, VALIDATION_RULES, DB_CONFIG_KEYS } from '@/constants';

const R = VALIDATION_RULES;

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  const { identifier, password } = body;

  if (!identifier || !password) {
    return c.json(error('VALIDATION_ERROR', '请输入用户名/邮箱和密码'), 400);
  }

  const clientIP = getClientIP(c);
  const userAgent = c.req.header('User-Agent') || '';

  try {
    const lockoutCheck = await checkLockout(c.env.DB, 'login', identifier);
    if (lockoutCheck.isLocked) {
      const remainingTime = lockoutCheck.lockedUntil ? Math.ceil((lockoutCheck.lockedUntil - Date.now()) / 60000) : 0;
      return c.json(error('LOCKED', `账户已锁定，请${remainingTime}分钟后再试`), 423);
    }

    let queryField = 'username';
    const queryValue = identifier;
    
    if (identifier.includes('@')) {
      queryField = 'email';
    }
    
    const user = await c.env.DB.prepare(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name, r.permissions as role_permissions 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.${queryField} = ?`
    ).bind(queryValue).first<User & { role_name?: string; role_display_name?: string; role_permissions?: string }>();

    if (!user) {
      const lockoutResult = await recordFailedAttempt(c.env, 'login', identifier, undefined, undefined, clientIP, userAgent);
      return c.json(error('AUTH_ERROR', `用户名/邮箱或密码错误${lockoutResult.remainingAttempts ? `，剩余${lockoutResult.remainingAttempts}次尝试机会` : ''}`), 401);
    }

    if (!user.is_active) {
      await logUserAction(c.env, user.id, 'login_failed', { reason: '账号已被禁用', ip: clientIP }, c);
      await recordSecurityEvent(c.env.DB, {
        userId: user.id,
        eventType: 'login',
        eventStatus: 'failed',
        eventData: { reason: 'account_disabled' },
        ipAddress: clientIP,
        userAgent,
      });
      return c.json(error('AUTH_ERROR', '账号已被禁用'), 403);
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      await logUserAction(c.env, user.id, 'login_failed', { reason: '密码错误', ip: clientIP }, c);
      
      const lockoutResult = await recordFailedAttempt(c.env, 'login', identifier, undefined, undefined, clientIP, userAgent);
      
      await recordSecurityEvent(c.env.DB, {
        userId: user.id,
        eventType: 'login',
        eventStatus: 'failed',
        eventData: { reason: 'wrong_password', remainingAttempts: lockoutResult.remainingAttempts },
        ipAddress: clientIP,
        userAgent,
      });

      if (lockoutResult.isLocked) {
        return c.json(error('LOCKED', '登录失败次数过多，账户已锁定1小时'), 423);
      }
      
      return c.json(error('AUTH_ERROR', `用户名/邮箱或密码错误${lockoutResult.remainingAttempts ? `，剩余${lockoutResult.remainingAttempts}次尝试机会` : ''}`), 401);
    }

    await clearLockout(c.env.DB, 'login', identifier);

    const now = Date.now();
    await c.env.DB.prepare(
      'UPDATE users SET last_login = ?, login_count = login_count + 1, updated_at = ? WHERE id = ?'
    ).bind(now, now, user.id).run();

    const userRole = user.role_name || 'user';
    const expiryDays = parseInt(c.env.JWT_EXPIRY_DAYS || '30', 10);
    const token = await generateToken(user.id, user.username, c.env.JWT_SECRET, expiryDays, userRole);

    const tokenHash = await hashPassword(token);
    const sessionId = generateId();
    const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;
    
    await c.env.DB.prepare(`
      INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_activity, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      user.id,
      tokenHash,
      expiresAt,
      now,
      now,
      clientIP,
      userAgent
    ).run();

    await logUserAction(c.env, user.id, 'login', { method: 'password', ip: clientIP }, c);
    
    await recordSecurityEvent(c.env.DB, {
      userId: user.id,
      eventType: 'login',
      eventStatus: 'success',
      ipAddress: clientIP,
      userAgent,
    });

    return c.json(success({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        permissions: JSON.parse(user.permissions || '[]'),
        settings: JSON.parse(user.settings || '{}'),
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

authRoutes.post('/register', async (c) => {
  const configService = new ConfigService(c.env);
  const enableRegistration = await configService.getBoolean(DB_CONFIG_KEYS.ENABLE_REGISTRATION, true);
  
  if (!enableRegistration) {
    return c.json(error('FORBIDDEN', '注册功能已关闭'), 403);
  }

  const body = await c.req.json();
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

  try {
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).bind(username, email).first();

    if (existingUser) {
      return c.json(error('VALIDATION_ERROR', '用户名或邮箱已被注册'), 400);
    }

    let emailVerified = 0;
    if (verificationCode) {
      const verification = await c.env.DB.prepare(`
        SELECT * FROM email_verifications 
        WHERE email = ? AND verification_code = ? AND verification_type = 'registration' AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1
      `).bind(email, verificationCode, Date.now()).first<EmailVerification>();

      if (!verification) {
        return c.json(error('VALIDATION_ERROR', '验证码无效或已过期'), 400);
      }

      emailVerified = 1;
      
      await c.env.DB.prepare(
        'DELETE FROM email_verifications WHERE id = ?'
      ).bind(verification.id).run();
    }

    const userId = generateId();
    const now = Date.now();
    const passwordHash = await hashPassword(password);

    await c.env.DB.prepare(`
      INSERT INTO users (id, username, email, password_hash, created_at, updated_at, permissions, settings, is_active, login_count, email_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      username,
      email,
      passwordHash,
      now,
      now,
      JSON.stringify([...CONFIG.Roles.DEFAULT_PERMISSIONS]),
      JSON.stringify({}),
      1,
      0,
      emailVerified
    ).run();

    const expiryDays = parseInt(c.env.JWT_EXPIRY_DAYS || '30', 10);
    const token = await generateToken(userId, username, c.env.JWT_SECRET, expiryDays);

    const tokenHash = await hashPassword(token);
    const sessionId = generateId();
    const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;
    
    await c.env.DB.prepare(`
      INSERT INTO user_sessions (id, user_id, token_hash, expires_at, created_at, last_activity, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      userId,
      tokenHash,
      expiresAt,
      now,
      now,
      getClientIP(c),
      c.req.header('User-Agent') || ''
    ).run();

    await logUserAction(c.env, userId, 'register', { username, email }, c);

    return c.json(success({
      user: {
        id: userId,
        username,
        email,
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

authRoutes.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  try {
    const tokenHash = await hashPassword(token);
    await c.env.DB.prepare(
      'DELETE FROM user_sessions WHERE user_id = ? AND token_hash = ?'
    ).bind(payload.userId, tokenHash).run();

    await logUserAction(c.env, payload.userId, 'logout', {}, c);

    return c.json(success(null, '登出成功'));
  } catch (err) {
    console.error('Logout error:', err);
    return c.json(error('SERVER_ERROR', '登出失败'), 500);
  }
});

authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  try {
    const user = await c.env.DB.prepare(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ?`
    ).bind(payload.userId).first<User & { role_name?: string; role_display_name?: string }>();

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const tokenHash = await hashPassword(token);
    const session = await c.env.DB.prepare(
      'SELECT * FROM user_sessions WHERE user_id = ? AND token_hash = ? AND expires_at > ?'
    ).bind(user.id, tokenHash, Date.now()).first();

    if (!session) {
      return c.json(error('AUTH_ERROR', '会话已过期'), 401);
    }

    await c.env.DB.prepare(
      'UPDATE user_sessions SET last_activity = ? WHERE id = ?'
    ).bind(Date.now(), session.id).run();

    return c.json(success({
      id: user.id,
      username: user.username,
      email: user.email,
      permissions: JSON.parse(user.permissions || '[]'),
      settings: JSON.parse(user.settings || '{}'),
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

authRoutes.post('/verify-token', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  try {
    const tokenHash = await hashPassword(token);
    const session = await c.env.DB.prepare(
      'SELECT * FROM user_sessions WHERE user_id = ? AND token_hash = ? AND expires_at > ?'
    ).bind(payload.userId, tokenHash, Date.now()).first();

    if (!session) {
      return c.json(error('AUTH_ERROR', '会话已过期'), 401);
    }

    const user = await c.env.DB.prepare(
      'SELECT id, username, email FROM users WHERE id = ?'
    ).bind(payload.userId).first<User>();

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

authRoutes.post('/forgot-password', async (c) => {
  const body = await c.req.json();
  const { email } = body;

  if (!email) {
    return c.json(error('VALIDATION_ERROR', '请输入邮箱地址'), 400);
  }

  if (!emailVerificationUtils.isValidEmail(email)) {
    return c.json(error('VALIDATION_ERROR', '请输入有效的邮箱地址'), 400);
  }

  const configService = new ConfigService(c.env);
  
  const verificationCodeExpiry = await configService.getInt(DB_CONFIG_KEYS.RESET_PASSWORD_CODE_EXPIRY, 30 * 60 * 1000);
  
  const normalizedEmail = emailVerificationUtils.normalizeEmail(email);
  const maskedEmail = emailVerificationUtils.maskEmail(normalizedEmail);
  const expiresIn = Math.floor(verificationCodeExpiry / 1000);

  try {
    const user = await c.env.DB.prepare(
      'SELECT id, username, email FROM users WHERE email = ? AND is_active = 1'
    ).bind(normalizedEmail).first<User>();

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

authRoutes.post('/reset-password', async (c) => {
  const body = await c.req.json();
  const { email, code, verificationCode, newPassword } = body;
  
  const actualCode = code || verificationCode;

  if (!email || !actualCode || !newPassword) {
    return c.json(error('VALIDATION_ERROR', '请填写所有必填项'), 400);
  }

  if (!emailVerificationUtils.isValidEmail(email)) {
    return c.json(error('VALIDATION_ERROR', '请输入有效的邮箱地址'), 400);
  }

  if (!validatePassword(newPassword)) {
    return c.json(error('VALIDATION_ERROR', '密码至少需要6个字符'), 400);
  }

  const normalizedEmail = emailVerificationUtils.normalizeEmail(email);
  const ipAddress = getClientIP(c);
  const userAgent = c.req.header('User-Agent') || '';

  try {
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ? AND is_active = 1'
    ).bind(normalizedEmail).first<User>();

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

    await c.env.DB.prepare(`
      UPDATE users SET password_hash = ?, last_password_change = ?, updated_at = ? WHERE id = ?
    `).bind(passwordHash, now, now, user.id).run();

    await c.env.DB.prepare(
      'DELETE FROM user_sessions WHERE user_id = ?'
    ).bind(user.id).run();

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

authRoutes.put('/change-password', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  const body = await c.req.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return c.json(error('VALIDATION_ERROR', '请填写所有必填项'), 400);
  }

  if (!validatePassword(newPassword)) {
    return c.json(error('VALIDATION_ERROR', `新密码至少需要${R.PASSWORD.MIN_LENGTH}个字符`), 400);
  }

  try {
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(payload.userId).first<User>();

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return c.json(error('AUTH_ERROR', '当前密码错误'), 400);
    }

    const passwordHash = await hashPassword(newPassword);
    const now = Date.now();

    await c.env.DB.prepare(`
      UPDATE users SET password_hash = ?, last_password_change = ?, updated_at = ? WHERE id = ?
    `).bind(passwordHash, now, now, user.id).run();

    await logUserAction(c.env, user.id, 'change_password', {}, c);

    return c.json(success(null, '密码修改成功'));
  } catch (err) {
    console.error('Change password error:', err);
    return c.json(error('SERVER_ERROR', '修改失败，请稍后重试'), 500);
  }
});

authRoutes.delete('/account', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  const body = await c.req.json();
  const { password, verificationCode, confirmText } = body;

  if (!verificationCode) {
    return c.json(error('VALIDATION_ERROR', '请输入验证码'), 400);
  }

  if (confirmText !== '删除我的账户') {
    return c.json(error('VALIDATION_ERROR', '请输入正确的确认文字'), 400);
  }

  try {
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(payload.userId).first<User>();

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const verification = await c.env.DB.prepare(`
      SELECT * FROM email_verifications 
      WHERE user_id = ? AND email = ? AND verification_code = ? AND verification_type = 'account_delete' AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(user.id, user.email, verificationCode, Date.now()).first<EmailVerification>();

    if (!verification) {
      return c.json(error('VALIDATION_ERROR', '验证码无效或已过期'), 400);
    }

    await c.env.DB.prepare('DELETE FROM email_verifications WHERE id = ?').bind(verification.id).run();

    if (password) {
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return c.json(error('AUTH_ERROR', '密码错误'), 400);
      }
    }

    await c.env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(user.id).run();
    await c.env.DB.prepare('DELETE FROM user_favorites WHERE user_id = ?').bind(user.id).run();
    await c.env.DB.prepare('DELETE FROM user_search_history WHERE user_id = ?').bind(user.id).run();
    await c.env.DB.prepare('DELETE FROM user_search_source_configs WHERE user_id = ?').bind(user.id).run();
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();

    return c.json(success(null, '账户已删除'));
  } catch (err) {
    console.error('Delete account error:', err);
    return c.json(error('SERVER_ERROR', '删除失败，请稍后重试'), 500);
  }
});

authRoutes.post('/refresh', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const oldToken = authHeader.slice(7);
  const payload = await verifyToken(oldToken, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  try {
    const oldTokenHash = await hashPassword(oldToken);
    const session = await c.env.DB.prepare(
      'SELECT * FROM user_sessions WHERE user_id = ? AND token_hash = ? AND expires_at > ?'
    ).bind(payload.userId, oldTokenHash, Date.now()).first();

    if (!session) {
      return c.json(error('AUTH_ERROR', '会话已过期'), 401);
    }

    const expiryDays = parseInt(c.env.JWT_EXPIRY_DAYS || '30', 10);
    const newToken = await generateToken(payload.userId, payload.username, c.env.JWT_SECRET, expiryDays);
    const newTokenHash = await hashPassword(newToken);
    const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000;

    await c.env.DB.prepare(`
      UPDATE user_sessions 
      SET token_hash = ?, expires_at = ?, last_activity = ?
      WHERE id = ?
    `).bind(newTokenHash, expiresAt, Date.now(), session.id).run();

    await logUserAction(c.env, payload.userId, 'token_refresh', {}, c);

    return c.json(success({ token: newToken }, 'Token刷新成功'));
  } catch (err) {
    console.error('Token refresh error:', err);
    return c.json(error('SERVER_ERROR', 'Token刷新失败'), 500);
  }
});

authRoutes.post('/send-registration-code', async (c) => {
  const body = await c.req.json();
  const { email } = body;

  if (!email || !emailVerificationUtils.isValidEmail(email)) {
    return c.json(error('VALIDATION_ERROR', '请输入有效的邮箱地址'), 400);
  }

  const normalizedEmail = emailVerificationUtils.normalizeEmail(email);

  if (emailVerificationUtils.isTempEmail(normalizedEmail)) {
    return c.json(error('VALIDATION_ERROR', '不支持临时邮箱，请使用常用邮箱'), 400);
  }

  try {
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(normalizedEmail).first();

    if (existingUser) {
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

authRoutes.post('/request-email-change', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  const body = await c.req.json();
  const { newEmail, currentPassword } = body;

  if (!newEmail || !validateEmail(newEmail)) {
    return c.json(error('VALIDATION_ERROR', '请输入有效的新邮箱地址'), 400);
  }

  if (!currentPassword) {
    return c.json(error('VALIDATION_ERROR', '请输入当前密码'), 400);
  }

  try {
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(payload.userId).first<User>();

    if (!user) {
      return c.json(error('AUTH_ERROR', '用户不存在'), 404);
    }

    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return c.json(error('AUTH_ERROR', '当前密码错误'), 400);
    }

    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      return c.json(error('VALIDATION_ERROR', '新邮箱不能与当前邮箱相同'), 400);
    }

    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    ).bind(newEmail, user.id).first();

    if (existingUser) {
      return c.json(error('VALIDATION_ERROR', '该邮箱已被其他用户使用'), 400);
    }

    const emailService = new EmailVerificationService(c.env);
    const changePendingExpiryMinutes = R.EMAIL_CHANGE.PENDING_EXPIRY_MINUTES;
    await emailService.cancelExpiredPendingRequests(user.id, changePendingExpiryMinutes);

    const activeRequest = await c.env.DB.prepare(`
      SELECT id, created_at FROM email_change_requests 
      WHERE user_id = ? AND status = 'pending' AND expires_at > ?
    `).bind(user.id, Date.now()).first();

    if (activeRequest) {
      const createdAt = (activeRequest as { created_at: number }).created_at;
      const elapsedMinutes = Math.floor((Date.now() - createdAt) / 60000);
      const remainingMinutes = changePendingExpiryMinutes - elapsedMinutes;
      return c.json(error('VALIDATION_ERROR', `您已有进行中的邮箱更改请求，请等待${remainingMinutes > 0 ? remainingMinutes : 1}分钟后再试或手动取消`), 400);
    }

    const requestId = generateId();
    const changeRequestExpiryMs = R.EMAIL_CHANGE.REQUEST_EXPIRY_MS;
    const expiresAt = Date.now() + changeRequestExpiryMs;
    const expiresIn = Math.floor(changeRequestExpiryMs / 1000);
    const newEmailHash = await hashPassword(newEmail);

    await c.env.DB.prepare(`
      INSERT INTO email_change_requests (id, user_id, old_email, new_email, new_email_hash, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(requestId, user.id, user.email, newEmail, newEmailHash, 'pending', expiresAt, Date.now()).run();

    return c.json(success({
      requestId,
      oldEmail: emailVerificationUtils.maskEmail(user.email),
      newEmail: emailVerificationUtils.maskEmail(newEmail),
      expiresIn
    }, '邮箱更改请求已创建，请验证新邮箱'));
  } catch (err) {
    console.error('Request email change error:', err);
    return c.json(error('SERVER_ERROR', '请求失败'), 500);
  }
});

authRoutes.post('/send-email-change-code', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  const body = await c.req.json();
  const { requestId, emailType } = body;

  if (!requestId || !emailType || !['old', 'new'].includes(emailType)) {
    return c.json(error('VALIDATION_ERROR', '参数错误'), 400);
  }

  try {
    const changeRequest = await c.env.DB.prepare(`
      SELECT * FROM email_change_requests 
      WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?
    `).bind(requestId, payload.userId, Date.now()).first<EmailChangeRequest>();

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

    const user = await c.env.DB.prepare(
      'SELECT username FROM users WHERE id = ?'
    ).bind(payload.userId).first<User>();

    try {
      await emailService.sendVerificationEmail(
        targetEmail,
        verification.code,
        verificationType as 'email_change_old' | 'email_change_new',
        { 
          username: user?.username || '用户',
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

authRoutes.post('/verify-email-change-code', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  const body = await c.req.json();
  const { requestId, emailType, code } = body;

  if (!requestId || !emailType || !code) {
    return c.json(error('VALIDATION_ERROR', '参数不完整'), 400);
  }

  try {
    const changeRequest = await c.env.DB.prepare(`
      SELECT * FROM email_change_requests 
      WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?
    `).bind(requestId, payload.userId, Date.now()).first<EmailChangeRequest>();

    if (!changeRequest) {
      return c.json(error('NOT_FOUND', '邮箱更改请求不存在或已过期'), 404);
    }

    const targetEmail = emailType === 'old' ? changeRequest.old_email : changeRequest.new_email;
    const verificationType = emailType === 'old' ? 'email_change_old' : 'email_change_new';

    const verification = await c.env.DB.prepare(`
      SELECT * FROM email_verifications 
      WHERE email = ? AND verification_code = ? AND verification_type = ? AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(targetEmail, code, verificationType, Date.now()).first();

    if (!verification) {
      return c.json(error('VALIDATION_ERROR', '验证码无效或已过期'), 400);
    }

    const updateField = emailType === 'old' ? 'old_email_verified' : 'new_email_verified';
    await c.env.DB.prepare(`
      UPDATE email_change_requests SET ${updateField} = 1, updated_at = ? WHERE id = ?
    `).bind(Date.now(), requestId).run();

    await c.env.DB.prepare('DELETE FROM email_verifications WHERE id = ?').bind(verification.id).run();

    const updatedRequest = await c.env.DB.prepare(
      'SELECT * FROM email_change_requests WHERE id = ?'
    ).bind(requestId).first();

    if (updatedRequest && updatedRequest.new_email_verified === 1) {
      await c.env.DB.prepare(`
        UPDATE users SET email = ?, updated_at = ? WHERE id = ?
      `).bind(changeRequest.new_email, Date.now(), payload.userId).run();

      await c.env.DB.prepare(`
        UPDATE email_change_requests SET status = 'completed', updated_at = ? WHERE id = ?
      `).bind(Date.now(), requestId).run();

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

authRoutes.post('/cancel-email-change-request', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  const body = await c.req.json();
  const { requestId } = body;

  if (!requestId) {
    return c.json(error('VALIDATION_ERROR', '缺少请求ID'), 400);
  }

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
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  try {
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(payload.userId).first<User>();

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
    const verification = await c.env.DB.prepare(`
      SELECT * FROM email_verifications 
      WHERE email = ? AND verification_type = ? AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(email, verificationType, Date.now()).first<EmailVerification>();

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
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(error('AUTH_ERROR', '未授权'), 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json(error('AUTH_ERROR', '无效的Token'), 401);
  }

  try {
    const verifications = await c.env.DB.prepare(`
      SELECT * FROM email_verifications 
      WHERE user_id = ? AND expires_at > ?
      ORDER BY created_at DESC
    `).bind(payload.userId, Date.now()).all();

    const emailChangeRequest = await c.env.DB.prepare(`
      SELECT * FROM email_change_requests 
      WHERE user_id = ? AND status = 'pending' AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(payload.userId, Date.now()).first();

    return c.json(success({
      pendingVerifications: verifications.results || [],
      emailChangeRequest,
      hasAnyPendingVerifications: (verifications.results?.length > 0) || !!emailChangeRequest
    }));
  } catch (err) {
    console.error('Get user verification status error:', err);
    return c.json(error('SERVER_ERROR', '获取用户验证状态失败'), 500);
  }
});

authRoutes.post('/smart-send-code', async (c) => {
  const body = await c.req.json();
  const { email, verificationType, force = false } = body;

  if (!email || !verificationType) {
    return c.json(error('VALIDATION_ERROR', '缺少必要参数'), 400);
  }

  if (!emailVerificationUtils.isValidEmail(email)) {
    return c.json(error('VALIDATION_ERROR', '邮箱格式不正确'), 400);
  }

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

    let username = '用户';
    if (userId) {
      const user = await c.env.DB.prepare(
        'SELECT username FROM users WHERE id = ?'
      ).bind(userId).first<User>();
      if (user) {
        username = user.username;
      }
    }

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
