/**
 * 邮箱验证数据访问层
 *
 * 收口 email_verifications 与 email_change_requests 的查询与状态流转，
 * 使 auth 路由不再直接持有 SQL。
 */
import type { EmailVerification, EmailChangeRequest } from '@/types';

// ---------------------------------------------------------------------------
// email_verifications
// ---------------------------------------------------------------------------

/**
 * 按邮箱 + 验证码 + 类型查询有效验证码（取最新一条）
 * @param userId 传入时额外按归属用户过滤（如账户删除场景）
 */
export async function findVerificationByCode(
  db: D1Database,
  opts: { email: string; code: string; type: string; now: number; userId?: string | null }
): Promise<EmailVerification | null> {
  const userClause = opts.userId ? ' AND user_id = ?' : '';
  const params: (string | number)[] = [opts.email, opts.code, opts.type, opts.now];
  if (opts.userId) params.push(opts.userId);
  return db
    .prepare(
      `SELECT * FROM email_verifications
       WHERE email = ? AND verification_code = ? AND verification_type = ? AND expires_at > ?${userClause}
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(...params)
    .first<EmailVerification>();
}

/** 按邮箱 + 类型查询最新有效验证码（不校验具体码值） */
export async function findLatestVerificationByEmailType(
  db: D1Database,
  opts: { email: string; type: string; now: number }
): Promise<EmailVerification | null> {
  return db
    .prepare(
      `SELECT * FROM email_verifications
       WHERE email = ? AND verification_type = ? AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(opts.email, opts.type, opts.now)
    .first<EmailVerification>();
}

/** 查询用户全部未过期验证码 */
export async function listPendingVerificationsByUser(
  db: D1Database,
  userId: string,
  now: number
): Promise<EmailVerification[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM email_verifications
       WHERE user_id = ? AND expires_at > ?
       ORDER BY created_at DESC`
    )
    .bind(userId, now)
    .all<EmailVerification>();
  return rows.results || [];
}

/** 按 id 删除验证码 */
export async function deleteVerificationById(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM email_verifications WHERE id = ?').bind(id).run();
}

// ---------------------------------------------------------------------------
// email_change_requests
// ---------------------------------------------------------------------------

/** 按 id + 归属用户查询处于 pending 且未过期的邮箱更改请求 */
export async function findPendingChangeRequestById(
  db: D1Database,
  opts: { requestId: string; userId: string; now: number }
): Promise<EmailChangeRequest | null> {
  return db
    .prepare(
      `SELECT * FROM email_change_requests
       WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?`
    )
    .bind(opts.requestId, opts.userId, opts.now)
    .first<EmailChangeRequest>();
}

/** 查询用户当前进行中的邮箱更改请求 */
export async function findActiveChangeRequestByUser(
  db: D1Database,
  opts: { userId: string; now: number }
): Promise<EmailChangeRequest | null> {
  return db
    .prepare(
      `SELECT * FROM email_change_requests
       WHERE user_id = ? AND status = 'pending' AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(opts.userId, opts.now)
    .first<EmailChangeRequest>();
}

/** 新增邮箱更改请求 */
export async function insertChangeRequest(
  db: D1Database,
  params: {
    requestId: string;
    userId: string;
    oldEmail: string;
    newEmail: string;
    newEmailHash: string;
    expiresAt: number;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO email_change_requests (id, user_id, old_email, new_email, new_email_hash, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.requestId,
      params.userId,
      params.oldEmail,
      params.newEmail,
      params.newEmailHash,
      'pending',
      params.expiresAt,
      params.now
    )
    .run();
}

/** 标记邮箱更改请求的某一侧（原 / 新邮箱）已验证 */
export async function markChangeRequestVerified(
  db: D1Database,
  requestId: string,
  field: 'old_email_verified' | 'new_email_verified',
  now: number
): Promise<void> {
  await db
    .prepare(`UPDATE email_change_requests SET ${field} = 1, updated_at = ? WHERE id = ?`)
    .bind(now, requestId)
    .run();
}

/** 按 id 查询邮箱更改请求 */
export async function findChangeRequestById(
  db: D1Database,
  requestId: string
): Promise<EmailChangeRequest | null> {
  return db
    .prepare('SELECT * FROM email_change_requests WHERE id = ?')
    .bind(requestId)
    .first<EmailChangeRequest>();
}

/** 将邮箱更改请求置为完成 */
export async function completeChangeRequest(
  db: D1Database,
  requestId: string,
  now: number
): Promise<void> {
  await db
    .prepare(`UPDATE email_change_requests SET status = 'completed', updated_at = ? WHERE id = ?`)
    .bind(now, requestId)
    .run();
}