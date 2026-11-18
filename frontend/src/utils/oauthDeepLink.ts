/**
 * 解析原生 App 的 OAuth 回跳链接（atlas://auth/callback?code=...）。
 *
 * 回调只携带一次性 code；token 由 NativeShell 调 /auth/oauth/exchange 兑换。
 */

export const APP_OAUTH_CALLBACK = 'atlas://auth/callback';

export interface OAuthDeepLinkPayload {
  /** 一次性登录票据；5 分钟内有效且只能兑换一次 */
  code?: string;
  /** 后端回跳时携带的错误码，或本地解析失败标记 */
  error?: string;
}

export function parseOAuthDeepLink(url: string): OAuthDeepLinkPayload | null {
  if (!url.startsWith(APP_OAUTH_CALLBACK)) return null;

  const queryIndex = url.indexOf('?');
  const params = new URLSearchParams(queryIndex === -1 ? '' : url.slice(queryIndex + 1));

  const error = params.get('error');
  if (error) return { error };

  const code = params.get('code');
  if (!code) return { error: 'invalid_params' };

  return { code };
}
