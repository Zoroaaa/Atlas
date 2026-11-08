import { sourceApi } from '@/services/api';
import { useAuthStore } from '@/stores';

/**
 * 上报搜索源在搜索结果中的曝光次数（usage_count 为曝光/展示热度口径，不是点击量）。
 * 入参必须是真实 search_sources.id（搜索结果里的 sourceId），不能传分类 id；
 * 后端该接口要求登录，匿名时直接跳过；上报失败不影响搜索主流程。
 */
export const reportSourceUsage = (sourceIds: Iterable<string | null | undefined>): void => {
  if (!useAuthStore.getState().isAuthenticated) return;

  const uniqueIds = new Set<string>();
  for (const id of sourceIds) {
    if (id) uniqueIds.add(id);
  }

  uniqueIds.forEach((id) => {
    void sourceApi.incrementUsage(id).catch(() => {});
  });
};
