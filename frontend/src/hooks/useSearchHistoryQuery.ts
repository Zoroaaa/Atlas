import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { readPersisted, writePersisted } from '@/utils/persistentCache';
import type { SearchHistoryItem } from '@/types';

// 本设备的搜索/删除会触发 invalidate（queryClient 中同步清本地缓存）；跨设备变化用 TTL 兜底
const HISTORY_CACHE_TTL = 24 * 60 * 60 * 1000;

export const searchHistoryKeys = {
  all: ['searchHistory'] as const,
  withLimit: (limit: number, userId?: string) => ['searchHistory', limit, userId] as const,
};

export function useSearchHistory(limit = 20) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const cacheKey = `hist:${userId}:${limit}`;

  return useQuery({
    queryKey: searchHistoryKeys.withLimit(limit, userId),
    queryFn: async (): Promise<SearchHistoryItem[]> => {
      const response = await userApi.getSearchHistory(limit);
      if (!response.success || !response.data) throw new Error('fetch search history failed');
      writePersisted(cacheKey, response.data.history);
      return response.data.history;
    },
    enabled: isAuthenticated && !!userId,
    staleTime: HISTORY_CACHE_TTL,
    initialData: () => readPersisted<SearchHistoryItem[]>(cacheKey, HISTORY_CACHE_TTL)?.data,
    initialDataUpdatedAt: () => readPersisted<SearchHistoryItem[]>(cacheKey, HISTORY_CACHE_TTL)?.cachedAt,
  });
}

export function useClearSearchHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => userApi.clearSearchHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.all });
    },
  });
}

export function useDeleteSearchHistoryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => userApi.deleteSearchHistoryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.all });
    },
  });
}

export function useBatchDeleteSearchHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => userApi.batchDeleteSearchHistory(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.all });
    },
  });
}
