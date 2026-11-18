/**
 * 本地持久缓存：用 localStorage 前缀 cs_cache_v1: 存放带 TTL 的查询快照。
 *
 * 约束：只存收藏/历史等可重建数据；读写失败静默降级，不能影响页面。
 */

const PREFIX = 'cs_cache_v1:';

interface Entry<T> {
  data: T;
  cachedAt: number;
}

/** 读取未过期的缓存；过期或数据损坏时删除并返回 null。 */
export function readPersisted<T>(key: string, maxAgeMs: number): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.cachedAt !== 'number' || entry.data === undefined) return null;
    if (Date.now() - entry.cachedAt > maxAgeMs) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/** 写入缓存并记录当前时间戳，供读取时判断 TTL。 */
export function writePersisted<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() } satisfies Entry<T>));
  } catch {
    // localStorage 可能已满或被禁用，忽略
  }
}

/** 清空全部本地持久缓存（退出登录时调用，避免共用设备上泄露收藏/历史） */
export function clearAllPersisted(): void {
  removePersistedByPrefix('');
}

/** 删除所有以 prefix 开头的缓存项（数据发生变化时调用） */
export function removePersistedByPrefix(prefix: string): void {
  try {
    const full = PREFIX + prefix;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(full)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
