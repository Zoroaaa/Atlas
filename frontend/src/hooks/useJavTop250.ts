import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/services/api';
import i18next from '@/i18n';
import type { JavTop250, JavTop250Section } from '@/types';
import {
  JAV_TOP250_CACHE_KEY,
  JAV_TOP250_CACHE_TTL,
  JAV_TOP250_YEAR_CACHE_TTL,
} from '@/types';

interface CacheEntry {
  data: JavTop250;
  cachedAt: number;
}

function cacheId(section: JavTop250Section, year: number | null): string {
  return `${section}:${year == null ? 'all' : year}`;
}

function ttlOf(year: number | null): number {
  return year == null ? JAV_TOP250_CACHE_TTL : JAV_TOP250_YEAR_CACHE_TTL;
}

function readAllCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(JAV_TOP250_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readCache(section: JavTop250Section, year: number | null): JavTop250 | null {
  const entry = readAllCache()[cacheId(section, year)];
  if (!entry?.data || !Array.isArray(entry.data.items)) return null;
  if (Date.now() - entry.cachedAt > ttlOf(year)) return null;
  return entry.data;
}

function writeCache(data: JavTop250): void {
  try {
    const all = readAllCache();
    all[cacheId(data.section, data.year)] = { data, cachedAt: Date.now() };
    localStorage.setItem(JAV_TOP250_CACHE_KEY, JSON.stringify(all));
  } catch {
    // localStorage 可能已满，忽略
  }
}

export function useJavTop250(section: JavTop250Section, year: number | null) {
  const [data, setData] = useState<JavTop250 | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchTop250 = useCallback(async (force = false) => {
    if (!force) {
      const cached = readCache(section, year);
      if (cached) {
        setData(cached);
        return;
      }
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ section });
      if (year != null) params.set('year', String(year));
      if (force) params.set('refresh', '1');

      const resp = await apiClient.get<{ success: boolean; data: JavTop250 }>(
        `/jav/top250?${params.toString()}`
      );
      if (requestId !== requestIdRef.current) return;
      if (resp.success && resp.data) {
        // 空结果不写本地长缓存：否则同步异常/迁移未执行时用户 30 天看不到数据
        if (Array.isArray(resp.data.items) && resp.data.items.length > 0) {
          writeCache(resp.data);
        }
        setData(resp.data);
      } else {
        setError(i18next.t('errors:hooks.javRankings.fetchRankingsFailed'));
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('JAV top250 fetch error:', err);
      setError(i18next.t('errors:hooks.javRankings.networkFailed'));
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [section, year]);

  useEffect(() => {
    setData(null);
    fetchTop250(false);
  }, [fetchTop250]);

  const refresh = useCallback(() => fetchTop250(true), [fetchTop250]);

  return { data, isLoading, error, refresh };
}
