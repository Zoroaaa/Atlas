import { useQuery } from '@tanstack/react-query';
import { sourceApi } from '@/services/api';

export const sourcesKeys = {
  majorCategories: ['sources', 'majorCategories'] as const,
  categories: ['sources', 'categories'] as const,
  userConfig: ['sources', 'userConfig'] as const,
  userTree: ['sources', 'tree', 'user'] as const,
  adminTree: ['sources', 'tree', 'admin'] as const,
  catalog: ['sources', 'catalog'] as const,
  stats: ['sources', 'stats'] as const,
};

export function useSourcesWithUserConfig() {
  return useQuery({
    queryKey: sourcesKeys.userConfig,
    queryFn: async () => {
      const response = await sourceApi.getSourcesWithUserConfig();
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error('获取搜索源失败');
    },
  });
}

/** 用户源站树：系统树 + 个人私有树 */
export function useUserSourceTree(enabled = true) {
  return useQuery({
    queryKey: sourcesKeys.userTree,
    enabled,
    queryFn: async () => {
      const response = await sourceApi.getUserSourceTree();
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error('获取源站树失败');
    },
  });
}

/** 管理后台系统源站树 */
export function useAdminSourceTree(enabled = true) {
  return useQuery({
    queryKey: sourcesKeys.adminTree,
    enabled,
    queryFn: async () => {
      const response = await sourceApi.getAdminSourceTree();
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error('获取系统源站树失败');
    },
  });
}
