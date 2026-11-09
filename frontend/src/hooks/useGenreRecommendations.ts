import { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores';
import { javApi } from '@/services/api';
import { readPersisted, writePersisted } from '@/utils/persistentCache';
import { GENRE_REC_CACHE_TTL } from '@/types';
import type { GenreRecommendationResult } from '@/types';

/**
 * 读取本地缓存。空标签结果（词典未同步/同步失败时的历史响应）一律视为无效：
 * 否则它会被当作新鲜 initialData，30 分钟内不再发请求，推荐标签面板将一直不显示。
 */
function readValidCache(cacheKey: string) {
  const entry = readPersisted<GenreRecommendationResult>(cacheKey, GENRE_REC_CACHE_TTL);
  if (!entry || (entry.data.tags?.length ?? 0) === 0) return null;
  return entry;
}

/**
 * 推荐标签：服务端有 5 分钟缓存，前端沿用"为你推荐"的 30 分钟本地缓存。
 * refresh 会带 refresh=1 绕过服务端缓存（换一批标签）。
 */
export function useGenreRecommendations() {
  const { isAuthenticated, user } = useAuthStore();
  const cacheKey = `genre-rec:tags:${user?.id ?? ''}`;
  const forceRefreshRef = useRef(false);

  const query = useQuery<GenreRecommendationResult>({
    queryKey: ['genreRec', user?.id ?? ''],
    queryFn: async () => {
      const refresh = forceRefreshRef.current;
      forceRefreshRef.current = false;
      const response = await javApi.genreRecommendations(refresh);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || response.message || '获取推荐标签失败');
      }
      // 空结果不落缓存，避免词典同步完成后仍被本地空数据挡住
      if (response.data.tags.length > 0) writePersisted(cacheKey, response.data);
      return response.data;
    },
    enabled: isAuthenticated,
    staleTime: GENRE_REC_CACHE_TTL,
    initialData: user?.id ? () => readValidCache(cacheKey)?.data : undefined,
    initialDataUpdatedAt: user?.id ? () => readValidCache(cacheKey)?.cachedAt : undefined,
    retry: 1,
  });

  const refresh = useCallback(() => {
    forceRefreshRef.current = true;
    void query.refetch();
  }, [query]);

  return { ...query, refresh, queryEnabled: isAuthenticated };
}
