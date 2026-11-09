import { QueryClient } from '@tanstack/react-query';
import { removePersistedByPrefix } from '@/utils/persistentCache';

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
