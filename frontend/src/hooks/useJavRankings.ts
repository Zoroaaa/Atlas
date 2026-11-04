import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/services/api';
import i18next from '@/i18n';
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
    if (!entry.data?.weekly || !entry.data?.monthly) return null;
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

export function useJavRankings() {
  const [data, setData] = useState<JavRankings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRankings = useCallback(async (force = false) => {
    if (!force) {
      const cached = readCache();
      if (cached) {
        setData(cached);
        return;
      }
    } else {
      clearCache();
    }

    setIsLoading(true);
    setError(null);

    try {
      const resp = await apiClient.get<{ success: boolean; data: JavRankings }>(
        `/jav/rankings${force ? '?refresh=1' : ''}`
      );
      if (resp.success && resp.data) {
        writeCache(resp.data);
        setData(resp.data);
      } else {
        setError(i18next.t('errors:hooks.javRankings.fetchRankingsFailed'));
      }
    } catch (err) {
      console.error('JAV rankings fetch error:', err);
      setError(i18next.t('errors:hooks.javRankings.networkFailed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRankings(false);
  }, [fetchRankings]);

  const refresh = useCallback(() => fetchRankings(true), [fetchRankings]);

  return { data, isLoading, error, refresh };
}
