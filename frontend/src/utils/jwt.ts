/**
 * JWT payload 解析（只解码，不验签）。
 *
 * 约束：base64url 的 `-`/`_` 与缺失补位必须先归一化；
 * `atob` 只接受标准 base64，直接解 base64url 会抛错。
 */

export interface JwtPayload {
  userId: string;
  username?: string;
  role?: string;
  exp?: number;
  [key: string]: unknown;
}

/** 解码 JWT 第二段 payload；格式非法时返回 null，由调用方决定兜底 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  const segment = token.split('.')[1];
  if (!segment) return null;

  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);
    // JWT payload 是 UTF-8：atob 返回 Latin-1 字节串，需再按 UTF-8 解码
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object') return null;
    const payload = parsed as Record<string, unknown>;
    if (typeof payload.userId !== 'string' || payload.userId.length === 0) return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}
