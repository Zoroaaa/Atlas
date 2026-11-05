const PREFIX = 'cs_cache_v1:';

interface Entry<T> {
  data: T;
  cachedAt: number;
}

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

export function writePersisted<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() } satisfies Entry<T>));
  } catch {
    // localStorage 可能已满或被禁用，忽略
  }
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
