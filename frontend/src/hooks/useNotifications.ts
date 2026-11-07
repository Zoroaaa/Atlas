import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { notificationApi } from '@/services/api';
import { useAuthStore } from '@/stores';

export const notificationKeys = {
  unread: (userId?: string) => ['notifications', 'unread', userId] as const,
  inbox: (userId: string | undefined, page: number) => ['notifications', 'inbox', userId, page] as const,
};

/**
 * 未读数：页面打开 2.5 秒后才开始请求（首屏不占请求）。
 * useCacheSync 的校验请求会顺带写入未读数，二者重叠时只会发一次。
 */
export function useUnreadCount() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  return useQuery({
    queryKey: notificationKeys.unread(userId),
    queryFn: () => notificationApi.unreadCount(),
    enabled: isAuthenticated && !!userId && ready,
    staleTime: 2 * 60 * 1000,
  });
}

/** 收件箱：仅在面板打开时请求，服务端分页 */
export function useNotificationInbox(page: number, pageSize: number, enabled: boolean) {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: notificationKeys.inbox(userId, page),
    queryFn: () => notificationApi.list(page, pageSize),
    enabled: enabled && !!userId,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useMutation({
    mutationFn: (ids?: string[]) => notificationApi.markRead(ids),
    onSuccess: (unread) => {
      queryClient.setQueryData(notificationKeys.unread(userId), unread);
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'inbox'] });
    },
  });
}
