import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/services/api';
import i18next from '@/i18n';
import type { HotActressRanking } from '@/types/jav';
import { ACTRESSES_CACHE_KEY, ACTRESSES_CACHE_TTL } from '@/types/jav';

interface CacheEntry {
  data: HotActressRanking;
  cachedAt: number;
}

function readCache(): HotActressRanking | null {
  try {
    const raw = localStorage.getItem(ACTRESSES_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > ACTRESSES_CACHE_TTL) {
      localStorage.removeItem(ACTRESSES_CACHE_KEY);
      return null;
    }
    if (!Array.isArray(entry.data?.items)) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: HotActressRanking): void {
  try {
    const entry: CacheEntry = { data, cachedAt: Date.now() };
    localStorage.setItem(ACTRESSES_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(ACTRESSES_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function useActresses() {
  const [data, setData] = useState<HotActressRanking | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActresses = useCallback(async (force = false) => {
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
      const resp = await apiClient.get<{ success: boolean; data: HotActressRanking }>(
        `/jav/actresses${force ? '?refresh=1' : ''}`
      );
      if (resp.success && resp.data) {
        writeCache(resp.data);
        setData(resp.data);
      } else {
        setError(i18next.t('errors:hooks.actresses.fetchListFailed'));
      }
    } catch (err) {
      console.error('Actresses fetch error:', err);
      setError(i18next.t('errors:hooks.actresses.networkFailed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActresses(false);
  }, [fetchActresses]);

  const refresh = useCallback(() => fetchActresses(true), [fetchActresses]);

  return { data, isLoading, error, refresh };
}
