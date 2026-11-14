import { apiClient } from './client';
import { parseRequest } from '../validation';
import i18next from '@/i18n';
import type { FeedbackCreateRequest, FeedbackUpdateRequest } from '@codeseek/shared';

export type FeedbackSubmit = import('@codeseek/shared').FeedbackCreateRequest;

export interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  content: string;
  status: string;
  priority: string;
  admin_reply?: string;
  created_at: number;
  updated_at: number;
  username?: string;
  user_email?: string;
  contact_email?: string;
  email_sent?: number;
  admin_notes?: string;
  admin_username?: string;
  page_url?: string;
}

export interface FeedbackStats {
  total: number;
  pending: number;
  processing: number;
  resolved: number;
  closed: number;
  bugs: number;
  suggestions: number;
  urgent: number;
  high_priority: number;
}

export type AdminHandleFeedback = import('@codeseek/shared').FeedbackUpdateRequest;

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const feedbackApi = {
  /** 提交反馈（登录/未登录均可） */
  submit: async (data: FeedbackSubmit): Promise<{ id: string }> => {
    const { createFeedbackSchema } = await import('@codeseek/shared/schemas/feedback');
    const payload = await parseRequest<FeedbackCreateRequest>(createFeedbackSchema, data);
    const res = await apiClient.post<{ success: boolean; data: { id: string } }>(
      '/feedback',
      payload
    );
    if (!res.success) throw new Error(i18next.t('errors:api.feedback.submitFailed'));
    return res.data;
  },

  /** 获取当前用户的反馈列表 */
  getMy: async (page = 1, pageSize = 10): Promise<PaginatedResult<FeedbackItem>> => {
    const res = await apiClient.get<{ success: boolean; data: PaginatedResult<FeedbackItem> }>(
      `/feedback/my?page=${page}&pageSize=${pageSize}`
    );
    if (!res.success) throw new Error(i18next.t('errors:api.feedback.fetchFailed'));
    return res.data;
  },

  // ─── Admin ──────────────────────────────────────────────────────────────

  /** 管理员获取反馈列表 */
  adminList: async (params: {
    page?: number;
    pageSize?: number;
    status?: string;
    type?: string;
    priority?: string;
    search?: string;
  } = {}): Promise<PaginatedResult<FeedbackItem>> => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.pageSize) q.set('pageSize', String(params.pageSize));
    if (params.status) q.set('status', params.status);
    if (params.type) q.set('type', params.type);
    if (params.priority) q.set('priority', params.priority);
    if (params.search) q.set('search', params.search);
    const res = await apiClient.get<{ success: boolean; data: PaginatedResult<FeedbackItem> }>(
      `/feedback/admin/list?${q.toString()}`
    );
    if (!res.success) throw new Error(i18next.t('errors:api.feedback.fetchFailed'));
    return res.data;
  },

  /** 管理员获取反馈统计 */
  adminStats: async (): Promise<FeedbackStats> => {
    const res = await apiClient.get<{ success: boolean; data: FeedbackStats }>(
      '/feedback/admin/stats'
    );
    if (!res.success) throw new Error(i18next.t('errors:api.feedback.statsFailed'));
    return res.data;
  },

  /** 管理员获取反馈详情 */
  adminGet: async (id: string): Promise<FeedbackItem> => {
    const res = await apiClient.get<{ success: boolean; data: FeedbackItem }>(
      `/feedback/admin/${id}`
    );
    if (!res.success) throw new Error(i18next.t('errors:api.feedback.detailFailed'));
    return res.data;
  },

  /** 管理员处理反馈（可回复并发邮件） */
  adminHandle: async (
    id: string,
    data: AdminHandleFeedback
  ): Promise<{ emailSent: boolean; emailError?: string }> => {
    const { updateFeedbackSchema } = await import('@codeseek/shared/schemas/feedback');
    const payload = await parseRequest<FeedbackUpdateRequest>(updateFeedbackSchema, data);
    const res = await apiClient.put<{ success: boolean; data: { emailSent: boolean; emailError?: string } }>(
      `/feedback/admin/${id}`,
      payload
    );
    if (!res.success) throw new Error(i18next.t('errors:api.feedback.handleFailed'));
    return res.data;
  },
};
