import { apiClient } from './client';
import type {
  FollowsData,
  FollowFeedData,
  FollowFeedTab,
  NotificationInboxData,
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

  follow: async (body: { name: string; key?: string; avatar?: string }) => {
    const res = await apiClient.post<Envelope<{ key: string; name: string; alreadyFollowing?: boolean }>>('/follows', body);
    return res.data;
  },

  unfollow: async (key: string) => {
    await apiClient.delete(`/follows/${encodeURIComponent(key)}`);
  },

  setNotify: async (key: string, notifyInApp: boolean) => {
    await apiClient.patch(`/follows/${encodeURIComponent(key)}`, { notifyInApp });
  },

  feed: async (tab: FollowFeedTab, page: number, pageSize: number): Promise<FollowFeedData> => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const res = await apiClient.get<Envelope<FollowFeedData>>(
      `/follows/feed?tab=${tab}&page=${page}&pageSize=${pageSize}&today=${today}`
    );
    return res.data;
  },

  markViewed: async () => {
    await apiClient.post('/follows/viewed', {});
  },
};

export const notificationApi = {
  list: async (page: number, pageSize: number): Promise<NotificationInboxData> => {
    const res = await apiClient.get<Envelope<NotificationInboxData>>(`/notifications?page=${page}&pageSize=${pageSize}`);
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
};
