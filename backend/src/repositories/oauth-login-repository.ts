/**
 * OAuth 一次性登录票据仓储：只负责 oauth_login_codes 表的 SQL 读写。
 *
 * 约束：表中只存 code 的 SHA-256 摘要；票据 5 分钟过期且只能消费一次。
 */
import type { OAuthLoginCode } from '@/types';

/** 写入一次性票据（同一 code 重复写入会主键冲突，正常流程不会发生） */
export async function insertOAuthLoginCode(
  db: D1Database,
  params: {
    codeHash: string;
    userId: string;
    provider: string;
    expiresAt: number;
    now: number;
    ipAddress: string | null;
    userAgent: string | null;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO oauth_login_codes
         (code_hash, user_id, provider, expires_at, created_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.codeHash,
      params.userId,
      params.provider,
      params.expiresAt,
      params.now,
      params.ipAddress,
      params.userAgent
    )
    .run();
}

/** 按 code 摘要查询未过期票据 */
export async function findActiveOAuthLoginCode(
  db: D1Database,
  codeHash: string,
  now: number
): Promise<OAuthLoginCode | null> {
  return db
    .prepare(
      `SELECT * FROM oauth_login_codes
       WHERE code_hash = ? AND expires_at > ?`
    )
    .bind(codeHash, now)
    .first<OAuthLoginCode>();
}

/**
 * 消费票据：删除成功（changes=1）才代表本次请求抢到了唯一一次兑换机会。
 * 并发兑换时只有一个请求能拿到 changes=1。
 */
export async function consumeOAuthLoginCode(db: D1Database, codeHash: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM oauth_login_codes WHERE code_hash = ?')
    .bind(codeHash)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

/** 清理过期票据；由小时级 cron 调用，避免异常中断的流程留下垃圾行 */
export async function deleteExpiredOAuthLoginCodes(db: D1Database, now: number): Promise<void> {
  await db.prepare('DELETE FROM oauth_login_codes WHERE expires_at < ?').bind(now).run();
}
