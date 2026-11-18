/**
 * 全局 QueryClient：集中定义缓存生命周期与重试策略。
 *
 * 约束：收藏/历史被 invalidate 时必须同步清掉本地持久缓存，避免旧数据继续命中。
 */

import { QueryClient } from '@tanstack/react-query';
import { removePersistedByPrefix } from '@/utils/persistentCache';

/** 全局查询客户端；组件只通过 hooks 使用，不另建实例。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// 收藏/搜索历史被 invalidate（增删改、产生新搜索）时，同步清掉本地持久缓存，
// 保证"数据没变就读本地、变了就重取"，无论 invalidate 从哪里发起
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
  const root = event.query.queryKey[0];
  if (root === 'favorites') {
    removePersistedByPrefix('fav:');
    removePersistedByPrefix('sync:');
    removePersistedByPrefix('genre-rec:');
    void queryClient.invalidateQueries({ queryKey: ['genreRec'] });
  }
  if (root === 'searchHistory') {
    removePersistedByPrefix('hist:');
    removePersistedByPrefix('sync:');
    removePersistedByPrefix('genre-rec:');
    void queryClient.invalidateQueries({ queryKey: ['genreRec'] });
  }
  if (root === 'genreRec') removePersistedByPrefix('genre-rec:');
});
