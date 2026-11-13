import { apiClient } from './client';
import type {
  FollowsData,
  FollowFeedData,
  FollowFeedSearchData,
  FollowFeedTab,
  FollowEntityType,
  NotificationInboxData,
  NotificationPreferencesData,
} from '@/types';

interface Envelope<T> {
  success: boolean;
  data: T;
}

export const followApi = {
  list: async (): Promise<FollowsData> => {
    const res = await apiClient.get<Envelope<FollowsData>>('/follows');
    return res.data;
  },

  follow: async (body: { name: string; key?: string; avatar?: string; entityType?: FollowEntityType }) => {
    const res = await apiClient.post<Envelope<{ key: string; name: string; alreadyFollowing?: boolean }>>('/follows', body);
    return res.data;
  },

  unfollow: async (key: string) => {
    await apiClient.delete(`/follows/${encodeURIComponent(key)}`);
  },

  setNotify: async (key: string, notifyInApp: boolean) => {
    await apiClient.patch(`/follows/${encodeURIComponent(key)}`, { notifyInApp });
  },

  feed: async (tab: FollowFeedTab, page: number, pageSize: number, entity?: string): Promise<FollowFeedData> => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const res = await apiClient.get<Envelope<FollowFeedData>>(
      `/follows/feed?tab=${tab}&page=${page}&pageSize=${pageSize}&today=${today}${entity ? `&entity=${encodeURIComponent(entity)}` : ''}`
    );
    return res.data;
  },

  /** 关键词集合搜索：跨全部关注对象聚合相关作品 */
  feedSearch: async (q: string, page: number, pageSize: number): Promise<FollowFeedSearchData> => {
    const res = await apiClient.get<Envelope<FollowFeedSearchData>>(
      `/follows/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`
    );
    return res.data;
  },

  markViewed: async () => {
    await apiClient.post('/follows/viewed', {});
  },
};

export const notificationApi = {
  list: async (page: number, pageSize: number, unreadOnly = false): Promise<NotificationInboxData> => {
    const res = await apiClient.get<Envelope<NotificationInboxData>>(
      `/notifications?page=${page}&pageSize=${pageSize}${unreadOnly ? '&unreadOnly=1' : ''}`
    );
    return res.data;
  },

  unreadCount: async (): Promise<number> => {
    const res = await apiClient.get<Envelope<{ unread: number }>>('/notifications/unread-count');
    return res.data.unread;
  },

  markRead: async (ids?: string[]): Promise<number> => {
    const res = await apiClient.post<Envelope<{ unread: number }>>('/notifications/read', ids ? { ids } : {});
    return res.data.unread;
  },

  remove: async (id: string): Promise<number> => {
    const res = await apiClient.delete<Envelope<{ unread: number }>>(`/notifications/${encodeURIComponent(id)}`);
    return res.data.unread;
  },

  clearRead: async (): Promise<number> => {
    const res = await apiClient.delete<Envelope<{ unread: number }>>('/notifications/read');
    return res.data.unread;
  },

  preferences: async (): Promise<NotificationPreferencesData> => {
    const res = await apiClient.get<Envelope<NotificationPreferencesData>>('/notifications/preferences');
    return res.data;
  },

  setPreference: async (type: string, patch: { inApp?: boolean; email?: boolean }): Promise<NotificationPreferencesData> => {
    const res = await apiClient.put<Envelope<NotificationPreferencesData>>('/notifications/preferences', { type, ...patch });
    return res.data;
  },

  setSettings: async (emailHideDetails: boolean): Promise<NotificationPreferencesData> => {
    const res = await apiClient.put<Envelope<NotificationPreferencesData>>('/notifications/settings', { emailHideDetails });
    return res.data;
  },

  sendTestEmail: async (): Promise<void> => {
    await apiClient.post('/notifications/email/test', {});
  },
};
