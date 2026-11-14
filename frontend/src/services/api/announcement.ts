import { apiClient } from './client';
import { parseRequest } from '../validation';
import type { AnnouncementCreateRequest, AnnouncementUpdateRequest } from '@codeseek/shared';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'error';
  is_pinned: number;
  is_active: number;
  start_time: number | null;
  end_time: number | null;
  admin_user_id: string | null;
  admin_username: string | null;
  created_at: number;
  updated_at: number;
}

export interface AnnouncementForm {
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'error';
  isPinned: boolean;
  isActive: boolean;
  startTime: number | null;
  endTime: number | null;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const announcementApi = {
  /** 公开：获取当前有效公告 */
  getActive: async (): Promise<Announcement[]> => {
    const response = await apiClient.get<{ success: boolean; data: Announcement[] }>('/announcements');
    return response.data;
  },

  /** 管理员：获取所有公告 */
  adminList: async (params: { page?: number; pageSize?: number } = {}): Promise<PaginatedResponse<Announcement>> => {
    const qp = new URLSearchParams();
    if (params.page) qp.set('page', String(params.page));
    if (params.pageSize) qp.set('pageSize', String(params.pageSize));
    const response = await apiClient.get<{ success: boolean; data: PaginatedResponse<Announcement> }>(`/announcements/admin/list?${qp}`);
    return response.data;
  },

  /** 管理员：发布公告 */
  create: async (data: AnnouncementCreateRequest): Promise<{ id: string }> => {
    const { createAnnouncementSchema } = await import('@codeseek/shared/schemas/announcement');
    const payload = await parseRequest<AnnouncementCreateRequest>(createAnnouncementSchema, data);
    const response = await apiClient.post<{ success: boolean; data: { id: string } }>('/announcements/admin', payload);
    return response.data;
  },

  /** 管理员：编辑公告 */
  update: async (id: string, data: AnnouncementUpdateRequest): Promise<void> => {
    const { updateAnnouncementSchema } = await import('@codeseek/shared/schemas/announcement');
    const payload = await parseRequest<AnnouncementUpdateRequest>(updateAnnouncementSchema, data);
    await apiClient.put(`/announcements/admin/${id}`, payload);
  },

  /** 管理员：删除公告 */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/announcements/admin/${id}`);
  },
};
