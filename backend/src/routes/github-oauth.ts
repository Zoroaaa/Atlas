/**
 * GitHub OAuth 路由
 * GET  /auth/github          — 发起授权（重定向到 GitHub）
 * GET  /auth/github/callback — 处理回调（换 token，自动注册/登录）
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

export const githubOAuthRoutes = new Hono<{ Bindings: Env }>();

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/** 生成随机 state（防 CSRF） */
const generateState = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** 用 GitHub access_token 拉取用户信息 */
async function fetchGitHubUser(accessToken: string): Promise<{
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CodeSeek-OAuth',
    },
  });
  if (!res.ok) throw new Error(`GitHub /user 接口错误: ${res.status}`);
  return res.json();
}

/** 拉取用户 primary & verified 邮箱（当 user.email 为 null 时） */
async function fetchGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CodeSeek-OAuth',
    },
  });
  if (!res.ok) return null;
  const emails: Array<{ email: string; primary: boolean; verified: boolean }> = await res.json();
  const primary = emails.find((e) => e.primary && e.verified);
  return primary?.email ?? null;
}

/** 构造不重复的用户名（github_login，冲突则追加随机后缀） */
async function resolveUsername(db: D1Database, baseLogin: string): Promise<string> {
  // 清理：只保留字母、数字、下划线，长度 3-20
  let candidate = baseLogin.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 16);
  if (candidate.length < 3) candidate = `gh_${candidate}`;

  const existing = await db
    .prepare('SELECT id FROM users WHERE username = ?')
    .bind(candidate)
    .first();
  if (!existing) return candidate;

  // 追加随机4位数字
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${candidate}_${suffix}`.slice(0, 20);
}

// ──────────────────────────────────────────────
// Route 1: 发起授权
// ──────────────────────────────────────────────
githubOAuthRoutes.get('/github', async (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return c.json(error('CONFIG_ERROR', 'GitHub OAuth 未配置'), 500);
  }

  const state = generateState();
  const backendUrl = (c.env.BACKEND_URL || 'https://backend.codeseek.pp.ua').replace(/\/$/, '');
  const redirectUri = `${backendUrl}/api/auth/github/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
    allow_signup: 'true',
  });

  const githubAuthUrl = `https://github.com/login/oauth/authorize?${params}`;

  // 将 state 写入 302 响应的 cookie（httpOnly、短期）
  c.header(
    'Set-Cookie',
    `gh_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );
  return c.redirect(githubAuthUrl, 302);
});

// ──────────────────────────────────────────────
// Route 2: OAuth 回调
// ──────────────────────────────────────────────
githubOAuthRoutes.get('/github/callback', async (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID;
  const clientSecret = c.env.GITHUB_CLIENT_SECRET;
  const frontendBase = (c.env.FRONTEND_URL || 'https://codeseek.pp.ua').replace(/\/$/, '');
  const backendUrl = (c.env.BACKEND_URL || 'https://backend.codeseek.pp.ua').replace(/\/$/, '');
  const redirectUri = `${backendUrl}/api/auth/github/callback`;

  if (!clientId || !clientSecret) {
    return c.redirect(`${frontendBase}/login?error=github_not_configured`, 302);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');
  const errorParam = c.req.query('error');

  // GitHub 取消授权
  if (errorParam) {
    return c.redirect(`${frontendBase}/login?error=github_cancelled`, 302);
  }

  if (!code || !state) {
    return c.redirect(`${frontendBase}/login?error=github_invalid_params`, 302);
  }

  // CSRF: 校验 state cookie
  const cookieHeader = c.req.header('Cookie') || '';
  const storedState = cookieHeader
    .split(';')
    .map((s) => s.trim().split('='))
    .find(([k]) => k === 'gh_oauth_state')?.[1];

  if (!storedState || storedState !== state) {
    return c.redirect(`${frontendBase}/login?error=github_state_mismatch`, 302);
  }

  try {
    // Step 1: code → access_token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'CodeSeek-OAuth',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return c.redirect(`${frontendBase}/login?error=github_token_failed`, 302);
    }

    const tokenData: { access_token?: string; error?: string } = await tokenRes.json();
    if (!tokenData.access_token) {
      return c.redirect(`${frontendBase}/login?error=github_token_failed`, 302);
    }

    const accessToken = tokenData.access_token;

    // Step 2: 拉取 GitHub 用户信息
    const ghUser = await fetchGitHubUser(accessToken);
    let email = ghUser.email;
    if (!email) {
      email = await fetchGitHubPrimaryEmail(accessToken);
    }

    const githubId = String(ghUser.id);
    const clientIP = getClientIP(c);
    const userAgent = c.req.header('User-Agent') || '';

    // Step 3: 查找或创建本地用户
    let user = await c.env.DB.prepare(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name, r.permissions as role_permissions
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.github_id = ?`
    )
      .bind(githubId)
      .first<User & { role_name?: string; role_display_name?: string }>();

    if (!user && email) {
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
        // 绑定 github_id
        await c.env.DB.prepare(
          'UPDATE users SET github_id = ?, github_username = ?, updated_at = ? WHERE id = ?'
        )
          .bind(githubId, ghUser.login, Date.now(), user.id)
          .run();
      }
    }

    const now = Date.now();

    if (!user) {
      // 自动注册新用户
      if (!email) {
        // GitHub 账号没有可见邮箱，生成占位邮箱
        email = `github_${githubId}@noreply.github.com`;
      }

      const username = await resolveUsername(c.env.DB, ghUser.login);
      const userId = generateId();
      // OAuth 用户不需要密码，存储随机不可逆哈希占位
      const randomPasswordHash = await hashPassword(generateId() + generateId());

      await c.env.DB.prepare(`
        INSERT INTO users
          (id, username, email, password_hash, github_id, github_username,
           created_at, updated_at, permissions, settings, is_active, login_count, email_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          userId,
          username,
          email,
          randomPasswordHash,
          githubId,
          ghUser.login,
          now,
          now,
          JSON.stringify([...CONFIG.Roles.DEFAULT_PERMISSIONS]),
          JSON.stringify({}),
          1,
          0,
          1 // GitHub 账号视为邮箱已验证
        )
        .run();

      await logUserAction(
        c.env,
        userId,
        'register',
        { method: 'github', github_login: ghUser.login },
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
      return c.redirect(`${frontendBase}/login?error=github_db_error`, 302);
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

    await logUserAction(c.env, user.id, 'login', { method: 'github', ip: clientIP }, c);
    await recordSecurityEvent(c.env.DB, {
      userId: user.id,
      eventType: 'login',
      eventStatus: 'success',
      ipAddress: clientIP,
      userAgent,
    });

    // 将 token 和用户数据通过 URL fragment 传给前端（前端 /auth/callback 页面读取）
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

    // 清除 state cookie
    c.header(
      'Set-Cookie',
      'gh_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
    );

    return c.redirect(
      `${frontendBase}/auth/callback?token=${encodeURIComponent(token)}&user=${userData}`,
      302
    );
  } catch (err) {
    console.error('GitHub OAuth callback error:', err);
    return c.redirect(`${frontendBase}/login?error=github_server_error`, 302);
  }
});
