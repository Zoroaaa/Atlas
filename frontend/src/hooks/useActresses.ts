import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/services/api';
import i18next from '@/i18n';
import type { ActressEntry } from '@/types/jav';
import { ACTRESSES_CACHE_KEY, ACTRESSES_CACHE_TTL } from '@/types/jav';

interface CacheEntry {
  data: ActressEntry[];
  cachedAt: number;
}

function readCache(): ActressEntry[] | null {
  try {
    const raw = localStorage.getItem(ACTRESSES_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > ACTRESSES_CACHE_TTL) {
      localStorage.removeItem(ACTRESSES_CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: ActressEntry[]): void {
  try {
    const entry: CacheEntry = { data, cachedAt: Date.now() };
    localStorage.setItem(ACTRESSES_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

export function useActresses() {
  const [data, setData] = useState<ActressEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActresses = useCallback(async (force = false) => {
    if (!force) {
      const cached = readCache();
      if (cached) {
        setData(cached);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const resp = await apiClient.get<{ success: boolean; data: ActressEntry[] }>('/jav/actresses');
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
