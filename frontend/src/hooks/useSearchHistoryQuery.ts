import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import type { SearchHistoryItem } from '@/types';

export const searchHistoryKeys = {
  all: ['searchHistory'] as const,
  withLimit: (limit: number) => ['searchHistory', limit] as const,
};

export function useSearchHistory(limit = 20) {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: searchHistoryKeys.withLimit(limit),
    queryFn: async () => {
      const response = await userApi.getSearchHistory(limit);
      if (response.success && response.data) {
        return response.data.history;
      }
      return [] as SearchHistoryItem[];
    },
    enabled: isAuthenticated,
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
