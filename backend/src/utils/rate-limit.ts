/**
 * 速率限制器（D1 持久化）：计数存 D1，不同 isolate / 实例共享同一窗口。
 *
 * 采用 fail-open：D1 读写异常时放行并打日志，限流故障不阻断业务请求。
 */

/** 默认单窗口配置：60 秒内最多 15 次请求 */
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 15;

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export interface MultiLevelLimit {
  windowMs: number;
  maxRequests: number;
  label: string; // 错误提示文本
}

/**
 * 单窗口计数限流（D1 持久化，跨 isolate 共享）。
 * identifier 需自带业务前缀与主体，如 "search:user123"、"suggestions:ip:1.2.3.4"；
 * allowed=false 时 retryAfter 为建议等待秒数。
 */
export async function checkRateLimitD1(
  db: D1Database,
  identifier: string,
  windowMs: number = DEFAULT_WINDOW_MS,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = now + windowMs;

  try {
    const existing = await db
      .prepare('SELECT count, reset_at FROM rate_limits WHERE id = ?')
      .bind(identifier)
      .first<{ count: number; reset_at: number }>();

    if (!existing || now > existing.reset_at) {
      await db
        .prepare(
          'INSERT OR REPLACE INTO rate_limits (id, count, reset_at, created_at) VALUES (?, 1, ?, ?)',
        )
        .bind(identifier, resetAt, now)
        .run();
      return { allowed: true };
    }

    if (existing.count >= maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((existing.reset_at - now) / 1000),
      };
    }

    await db
      .prepare('UPDATE rate_limits SET count = count + 1 WHERE id = ?')
      .bind(identifier)
      .run();

    return { allowed: true };
  } catch (error) {
    // fail-open：限流表故障时放行，避免全站请求被误判为超限
    console.error('[RateLimit] D1 error:', error);
    return { allowed: true };
  }
}

/**
 * 多级限流（如每分钟/每小时/每天）：任一层超限即整体拒绝，且不消耗任何一层计数。
 * 每层独立 key 为 `${identifier}:L{i}`，level 返回触发限制的层级下标。
 */
