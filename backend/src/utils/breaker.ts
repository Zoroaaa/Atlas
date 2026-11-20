/**
 * 源级熔断：连续失败达到阈值后，冷却期内直接跳过该源，不再发请求。
 *
 * 为什么用 Cache API 而不是 D1：熔断状态是「可有可无的加速信息」，
 * 丢了最多多等一次超时，不值得为它增加 D1 写压力；Cache API 天然带 TTL，
 * 也能跨 isolate 共享（同一 colo 内）。
 *
 * 约束：只做「连续失败计数」，不做错误分类 —— 分类由 classifySearchError 负责，
 * 熔断只关心「最近是不是一直不通」。
 */

const BREAKER_PREFIX = 'https://internal/breaker';

interface BreakerState {
  fails: number;
  lastFailure: number;
}

async function readState(key: string): Promise<BreakerState | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const hit = await caches.default.match(new Request(`${BREAKER_PREFIX}/${key}`));
    if (!hit) return null;
    return await hit.json() as BreakerState;
  } catch {
    return null;
  }
}

/** 是否应跳过该源；冷却期按「失败次数越多越久」退避，上限 30 分钟 */
export async function isCircuitOpen(key: string, cooldownSeconds = 900): Promise<boolean> {
  const state = await readState(key);
  if (!state || state.fails <= 0) return false;
  const backoff = Math.min(cooldownSeconds * 2 ** (state.fails - 1), 30 * 60);
  return Date.now() - state.lastFailure < backoff * 1000;
}

/** 记一次失败；达阈值后冷却期内会被跳过 */
export async function recordCircuitFailure(key: string, cooldownSeconds = 900): Promise<void> {
  if (typeof caches === 'undefined') return;
  const state = await readState(key);
  const next: BreakerState = { fails: (state?.fails ?? 0) + 1, lastFailure: Date.now() };
  try {
    const ttl = Math.min(cooldownSeconds * 2 ** Math.min(next.fails, 6), 30 * 60);
    await caches.default.put(
      new Request(`${BREAKER_PREFIX}/${key}`),
      new Response(JSON.stringify(next), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
      }),
    );
  } catch {
    // 熔断写入失败不影响本次搜索
  }
}

/** 成功一次即清零：偶发失败不该累积成熔断 */
export async function recordCircuitSuccess(key: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.default.put(
      new Request(`${BREAKER_PREFIX}/${key}`),
      new Response(JSON.stringify({ fails: 0, lastFailure: 0 }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' },
      }),
    );
  } catch {
    // ignore
  }
}
