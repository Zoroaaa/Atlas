/**
 * 共享 HTTP 工具函数
 * 统一 fetchWithRetry 实现，避免 anime-search / movie-search 各自重复定义
 */

export interface RetryOptions {
  retries?: number;
  baseDelay?: number;
}

/**
 * 带重试的 fetch
 * - 429 Too Many Requests / 503 Service Unavailable → 指数退避重试
 * - 网络错误 → 同样重试
 * - 耗尽重试次数后抛出最后一个错误
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  const { retries = 2, baseDelay = 1000 } = opts ?? {};
  let lastError: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, init);
      // 429 / 503 → 重试（覆盖两处原有逻辑的并集）
      if ((r.status === 429 || r.status === 503) && i < retries) {
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 500;
        console.warn(`[retry] ${url} → ${r.status}, retry #${i + 1} after ${Math.round(delay)}ms`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      return r;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries) {
        const delay = baseDelay * Math.pow(2, i);
        console.warn(`[retry] ${url} → error, retry #${i + 1} after ${Math.round(delay)}ms`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  throw lastError || new Error('fetchWithRetry exhausted');
}