export async function checkMultiLevelRateLimit(
  db: D1Database,
  identifier: string,
  limits: MultiLevelLimit[],
): Promise<{ allowed: boolean; retryAfter?: number; level?: number; message?: string }> {
  if (limits.length === 0) return { allowed: true };

  const now = Date.now();
  const levelKeys = limits.map((_, i) => `${identifier}:L${i}`);

  try {
    // 一次性读取所有层级：命中 IN 查询，避免逐层往返
    const placeholders = levelKeys.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT id, count, reset_at FROM rate_limits WHERE id IN (${placeholders})`)
      .bind(...levelKeys)
      .all<{ id: string; count: number; reset_at: number }>();
    const existing = new Map((results || []).map((row) => [row.id, row]));

    // 先全量判定：任一层超限则整体拒绝，且不消耗任何一层的计数
    for (let i = 0; i < limits.length; i++) {
      const row = existing.get(levelKeys[i]);
      if (row && row.reset_at > now && row.count >= limits[i].maxRequests) {
        return {
          allowed: false,
          retryAfter: Math.ceil((row.reset_at - now) / 1000),
          level: i,
          message: `${limits[i].label}请求次数已达上限，请稍后再试`,
        };
      }
    }

    // 全部通过后再统一落库：新窗口建记录，其余层递增
    const writes = limits.map((limit, i) => {
      const row = existing.get(levelKeys[i]);
      if (!row || row.reset_at <= now) {
        return db
          .prepare('INSERT OR REPLACE INTO rate_limits (id, count, reset_at, created_at) VALUES (?, 1, ?, ?)')
          .bind(levelKeys[i], now + limit.windowMs, now);
      }
      return db.prepare('UPDATE rate_limits SET count = count + 1 WHERE id = ?').bind(levelKeys[i]);
    });
    await db.batch(writes);

    return { allowed: true };
  } catch (error) {
    // 与单窗口版本一致：异常时放行
    console.error('[RateLimit] Multi-level error:', error);
    return { allowed: true };
  }
}

export interface RateLimitUsage {
  count: number;
  maxRequests: number;
  windowMs: number;
  /** 当前窗口重置时间戳（毫秒）；0 表示窗口已过期或尚无记录 */
  resetAt: number;
  label: string;
}

/**
 * 读取多级限流当前窗口用量（只读，不计数），用于配额展示。
 */
export async function getMultiLevelRateLimitUsage(
  db: D1Database,
  identifier: string,
  limits: MultiLevelLimit[],
): Promise<RateLimitUsage[]> {
  const now = Date.now();
  const levelKeys = limits.map((_, i) => `${identifier}:L${i}`);

  let rows: Array<{ id: string; count: number; reset_at: number }> = [];
  try {
    const placeholders = levelKeys.map(() => '?').join(',');
    const result = await db
      .prepare(`SELECT id, count, reset_at FROM rate_limits WHERE id IN (${placeholders})`)
      .bind(...levelKeys)
      .all<{ id: string; count: number; reset_at: number }>();
    rows = result.results || [];
  } catch (error) {
    console.error('[RateLimit] Usage query error:', error);
  }

  const rowMap = new Map(rows.map((row) => [row.id, row]));

  return limits.map((limit, i) => {
    const row = rowMap.get(levelKeys[i]);
    if (!row || row.reset_at <= now) {
      return {
        count: 0,
        maxRequests: limit.maxRequests,
        windowMs: limit.windowMs,
        resetAt: 0,
        label: limit.label,
      };
    }
    return {
      count: row.count,
      maxRequests: limit.maxRequests,
      windowMs: limit.windowMs,
      resetAt: row.reset_at,
      label: limit.label,
    };
  });
}

// ── 注册风控（邮箱注册与 OAuth 自动注册共用） ───────────────────────

/**
 * 注册风控多级限流配置：同一出口 IP 的注册请求上限（含失败重试）。
 * 邮箱路径另有邮件发送限流兜底（默认 5/时、20/天），此处为接口级防线，
 * 主要拦截批量注册与「账号是否已注册」枚举探测，并为失败重试预留余量。
 */
export const REGISTER_IP_LIMITS: MultiLevelLimit[] = [
  { windowMs: 60_000, maxRequests: 5, label: '每分钟' },
  { windowMs: 3_600_000, maxRequests: 10, label: '每小时' },
  { windowMs: 86_400_000, maxRequests: 20, label: '每天' },
];

/**
 * 构造注册限流键：邮箱注册与 OAuth 自动注册共用同一配额（按出口 IP 汇总计数）
 */
export function registerRateLimitKey(ip: string): string {
  return `register:ip:${normalizeIpForRateLimit(ip)}`;
}

/**
 * 将 IP 归一化为限流键粒度：
 * - IPv4：保留完整地址
 * - IPv6：按 /64 前缀聚合（单机地址位可随机变化，按全地址计数容易被绕过）
 */
export function normalizeIpForRateLimit(ip: string): string {
  const value = (ip || '').trim().split('%')[0]; // 去除 zone id
  if (!value) return 'unknown';
  if (!value.includes(':')) return value; // IPv4

  // IPv4-mapped IPv6（::ffff:1.2.3.4）按 IPv4 处理
  const v4Mapped = value.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (value.startsWith('::ffff:') && v4Mapped) return v4Mapped[1];

  // 展开 :: 缩写后取前 4 组作为 /64 前缀
  const [head, tail = ''] = value.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = Math.max(8 - headGroups.length - tailGroups.length, 0);
  const full = [...headGroups, ...Array(missing).fill('0'), ...tailGroups];
  return full.slice(0, 4).join(':');
}

/** @deprecated 内存实现已移除，改用 checkRateLimitD1；保留本函数仅为兼容旧调用点。 */
export function checkRateLimit(
  _identifier: string,
  _windowMs?: number,
  _maxRequests?: number,
): { allowed: boolean; retryAfter?: number } {
  console.warn(
    '[RateLimit] checkRateLimit is deprecated, use checkRateLimitD1 instead',
  );
  return { allowed: true };
}
