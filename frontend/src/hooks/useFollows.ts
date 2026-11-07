import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { followApi, ApiError } from '@/services/api';
import { useAuthStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';
import i18next from 'i18next';
import type { FollowFeedTab } from '@/types';

export const FOLLOW_FEED_PAGE_SIZE = 10;

export const followKeys = {
  all: ['follows'] as const,
  list: (userId?: string) => ['follows', 'list', userId] as const,
  feed: (userId: string | undefined, tab: FollowFeedTab, page: number) =>
    ['follows', 'feed', userId, tab, page] as const,
};

/** 我的关注列表（≤100 条，体积很小） */
export function useFollows() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: followKeys.list(userId),
    queryFn: () => followApi.list(),
    enabled: isAuthenticated && !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/** 关注动态：服务端分页；没有关注任何人时不请求 */
export function useFollowFeed(tab: FollowFeedTab, page: number, enabled: boolean) {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: followKeys.feed(userId, tab, page),
    queryFn: () => followApi.feed(tab, page, FOLLOW_FEED_PAGE_SIZE),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
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
    mutationFn: (vars: { name: string; key?: string; avatar?: string }) => followApi.follow(vars),
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
