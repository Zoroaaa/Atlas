import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import type { FavoriteItem, AddFavoriteRequest } from '@/types';

export const favoritesKeys = {
  all: ['favorites'] as const,
};

export function useFavorites() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: favoritesKeys.all,
    queryFn: async () => {
      const response = await userApi.getFavorites();
      if (response.success && response.data) {
        return response.data.favorites;
      }
      return [] as FavoriteItem[];
    },
    enabled: isAuthenticated,
  });
}

export function useAddFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddFavoriteRequest) => userApi.addFavorite(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: favoritesKeys.all });
      const previousFavorites = queryClient.getQueryData<FavoriteItem[]>(favoritesKeys.all);

      // 乐观更新：立即将新收藏添加到缓存
      if (previousFavorites) {
        const optimisticItem: FavoriteItem = {
          id: 'optimistic-' + Date.now(),
          userId: '',
          title: data.title,
          subtitle: data.subtitle,
          url: data.url,
          icon: data.icon,
          keyword: data.keyword,
          code: data.code,
          cover: data.cover,
          actors: data.actors,
          duration: data.duration,
          tags: data.tags,
          releaseDate: data.releaseDate,
          publisher: data.publisher,
          magnetLink: data.magnetLink,
          status: data.status,
          createdAt: Date.now(),
        };
        queryClient.setQueryData<FavoriteItem[]>(favoritesKeys.all, [optimisticItem, ...previousFavorites]);
      }

      return { previousFavorites };
    },
    onError: (_err, _data, context) => {
      // 回滚到之前的状态
      if (context?.previousFavorites) {
        queryClient.setQueryData<FavoriteItem[]>(favoritesKeys.all, context.previousFavorites);
      }
    },
    onSuccess: () => {
      // 成功后重新获取最新数据
      queryClient.invalidateQueries({ queryKey: favoritesKeys.all });
    },
  });
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => userApi.removeFavorite(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: favoritesKeys.all });
      const previousFavorites = queryClient.getQueryData<FavoriteItem[]>(favoritesKeys.all);

      // 乐观更新：立即从缓存中移除
      if (previousFavorites) {
        queryClient.setQueryData<FavoriteItem[]>(
          favoritesKeys.all,
          previousFavorites.filter(f => f.id !== id)
        );
      }

      return { previousFavorites };
    },
    onError: (_err, _id, context) => {
      // 回滚到之前的状态
      if (context?.previousFavorites) {
        queryClient.setQueryData<FavoriteItem[]>(favoritesKeys.all, context.previousFavorites);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: favoritesKeys.all });
    },
  });
}
