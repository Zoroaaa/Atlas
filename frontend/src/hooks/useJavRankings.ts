import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/services/api';
import type { JavRankings } from '@/types';
import { JAV_CACHE_KEY, JAV_CACHE_TTL } from '@/types';

interface CacheEntry {
  data: JavRankings;
  cachedAt: number;
}

function readCache(): JavRankings | null {
  try {
    const raw = localStorage.getItem(JAV_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > JAV_CACHE_TTL) {
      localStorage.removeItem(JAV_CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: JavRankings): void {
  try {
    const entry: CacheEntry = { data, cachedAt: Date.now() };
    localStorage.setItem(JAV_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage 可能已满，忽略
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(JAV_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function getCacheAge(): number | null {
  try {
    const raw = localStorage.getItem(JAV_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    return Date.now() - entry.cachedAt;
  } catch {
    return null;
  }
}

export function useJavRankings() {
  const [data, setData] = useState<JavRankings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheAge, setCacheAge] = useState<number | null>(null);

  const fetchRankings = useCallback(async (force = false) => {
    // 非强制刷新时先读缓存
    if (!force) {
      const cached = readCache();
      if (cached) {
        setData(cached);
        setFromCache(true);
        setCacheAge(getCacheAge());
        return;
      }
    } else {
      clearCache();
    }

    setIsLoading(true);
    setError(null);
    setFromCache(false);

    try {
      const resp = await apiClient.get<{ success: boolean; data: JavRankings }>(
        `/jav/rankings${force ? '?force=true' : ''}`
      );
      if (resp.success && resp.data) {
        writeCache(resp.data);
        setData(resp.data);
        setCacheAge(0);
      } else {
        setError('获取榜单失败');
      }
    } catch (err) {
      console.error('JAV rankings fetch error:', err);
      setError('网络请求失败，请检查连接');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchRankings(false);
  }, [fetchRankings]);

  // 刷新缓存时间显示
  useEffect(() => {
    if (!fromCache) return;
    const interval = setInterval(() => {
      setCacheAge(getCacheAge());
    }, 30000);
    return () => clearInterval(interval);
  }, [fromCache]);

  const refresh = useCallback(() => fetchRankings(true), [fetchRankings]);

  return { data, isLoading, error, fromCache, cacheAge, refresh };
}
