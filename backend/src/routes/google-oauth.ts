/**
 * Google OAuth 路由
 * GET  /auth/google          — 发起授权（重定向到 Google Consent）
 * GET  /auth/google/callback — 处理回调（换 token，自动注册/登录）
 *
 * 流程参考 github-oauth.ts，使用 Google OAuth 2.0 + OIDC（含 openid email profile scope）
 */

import { Hono } from 'hono';
import { Env, User } from '@/types';
import {
  error,
  generateId,
  hashPassword,
  hashToken,
  generateToken,
  getClientIP,
  logUserAction,
  recordSecurityEvent,
} from '@/utils';
import { CONFIG } from '@/constants';

export const googleOAuthRoutes = new Hono<{ Bindings: Env }>();

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/** 生成随机 state（防 CSRF） */
const generateState = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** 生成 PKCE code_verifier（Google 强烈推荐 PKCE 防止授权码注入） */
const generateCodeVerifier = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/** 计算 PKCE code_challenge（S256） */
async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** 用 Google access_token 拉取用户信息 */
async function fetchGoogleUser(accessToken: string): Promise<{
  sub: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  given_name: string | null;
  picture: string | null;
}> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Google userinfo 接口错误: ${res.status}`);
  return res.json();
}

/** 构造不重复的用户名（基于 name/email 前缀，冲突则追加随机后缀） */
async function resolveUsername(db: D1Database, baseName: string): Promise<string> {
  // 清理：只保留字母、数字、下划线，长度 3-20
  let candidate = baseName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);
  if (candidate.length < 3) candidate = `g_${candidate}`;

  const existing = await db
    .prepare('SELECT id FROM users WHERE username = ?')
    .bind(candidate)
    .first();
  if (!existing) return candidate;

  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${candidate}_${suffix}`.slice(0, 20);
}

