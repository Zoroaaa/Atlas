/**
 * 解析原生 App 的 OAuth 回跳链接（atlas://auth/callback?token=...&user=...）
 */
import type { User } from '@/types';

export const APP_OAUTH_CALLBACK = 'atlas://auth/callback';

export interface OAuthDeepLinkPayload {
  token?: string;
  user?: User;
  /** 后端回跳时携带的错误码，或本地解析失败标记 */
  error?: string;
}

export function parseOAuthDeepLink(url: string): OAuthDeepLinkPayload | null {
  if (!url.startsWith(APP_OAUTH_CALLBACK)) return null;

  const queryIndex = url.indexOf('?');
  const params = new URLSearchParams(queryIndex === -1 ? '' : url.slice(queryIndex + 1));

  const error = params.get('error');
  if (error) return { error };

  const token = params.get('token');
  const rawUser = params.get('user');
  if (!token || !rawUser) return { error: 'invalid_params' };

  try {
    return { token, user: JSON.parse(rawUser) as User };
  } catch {
    return { error: 'invalid_user' };
  }
}
