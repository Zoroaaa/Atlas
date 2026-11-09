import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores';
import { javApi } from '@/services/api';
import type { GenreWorksResult } from '@/types';

export interface GenreWorksError extends Error {
  code?: string;
}

/**
 * 标签作品：每次只取 12 条；refresh 走随机页（避免同页重复）。
 * 服务端已经整页缓存 1 小时，这里只做短周期去重，不做本地持久缓存。
 */
export function useGenreWorks(tagKey: string | null) {
  const { isAuthenticated, user } = useAuthStore();
  const lastPageRef = useRef<number | undefined>(undefined);
  const forceRefreshRef = useRef(false);

  useEffect(() => {
    lastPageRef.current = undefined;
    forceRefreshRef.current = false;
  }, [tagKey]);

  const query = useQuery<GenreWorksResult>({
    queryKey: ['genreRec', 'works', user?.id ?? '', tagKey ?? ''],
    queryFn: async () => {
      const refresh = forceRefreshRef.current;
      forceRefreshRef.current = false;
      const response = await javApi.genreWorks({
        genre: tagKey as string,
        refresh,
        prevPage: lastPageRef.current,
      });

      if (!response.success || !response.data) {
        const err: GenreWorksError = new Error(
          response.error?.message || response.message || '获取标签作品失败'
        );
        err.code = response.error?.code || 'SERVER_ERROR';
        throw err;
      }

      lastPageRef.current = response.data.page;
      return response.data;
    },
    enabled: Boolean(tagKey) && isAuthenticated,
    staleTime: 0,
    retry: 1,
  });

  const refresh = useCallback(() => {
    forceRefreshRef.current = true;
    void query.refetch();
  }, [query]);

  return { ...query, refresh };
}
