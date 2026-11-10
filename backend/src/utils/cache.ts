/**
 * 进程内 TTL 缓存（Workers isolate 级）
 *
 * 仅用于低频变化的静态字典（大类/分类/标签）与看板聚合结果。
 * 每个 isolate 独立缓存，过期后自动重新查库；写路径通过 invalidateCache 主动失效，
 * 未失效时最坏情况只会陈旧 ttlMs 毫秒。
 */
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/**
 * 读缓存，未命中或已过期时执行 loader 并写回。
 * loader 抛错时不写入缓存，避免把失败结果固化。
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }

  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** 按前缀失效（例如 'sources:dict' 会清掉 sources:dict:major 等） */
export function invalidateCache(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
