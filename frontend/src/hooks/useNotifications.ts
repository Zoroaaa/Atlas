import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { notificationApi, authApi, ApiError } from '@/services/api';
import { useToast } from '@/hooks/useNotification';
import i18next from 'i18next';
import { useAuthStore } from '@/stores';

export const notificationKeys = {
  unread: (userId?: string) => ['notifications', 'unread', userId] as const,
  inbox: (userId: string | undefined, page: number, pageSize: number, unreadOnly: boolean) =>
    ['notifications', 'inbox', userId, page, pageSize, unreadOnly] as const,
  prefs: (userId?: string) => ['notifications', 'prefs', userId] as const,
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
export function useNotificationInbox(page: number, pageSize: number, enabled: boolean, unreadOnly = false) {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: notificationKeys.inbox(userId, page, pageSize, unreadOnly),
    queryFn: () => notificationApi.list(page, pageSize, unreadOnly),
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

/** 删除一条 / 清除已读：更新未读数并刷新收件箱 */
export function useRemoveNotifications() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const toast = useToast();
  const onSuccess = (unread: number) => {
    queryClient.setQueryData(notificationKeys.unread(userId), unread);
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'inbox'] });
  };
  const onError = () => toast.error(i18next.t('notify:page.operationFailed'));

  return {
    remove: useMutation({ mutationFn: (id: string) => notificationApi.remove(id), onSuccess, onError }),
    clearRead: useMutation({ mutationFn: () => notificationApi.clearRead(), onSuccess, onError }),
  };
}

function errorCode(err: unknown): string | undefined {
  if (err instanceof ApiError) {
    return err.code || (err.data as { error?: { code?: string } } | undefined)?.error?.code;
  }
  return undefined;
}

/** 通知偏好（站内/邮件开关、邮箱状态、隐私设置） */
export function useNotificationPreferences() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: notificationKeys.prefs(userId),
    queryFn: () => notificationApi.preferences(),
    enabled: isAuthenticated && !!userId,
    staleTime: 60 * 1000,
  });
}

export function useNotificationPreferenceActions() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const toast = useToast();
  const save = (data: Awaited<ReturnType<typeof notificationApi.preferences>>) => {
    queryClient.setQueryData(notificationKeys.prefs(userId), data);
  };

  const setPreference = useMutation({
    mutationFn: (vars: { type: string; inApp?: boolean; email?: boolean }) =>
      notificationApi.setPreference(vars.type, { inApp: vars.inApp, email: vars.email }),
    onSuccess: save,
    onError: (err) => {
      toast.error(
        errorCode(err) === 'EMAIL_NOT_VERIFIED'
          ? i18next.t('notify:prefs.verifyHint')
          : i18next.t('notify:prefs.saveFailed')
      );
    },
  });

  const setSettings = useMutation({
    mutationFn: (emailHideDetails: boolean) => notificationApi.setSettings(emailHideDetails),
    onSuccess: save,
    onError: () => toast.error(i18next.t('notify:prefs.saveFailed')),
  });

  const sendTestEmail = useMutation({
    mutationFn: () => notificationApi.sendTestEmail(),
    onSuccess: () => toast.success(i18next.t('notify:prefs.testSent')),
    onError: (err) => {
      const code = errorCode(err);
      toast.error(
        code === 'RATE_LIMITED' ? i18next.t('notify:prefs.testRateLimited')
        : code === 'EMAIL_NOT_VERIFIED' ? i18next.t('notify:prefs.verifyHint')
        : i18next.t('notify:prefs.testFailed')
      );
    },
  });

  const sendVerifyCode = useMutation({
    mutationFn: () => authApi.sendCurrentEmailCode(),
    onError: (err) => {
      const code = errorCode(err);
      toast.error(
        code === 'RATE_LIMIT' ? i18next.t('notify:prefs.verifyRateLimited')
        : code === 'EMAIL_ALREADY_VERIFIED' ? i18next.t('notify:prefs.verifyAlready')
        : i18next.t('notify:prefs.verifySendFailed')
      );
    },
  });

  const verifyEmail = useMutation({
    mutationFn: (code: string) => authApi.verifyCurrentEmail(code),
    onSuccess: () => {
      toast.success(i18next.t('notify:prefs.verifySuccess'));
      void queryClient.invalidateQueries({ queryKey: notificationKeys.prefs(userId) });
    },
    onError: (err) => {
      toast.error(
        errorCode(err) === 'VALIDATION_ERROR'
          ? i18next.t('notify:prefs.verifyCodeInvalid')
          : i18next.t('notify:prefs.verifyFailed')
      );
    },
  });

  return { setPreference, setSettings, sendTestEmail, sendVerifyCode, verifyEmail };
}
