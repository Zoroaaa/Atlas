import { useQuery, useMutation, useQueryClient, keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { userApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { readPersisted, writePersisted, removePersistedByPrefix } from '@/utils/persistentCache';
import type { FavoriteItem, FavoriteRef, AddFavoriteRequest } from '@/types';
import type { UpdateFavoriteStatusRequest } from '@codeseek/shared';

export const FAVORITES_PAGE_SIZE = 10;
// 跨设备修改无法感知，用 TTL 兜底；本设备的增删改会主动清缓存
const FAVORITES_CACHE_TTL = 24 * 60 * 60 * 1000;
const FAV_CACHE_PREFIX = 'fav:';

export const favoritesKeys = {
  all: ['favorites'] as const,
  index: (userId?: string) => ['favorites', 'index', userId] as const,
  page: (userId: string | undefined, pageSize: number, page: number, opts?: FavoritesPageOpts) =>
    ['favorites', 'page', userId, pageSize, page, opts?.q ?? '', opts?.sort ?? '', opts?.order ?? ''] as const,
};

export interface FavoritesPageOpts {
  q?: string;
  sort?: 'date' | 'title';
  order?: 'asc' | 'desc';
}

interface FavoritesPageData {
  favorites: FavoriteItem[];
  total: number;
}

/** 数据变化后：清本地持久缓存 + 让内存查询失效重取 */
export function invalidateFavorites(queryClient: QueryClient) {
  removePersistedByPrefix(FAV_CACHE_PREFIX);
  return queryClient.invalidateQueries({ queryKey: favoritesKeys.all });
}

/** 服务端分页；无搜索/排序参数时（主页面板）落本地持久缓存，带参数时（控制台）只走内存缓存 */
export function useFavoritesPage(page: number, pageSize = FAVORITES_PAGE_SIZE, opts: FavoritesPageOpts = {}) {
  const persist = !opts.q && !opts.sort && !opts.order;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const cacheKey = `${FAV_CACHE_PREFIX}page:${userId}:${pageSize}:${page}`;

  return useQuery({
    queryKey: favoritesKeys.page(userId, pageSize, page, opts),
    queryFn: async (): Promise<FavoritesPageData> => {
      const response = await userApi.getFavoritesPage(page, pageSize, opts);
      if (!response.success || !response.data) throw new Error('fetch favorites page failed');
      if (persist) writePersisted(cacheKey, response.data);
      return response.data;
    },
    enabled: isAuthenticated && !!userId,
    staleTime: persist ? FAVORITES_CACHE_TTL : 60 * 1000,
    placeholderData: keepPreviousData,
    initialData: persist ? () => readPersisted<FavoritesPageData>(cacheKey, FAVORITES_CACHE_TTL)?.data : undefined,
    initialDataUpdatedAt: persist ? () => readPersisted<FavoritesPageData>(cacheKey, FAVORITES_CACHE_TTL)?.cachedAt : undefined,
  });
}

/** 轻量索引（id/url/code）：搜索结果判断"已收藏"用，不含封面/标签等详情 */
export function useFavoriteIndex() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const cacheKey = `${FAV_CACHE_PREFIX}index:${userId}`;

  return useQuery({
    queryKey: favoritesKeys.index(userId),
    queryFn: async (): Promise<FavoriteRef[]> => {
      const response = await userApi.getFavoriteIndex();
      if (!response.success || !response.data) throw new Error('fetch favorites index failed');
      writePersisted(cacheKey, response.data.items);
      return response.data.items;
    },
    enabled: isAuthenticated && !!userId,
    staleTime: FAVORITES_CACHE_TTL,
    initialData: () => readPersisted<FavoriteRef[]>(cacheKey, FAVORITES_CACHE_TTL)?.data,
    initialDataUpdatedAt: () => readPersisted<FavoriteRef[]>(cacheKey, FAVORITES_CACHE_TTL)?.cachedAt,
  });
}

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
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (data: AddFavoriteRequest) => userApi.addFavorite(data),
    onMutate: async (data) => {
      removePersistedByPrefix(FAV_CACHE_PREFIX);
      await queryClient.cancelQueries({ queryKey: favoritesKeys.all });
      const previousFavorites = queryClient.getQueryData<FavoriteItem[]>(favoritesKeys.all);
      const previousIndex = queryClient.getQueryData<FavoriteRef[]>(favoritesKeys.index(userId));

      // 索引乐观更新：搜索结果里的收藏星标立即生效
      if (previousIndex) {
        queryClient.setQueryData<FavoriteRef[]>(favoritesKeys.index(userId), [
          { id: 'optimistic-' + Date.now(), url: data.url, code: data.code ?? undefined },
          ...previousIndex,
        ]);
      }

      // 乐观更新：立即将新收藏添加到缓存
      if (previousFavorites) {
        const optimisticItem: FavoriteItem = {
          id: 'optimistic-' + Date.now(),
          userId: '',
          title: data.title,
          subtitle: data.subtitle ?? undefined,
          url: data.url,
          icon: data.icon ?? undefined,
          keyword: data.keyword,
          code: data.code ?? undefined,
          cover: data.cover ?? undefined,
          actors: data.actors ?? undefined,
          duration: data.duration ?? undefined,
          tags: data.tags ?? undefined,
          releaseDate: data.releaseDate ?? undefined,
          publisher: data.publisher ?? undefined,
          magnetLink: data.magnetLink ?? undefined,
          status: data.status,
          createdAt: Date.now(),
        };
        queryClient.setQueryData<FavoriteItem[]>(favoritesKeys.all, [optimisticItem, ...previousFavorites]);
      }

      return { previousFavorites, previousIndex };
    },
    onError: (_err, _data, context) => {
      // 回滚到之前的状态
      if (context?.previousFavorites) {
        queryClient.setQueryData<FavoriteItem[]>(favoritesKeys.all, context.previousFavorites);
      }
      if (context?.previousIndex) {
        queryClient.setQueryData<FavoriteRef[]>(favoritesKeys.index(userId), context.previousIndex);
      }
    },
    onSuccess: () => {
      // 成功后重新获取最新数据
      invalidateFavorites(queryClient);
    },
  });
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (id: string) => userApi.removeFavorite(id),
    onMutate: async (id) => {
      removePersistedByPrefix(FAV_CACHE_PREFIX);
      await queryClient.cancelQueries({ queryKey: favoritesKeys.all });
      const previousFavorites = queryClient.getQueryData<FavoriteItem[]>(favoritesKeys.all);
      const previousIndex = queryClient.getQueryData<FavoriteRef[]>(favoritesKeys.index(userId));

      if (previousIndex) {
        queryClient.setQueryData<FavoriteRef[]>(
          favoritesKeys.index(userId),
          previousIndex.filter(f => f.id !== id)
        );
      }

      // 乐观更新：立即从缓存中移除
      if (previousFavorites) {
        queryClient.setQueryData<FavoriteItem[]>(
          favoritesKeys.all,
          previousFavorites.filter(f => f.id !== id)
        );
      }

      return { previousFavorites, previousIndex };
    },
    onError: (_err, _id, context) => {
      // 回滚到之前的状态
      if (context?.previousFavorites) {
        queryClient.setQueryData<FavoriteItem[]>(favoritesKeys.all, context.previousFavorites);
      }
      if (context?.previousIndex) {
        queryClient.setQueryData<FavoriteRef[]>(favoritesKeys.index(userId), context.previousIndex);
      }
    },
    onSuccess: () => {
      invalidateFavorites(queryClient);
    },
  });
}

export function useUpdateFavoriteStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateFavoriteStatusRequest['status'] }) =>
      userApi.updateFavoriteStatus(id, status),
    onSuccess: () => {
      invalidateFavorites(queryClient);
    },
  });
}
