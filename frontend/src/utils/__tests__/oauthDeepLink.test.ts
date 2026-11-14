import { describe, it, expect } from 'vitest';
import { parseOAuthDeepLink } from '../oauthDeepLink';

describe('parseOAuthDeepLink', () => {
  it('忽略非 OAuth 深链', () => {
    expect(parseOAuthDeepLink('https://atlas.wort.uk/auth/callback?token=a')).toBeNull();
    expect(parseOAuthDeepLink('atlas://settings')).toBeNull();
  });

  it('解析 token 与用户数据', () => {
    const user = { id: 'u1', username: 'tester', role: 'user' };
    const url = `atlas://auth/callback?token=jwt-token&user=${encodeURIComponent(JSON.stringify(user))}`;

    expect(parseOAuthDeepLink(url)).toEqual({ token: 'jwt-token', user });
  });

  it('透传后端错误码', () => {
    expect(parseOAuthDeepLink('atlas://auth/callback?error=github_cancelled')).toEqual({
      error: 'github_cancelled',
    });
  });

  it('缺少参数或用户数据损坏时返回错误标记', () => {
    expect(parseOAuthDeepLink('atlas://auth/callback?token=only-token')).toEqual({
      error: 'invalid_params',
    });
    expect(parseOAuthDeepLink('atlas://auth/callback?token=t&user=%7Bbad')).toEqual({
      error: 'invalid_user',
    });
  });
});
