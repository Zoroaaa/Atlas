import { describe, it, expect } from 'vitest';
import { parseOAuthDeepLink } from '../oauthDeepLink';

describe('parseOAuthDeepLink', () => {
  it('忽略非 OAuth 深链', () => {
    expect(parseOAuthDeepLink('https://atlas.wort.uk/auth/callback?code=a')).toBeNull();
    expect(parseOAuthDeepLink('atlas://settings')).toBeNull();
  });

  it('解析一次性 code', () => {
    const url = 'atlas://auth/callback?code=abc123';
    expect(parseOAuthDeepLink(url)).toEqual({ code: 'abc123' });
  });

  it('透传后端错误码', () => {
    expect(parseOAuthDeepLink('atlas://auth/callback?error=github_cancelled')).toEqual({
      error: 'github_cancelled',
    });
  });

  it('缺少 code 时返回错误标记', () => {
    expect(parseOAuthDeepLink('atlas://auth/callback?token=legacy-token')).toEqual({
      error: 'invalid_params',
    });
  });
});
