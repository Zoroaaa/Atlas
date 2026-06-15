/**
 * 简易速率限制器（内存级）
 *
 * ⚠️ Cloudflare Workers 是无状态的，每个实例独立维护计数。
 *   跨实例限流不完美，但足以防止单个用户的意外高频请求。
 *   如需严格限流，应改用 D1/KV 持久化存储。
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** 默认配置：每分钟最多 15 次搜索请求 */
const DEFAULT_WINDOW_MS = 60_000; // 1 分钟窗口
const DEFAULT_MAX_REQUESTS = 15;

const store = new Map<string, RateLimitEntry>();

/**
 * 清理过期条目（防止内存泄漏）
 * 定期调用，或每次检查时顺带清理
 */
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * 检查是否允许请求
 * @returns { allowed, retryAfter } — allowed=false 时 retryAfter 为建议等待秒数
 */
export function checkRateLimit(
  identifier: string,
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
): { allowed: boolean; retryAfter?: number } {
  // 每 100 次检查清理一次（避免频繁遍历）
  if (store.size > 500 || Math.random() < 0.01) cleanup();

  const now = Date.now();
  const existing = store.get(identifier);

  if (!existing || now > existing.resetAt) {
    // 新窗口
    store.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count++;
  return { allowed: true };
}