// ──────────────────────────────────────────────
// Route 1: 发起授权
// ──────────────────────────────────────────────
googleOAuthRoutes.get('/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json(error('CONFIG_ERROR', 'Google OAuth 未配置'), 500);
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);

  const backendUrl = (c.env.BACKEND_URL || 'https://atlasapi.wort.uk').replace(/\/$/, '');
  const redirectUri = `${backendUrl}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // prompt=select_account：让用户选择账号，避免静默登录
    prompt: 'select_account',
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // state + code_verifier 通过短期 httpOnly cookie 传递（回调时校验）
  // 注意：多个 cookie 必须用多个 Set-Cookie header，不能合并成逗号分隔的单个值
  c.header('Set-Cookie', `g_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`, { append: true });
  c.header('Set-Cookie', `g_oauth_verifier=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`, { append: true });

  return c.redirect(googleAuthUrl, 302);
});

// ──────────────────────────────────────────────
// Route 2: OAuth 回调
// ──────────────────────────────────────────────
googleOAuthRoutes.get('/google/callback', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const frontendBase = (c.env.FRONTEND_URL || CONFIG.DEFAULT_URLS.FRONTEND).replace(/\/$/, '');
  const backendUrl = (c.env.BACKEND_URL || CONFIG.DEFAULT_URLS.BACKEND).replace(/\/$/, '');
  const redirectUri = `${backendUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return c.redirect(`${frontendBase}/login?error=google_not_configured`, 302);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');
  const errorParam = c.req.query('error');

  // Google 取消授权
  if (errorParam) {
    return c.redirect(`${frontendBase}/login?error=google_cancelled`, 302);
  }

  if (!code || !state) {
    return c.redirect(`${frontendBase}/login?error=google_invalid_params`, 302);
  }

  // CSRF: 校验 state cookie + 取出 code_verifier
  const cookieHeader = c.req.header('Cookie') || '';
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(rest.join('='));
  }

  const storedState = cookies['g_oauth_state'];
  const codeVerifier = cookies['g_oauth_verifier'];

  if (!storedState || storedState !== state) {
    return c.redirect(`${frontendBase}/login?error=google_state_mismatch`, 302);
  }

  if (!codeVerifier) {
    return c.redirect(`${frontendBase}/login?error=google_state_mismatch`, 302);
  }

  try {
    // Step 1: code → access_token (含 PKCE)
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Google token exchange failed:', errBody);
      return c.redirect(`${frontendBase}/login?error=google_token_failed`, 302);
    }

    const tokenData: {
      access_token?: string;
      id_token?: string;
      error?: string;
    } = await tokenRes.json();

    if (!tokenData.access_token) {
      return c.redirect(`${frontendBase}/login?error=google_token_failed`, 302);
    }

    const accessToken = tokenData.access_token;

    // Step 2: 拉取 Google 用户信息
    const gUser = await fetchGoogleUser(accessToken);

    // Google 强制要求 email_verified（避免未验证邮箱被绑定）
    if (!gUser.email || !gUser.email_verified) {
      return c.redirect(`${frontendBase}/login?error=google_email_not_verified`, 302);
    }

    const googleId = String(gUser.sub);
    const email = gUser.email;
    const clientIP = getClientIP(c);
    const userAgent = c.req.header('User-Agent') || '';

    // Step 3: 查找或创建本地用户（先按 google_id，再按 email）
    let user = await c.env.DB.prepare(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name, r.permissions as role_permissions
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.google_id = ?`
    )
      .bind(googleId)
      .first<User & { role_name?: string; role_display_name?: string }>();

    if (!user) {
      // 尝试通过邮箱关联已有账号
      user = await c.env.DB.prepare(
        `SELECT u.*, r.name as role_name, r.display_name as role_display_name, r.permissions as role_permissions
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.email = ?`
      )
        .bind(email)
        .first<User & { role_name?: string; role_display_name?: string }>();

      if (user) {
        // 绑定 google_id
        await c.env.DB.prepare(
          'UPDATE users SET google_id = ?, google_username = ?, updated_at = ? WHERE id = ?'
        )
          .bind(googleId, gUser.name || gUser.given_name, Date.now(), user.id)
          .run();
      }
    }

    const now = Date.now();

    if (!user) {
      // 自动注册新用户
      const baseName = gUser.name || gUser.given_name || email.split('@')[0];
      const username = await resolveUsername(c.env.DB, baseName);
      const userId = generateId();
      // OAuth 用户不需要密码，存储随机不可逆哈希占位
      const randomPasswordHash = await hashPassword(generateId() + generateId());

      await c.env.DB.prepare(`
        INSERT INTO users
          (id, username, email, password_hash, google_id, google_username,
           created_at, updated_at, permissions, settings, is_active, login_count, email_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          userId,
          username,
          email,
          randomPasswordHash,
          googleId,
          gUser.name || gUser.given_name,
          now,
          now,
          JSON.stringify([...CONFIG.Roles.DEFAULT_PERMISSIONS]),
          JSON.stringify({}),
          1,
          0,
          1 // Google 已验证邮箱视为已验证
        )
        .run();

      await logUserAction(
        c.env,
        userId,
        'register',
        { method: 'google', google_name: gUser.name },
        c
      );

      // 重新查一次（带 role join）
      user = await c.env.DB.prepare(
        `SELECT u.*, r.name as role_name, r.display_name as role_display_name
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = ?`
      )
        .bind(userId)
        .first<User & { role_name?: string; role_display_name?: string }>();
    }

    if (!user) {
      return c.redirect(`${frontendBase}/login?error=google_db_error`, 302);
    }

    if (!user.is_active) {
      return c.redirect(`${frontendBase}/login?error=account_disabled`, 302);
    }

    // 更新登录记录
    await c.env.DB.prepare(
      'UPDATE users SET last_login = ?, login_count = login_count + 1, updated_at = ? WHERE id = ?'
    )
      .bind(now, now, user.id)
      .run();

    // 生成 JWT
    const userRole = user.role_name || 'user';
    const expiryDays = parseInt(c.env.JWT_EXPIRY_DAYS || '30', 10);
    const token = await generateToken(user.id, user.username, c.env.JWT_SECRET, expiryDays, userRole);

    // 创建 session
    const tokenHash = await hashToken(token);
    const sessionId = generateId();
    const expiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

    await c.env.DB.prepare(`
      INSERT INTO user_sessions
        (id, user_id, token_hash, expires_at, created_at, last_activity, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(sessionId, user.id, tokenHash, expiresAt, now, now, clientIP, userAgent)
      .run();

    await logUserAction(c.env, user.id, 'login', { method: 'google', ip: clientIP }, c);
    await recordSecurityEvent(c.env.DB, {
      userId: user.id,
      eventType: 'login',
      eventStatus: 'success',
      ipAddress: clientIP,
      userAgent,
    });

    // 将 token 和用户数据通过 URL query 传给前端 /auth/google/callback 页面
    const userData = encodeURIComponent(
      JSON.stringify({
        id: user.id,
        username: user.username,
        email: user.email,
        permissions: (() => { try { return JSON.parse(user.permissions || '[]'); } catch { return []; } })(),
        settings: (() => { try { return JSON.parse(user.settings || '{}'); } catch { return {}; } })(),
        isActive: true,
        emailVerified: true,
        createdAt: user.created_at,
        lastLogin: now,
        loginCount: user.login_count + 1,
        role: userRole,
        roleDisplayName: user.role_display_name || '普通用户',
      })
    );

    // 清除 state + verifier cookie
    c.header('Set-Cookie', 'g_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/', { append: true });
    c.header('Set-Cookie', 'g_oauth_verifier=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/', { append: true });

    return c.redirect(
      `${frontendBase}/auth/google/callback?token=${encodeURIComponent(token)}&user=${userData}`,
      302
    );
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return c.redirect(`${frontendBase}/login?error=google_server_error`, 302);
  }
});
