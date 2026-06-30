import { useMutation, useQueryClient } from '@tanstack/react-query';
import { searchApi } from '@/services/api';
import type { SearchEndpointResponse } from '@/services/api/types';

export interface SearchMutationVars {
  keyword: string;
  sourceIds?: string[];
  categoryId?: string;
  majorCategoryId?: string;
  page?: number;
  pageSize?: number;
}

export function useSearchMutation() {
  const queryClient = useQueryClient();

  return useMutation<SearchEndpointResponse, Error, SearchMutationVars>({
    mutationFn: (vars) => searchApi.search(vars),
    onSuccess: () => {
      // 搜索完成后使搜索历史缓存失效，以便重新获取
      queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
    },
  });
}
