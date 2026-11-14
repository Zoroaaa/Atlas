import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { followApi, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores';
import { useToast } from '@/hooks/useNotification';
import { readPersisted, writePersisted } from '@/utils/persistentCache';
import i18next from 'i18next';
import type { FollowEntityType, FollowFeedTab, FollowsData, FollowFeedData } from '@/types';

export const FOLLOW_FEED_PAGE_SIZE = 10;

// 后端关注检查每 30 分钟跑一轮，这之内直接读缓存；24 小时用于离线兜底
const FOLLOW_STALE_TIME = 30 * 60 * 1000;
const FOLLOW_CACHE_TTL = 24 * 60 * 60 * 1000;
const FOLLOW_CACHE_PREFIX = 'follow:';

/** 下一次刷新安排在缓存满 30 分钟时，而不是从挂载时刻重新计时 */
function followRefreshInterval(query: { state: { dataUpdatedAt: number } }): number {
  const updatedAt = query.state.dataUpdatedAt;
  if (!updatedAt) return FOLLOW_STALE_TIME;
  return Math.max(60 * 1000, FOLLOW_STALE_TIME - (Date.now() - updatedAt));
}

export const followKeys = {
  all: ['follows'] as const,
  list: (userId?: string) => ['follows', 'list', userId] as const,
  feed: (userId: string | undefined, tab: FollowFeedTab, page: number, pageSize: number, entity: string) =>
    ['follows', 'feed', userId, tab, page, pageSize, entity] as const,
  search: (userId: string | undefined, q: string, page: number, pageSize: number) =>
    ['follows', 'search', userId, q, page, pageSize] as const,
};

/** 我的关注列表（≤100 条，体积很小） */
export function useFollows() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const cacheKey = `${FOLLOW_CACHE_PREFIX}list:${userId}`;

  return useQuery({
    queryKey: followKeys.list(userId),
    queryFn: async (): Promise<FollowsData> => {
      const data = await followApi.list();
      writePersisted(cacheKey, data);
      return data;
    },
    enabled: isAuthenticated && !!userId,
    staleTime: FOLLOW_STALE_TIME,
    refetchInterval: followRefreshInterval,
    initialData: userId ? () => readPersisted<FollowsData>(cacheKey, FOLLOW_CACHE_TTL)?.data : undefined,
    initialDataUpdatedAt: userId
      ? () => readPersisted<FollowsData>(cacheKey, FOLLOW_CACHE_TTL)?.cachedAt
      : undefined,
  });
}

/** 关注动态：服务端分页；没有关注任何人时不请求 */
export function useFollowFeed(
  tab: FollowFeedTab,
  page: number,
  enabled: boolean,
  opts: { entity?: string; pageSize?: number } = {}
) {
  const userId = useAuthStore((s) => s.user?.id);
  const pageSize = opts.pageSize ?? FOLLOW_FEED_PAGE_SIZE;
  const entity = opts.entity ?? '';
  // 只缓存默认视图（无关注对象筛选），筛选组合不落本地避免缓存膨胀
  const persist = !entity;
  const cacheKey = `${FOLLOW_CACHE_PREFIX}feed:${userId}:${tab}:${pageSize}:${page}:${entity || 'all'}`;

  return useQuery({
    queryKey: followKeys.feed(userId, tab, page, pageSize, entity),
    queryFn: async (): Promise<FollowFeedData> => {
      const data = await followApi.feed(tab, page, pageSize, entity || undefined);
      if (persist) writePersisted(cacheKey, data);
      return data;
    },
    enabled: enabled && !!userId,
    staleTime: persist ? FOLLOW_STALE_TIME : 5 * 60 * 1000,
    refetchInterval: persist ? followRefreshInterval : false,
    placeholderData: keepPreviousData,
    initialData: persist && userId
      ? () => readPersisted<FollowFeedData>(cacheKey, FOLLOW_CACHE_TTL)?.data
      : undefined,
    initialDataUpdatedAt: persist && userId
      ? () => readPersisted<FollowFeedData>(cacheKey, FOLLOW_CACHE_TTL)?.cachedAt
      : undefined,
  });
}

/** 关键词集合搜索：q 为空时不请求 */
export function useFollowFeedSearch(q: string, page: number, enabled: boolean) {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: followKeys.search(userId, q, page, FOLLOW_FEED_PAGE_SIZE),
    queryFn: () => followApi.feedSearch(q, page, FOLLOW_FEED_PAGE_SIZE),
    enabled: enabled && !!userId && q.trim().length > 0,
    staleTime: FOLLOW_STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

function errorCode(err: unknown): string | undefined {
  if (err instanceof ApiError) {
    const data = err.data as { error?: { code?: string } } | undefined;
    return data?.error?.code;
  }
  return undefined;
}

export function useFollowActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: followKeys.all });

  const follow = useMutation({
    mutationFn: (vars: { name: string; key?: string; avatar?: string; entityType?: FollowEntityType }) => followApi.follow(vars),
    onSuccess: (data) => {
      if (!data.alreadyFollowing) toast.success(i18next.t('follow:followSuccess', { name: data.name }));
      void refresh();
    },
    onError: (err) => {
      const code = errorCode(err);
      const message =
        code === 'FOLLOW_LIMIT' ? i18next.t('follow:followLimit')
        : code === 'NOT_FOUND' ? i18next.t('follow:notFound')
        : code === 'UPSTREAM_ERROR' ? i18next.t('follow:upstreamError')
        : i18next.t('follow:followFailed');
      toast.error(i18next.t('follow:followFailed'), message);
    },
  });

  const unfollow = useMutation({
    mutationFn: (key: string) => followApi.unfollow(key),
    onSuccess: () => {
      toast.success(i18next.t('follow:unfollowSuccess'));
      void refresh();
    },
    onError: () => toast.error(i18next.t('follow:operationFailed')),
  });

  const setNotify = useMutation({
    mutationFn: (vars: { key: string; notifyInApp: boolean }) => followApi.setNotify(vars.key, vars.notifyInApp),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['follows', 'list'] }); },
    onError: () => toast.error(i18next.t('follow:operationFailed')),
  });

  const markViewed = useMutation({
    mutationFn: () => followApi.markViewed(),
    onSuccess: () => { void refresh(); },
  });

  return { follow, unfollow, setNotify, markViewed };
}
