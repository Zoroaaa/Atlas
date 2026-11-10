/**
 * 定时任务互斥锁（D1 租约）
 *
 * Workers cron 不保证上一轮结束后才开始下一轮：抓外部站或发信变慢时，
 * 30 分钟一轮的任务会重叠执行，重复写 D1、重复通知。
 *
 * 这里用一张极小的表做租约：谁抢到 locked_until 就是谁在跑，
 * 跑完主动删除；崩溃没删的，租约到期后下一轮可抢占，无需人工清理。
 *
 * 失败策略（重要）：
 *   - 加锁本身出错（例如脚本 25 还没执行、表不存在）→ 记录警告后按无锁执行，
 *     不能让「优化项」把定时任务卡死。
 *   - 抢不到锁 → 跳过本轮，由下一轮补上（这些任务都是幂等/可补偿的）。
 */

/**
 * 在锁保护下执行任务。
 * @returns 任务返回值；抢不到锁时返回 null
 */
export async function withCronLock<T>(
  db: D1Database,
  key: string,
  ttlMs: number,
  task: () => Promise<T>,
): Promise<T | null> {
  const owner = crypto.randomUUID();
  const now = Date.now();

  let acquired: { key: string } | null;
  try {
    // 单条 UPSERT 抢占：租约已过期（或从未有过）才更新成功
    acquired = await db
      .prepare(
        `INSERT INTO cron_locks (key, locked_until, owner, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           locked_until = excluded.locked_until,
           owner = excluded.owner,
           updated_at = excluded.updated_at
         WHERE cron_locks.locked_until <= ?
         RETURNING key`,
      )
      .bind(key, now + ttlMs, owner, now, now)
      .first<{ key: string }>();
  } catch (err) {
    console.warn(`[cron-lock] ${key} 加锁失败，按无锁执行：`, err);
    return task();
  }

  if (!acquired) {
    console.log(`[cron-lock] ${key} 上一轮仍在执行，跳过本轮`);
    return null;
  }

  try {
    return await task();
  } finally {
    // 释放失败不影响结果：租约到期后自然可被下一轮抢占
    await db
      .prepare('DELETE FROM cron_locks WHERE key = ? AND owner = ?')
      .bind(key, owner)
      .run()
      .catch((err) => console.error(`[cron-lock] ${key} 释放失败：`, err));
  }
}
