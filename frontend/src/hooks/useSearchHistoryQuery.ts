import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { userApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { readPersisted, writePersisted } from '@/utils/persistentCache';
import type { SearchHistoryItem, SearchHistoryStats } from '@/types';

// 本设备的搜索/删除会触发 invalidate（queryClient 中同步清本地缓存）；跨设备变化用 TTL 兜底
const HISTORY_CACHE_TTL = 24 * 60 * 60 * 1000;

export const searchHistoryKeys = {
  all: ['searchHistory'] as const,
  withLimit: (limit: number, userId?: string) => ['searchHistory', limit, userId] as const,
  page: (userId: string | undefined, pageSize: number, page: number, opts?: SearchHistoryPageOpts) =>
    ['searchHistory', 'page', userId, pageSize, page, opts?.q ?? '', opts?.since ?? 0] as const,
  stats: (userId?: string) => ['searchHistory', 'stats', userId] as const,
};

export const SEARCH_HISTORY_PAGE_SIZE = 10;

export interface SearchHistoryPageOpts {
  q?: string;
  since?: number;
}

interface SearchHistoryPageData {
  history: SearchHistoryItem[];
  total: number;
}

/** 服务端分页；无筛选（主页面板）时落本地持久缓存，带筛选（控制台）只走内存缓存 */
export function useSearchHistoryPage(page: number, pageSize = SEARCH_HISTORY_PAGE_SIZE, opts: SearchHistoryPageOpts = {}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const persist = !opts.q && !opts.since;
  const cacheKey = `hist:page:${userId}:${pageSize}:${page}`;

  return useQuery({
    queryKey: searchHistoryKeys.page(userId, pageSize, page, opts),
    queryFn: async (): Promise<SearchHistoryPageData> => {
      const response = await userApi.getSearchHistoryPage(page, pageSize, opts);
      if (!response.success || !response.data) throw new Error('fetch search history page failed');
      if (persist) writePersisted(cacheKey, response.data);
      return response.data;
    },
    enabled: isAuthenticated && !!userId,
    staleTime: persist ? HISTORY_CACHE_TTL : 60 * 1000,
    placeholderData: keepPreviousData,
    initialData: persist ? () => readPersisted<SearchHistoryPageData>(cacheKey, HISTORY_CACHE_TTL)?.data : undefined,
    initialDataUpdatedAt: persist ? () => readPersisted<SearchHistoryPageData>(cacheKey, HISTORY_CACHE_TTL)?.cachedAt : undefined,
  });
}

/** 控制台统计：服务端对全部记录聚合 */
export function useSearchHistoryStats() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: searchHistoryKeys.stats(userId),
    queryFn: async (): Promise<SearchHistoryStats> => {
      const response = await userApi.getSearchHistoryStats();
      if (!response.success || !response.data) throw new Error('fetch search history stats failed');
      return response.data;
    },
    enabled: isAuthenticated && !!userId,
    staleTime: 60 * 1000,
  });
}

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
