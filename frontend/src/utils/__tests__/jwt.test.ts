import { describe, expect, it } from 'vitest';
import { decodeJwtPayload } from '../jwt';

/** 生成 base64url 段（去 padding、替换 -/_），模拟真实 JWT */
function toBase64Url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('decodeJwtPayload', () => {
  it('解析 base64url 且无补位的 payload', () => {
    const payload = { userId: 'u1', username: '测试用户', role: 'user' };
    const token = `header.${toBase64Url(payload)}.signature`;
    expect(decodeJwtPayload(token)).toMatchObject(payload);
  });

  it('正确处理包含 - 与 _ 的 base64url 字符', () => {
    // 该 payload 的 base64 输出包含 + 与 /，转换后应变为 - 与 _
    const payload = { userId: 'u?~', username: 'ÿÿ', role: 'user' };
    const token = `h.${toBase64Url(payload)}.s`;
    expect(token).toMatch(/[-_]/);
    expect(decodeJwtPayload(token)?.userId).toBe('u?~');
  });

  it('格式非法或缺少 userId 时返回 null', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('h.%%%.s')).toBeNull();
    expect(decodeJwtPayload(`h.${toBase64Url({ username: 'x' })}.s`)).toBeNull();
  });
});
