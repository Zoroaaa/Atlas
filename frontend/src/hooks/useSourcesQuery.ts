import { useQuery } from '@tanstack/react-query';
import { sourceApi } from '@/services/api';
import type { MajorCategory, Category, SearchSource, UserSourceConfig } from '@/types';

export const sourcesKeys = {
  majorCategories: ['sources', 'majorCategories'] as const,
  categories: ['sources', 'categories'] as const,
  userConfig: ['sources', 'userConfig'] as const,
};

export function useMajorCategories() {
  return useQuery({
    queryKey: sourcesKeys.majorCategories,
    queryFn: async () => {
      const response = await sourceApi.getMajorCategories();
      if (response.success && response.data) {
        return response.data;
      }
      return [] as MajorCategory[];
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: sourcesKeys.categories,
    queryFn: async () => {
      const response = await sourceApi.getCategories();
      if (response.success && response.data) {
        return response.data;
      }
      return [] as Category[];
    },
  });
}

export function useSourcesWithUserConfig() {
  return useQuery({
    queryKey: sourcesKeys.userConfig,
    queryFn: async () => {
      const response = await sourceApi.getSourcesWithUserConfig();
      if (response.success && response.data) {
        return response.data;
      }
      return [] as Array<SearchSource & { userConfig: UserSourceConfig | null }>;
    },
  });
}
