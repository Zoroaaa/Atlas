/**
 * 搜索与用户数据 API：搜索入口先经 zod 校验，收藏/历史列表在此做字段归一化。
 *
 * 约束：收藏与历史含用户上下文，缓存键必须按用户隔离。
 */

import { apiClient } from './client';
import { parseRequest } from '../validation';
import { camelizeKeys } from '@/utils';
import type {
  SearchHistoryItem,
  FavoriteItem,
  FavoriteRef,
  SearchHistoryStats,
  AddFavoriteRequest,
  SearchRequest,
} from '@/types';
import type {
  UpdateSearchHistoryRequest,
  BatchDeleteSearchHistoryRequest,
  UpdateFavoriteStatusRequest,
  UpdateSettingsRequest,
  UpdateProfileRequest,
} from '@codeseek/shared';
import type {
  SearchEndpointResponse,
  SearchSuggestionsResponse,
  SearchQuotaResponse,
  FavoritesResponse,
  ApiResponse,
  SearchHistoryResponse,
  SearchStatsResponse,
} from './types';

/** 搜索相关接口：/search 请求体经 shared schema 校验后再提交。 */
export const searchApi = {
  search: async (data: SearchRequest): Promise<SearchEndpointResponse> => {
    const { searchSchema } = await import('@codeseek/shared/schemas/search');
    const payload = await parseRequest<SearchRequest>(searchSchema, data);
    return apiClient.post<SearchEndpointResponse>('/search', payload);
  },

  getSuggestions: async (keyword: string, limit = 10, signal?: AbortSignal, source?: string): Promise<SearchSuggestionsResponse> => {
    const params = new URLSearchParams({ keyword, limit: String(limit) });
    if (source) params.set('source', source);
    return apiClient.get(`/search/suggestions?${params.toString()}`, signal);
  },

  getQuota: async (): Promise<SearchQuotaResponse> => {
    return apiClient.get('/search/quota');
  },
};

/** 用户中心接口：设置、收藏、搜索历史、行为日志；列表返回值统一补齐可选字段。 */
export const userApi = {
  /** 更新用户名：只写 users.username，不复用 settings 表单，避免"看似保存实则无效" */
  updateProfile: async (username: string): Promise<{
    success: boolean;
    data: { username: string };
    message: string;
  }> => {
    const { updateProfileSchema } = await import('@codeseek/shared/schemas/user');
    const payload = await parseRequest<UpdateProfileRequest>(updateProfileSchema, { username });
    return apiClient.put('/user/profile', payload);
  },

  updateSettings: async (settings: Record<string, unknown>): Promise<{ 
    success: boolean; 
    data: { settings: Record<string, unknown> }; 
    message: string 
  }> => {
    const { updateSettingsSchema } = await import('@codeseek/shared/schemas/user');
    const payload = await parseRequest<UpdateSettingsRequest>(updateSettingsSchema, { settings });
    return apiClient.put('/user/settings', payload);
  },

  getFavoritesPage: async (
    page: number,
    pageSize: number,
    opts: { q?: string; sort?: 'date' | 'title'; order?: 'asc' | 'desc' } = {}
  ): Promise<ApiResponse<{ favorites: FavoriteItem[]; total: number }>> => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (opts.q) params.set('q', opts.q);
    if (opts.sort) params.set('sort', opts.sort);
    if (opts.order) params.set('order', opts.order);
    const response = await apiClient.get<{ success: boolean; data: { favorites: Array<Record<string, unknown>>; total: number } }>(
      `/user/favorites?${params.toString()}`
    );
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          // 行数据是 snake_case，先 camelize 再统一把空串归一化为 undefined
          favorites: camelizeKeys<FavoriteItem[]>(response.data.favorites).map(f => ({
            ...f,
            subtitle: f.subtitle || undefined,
            icon: f.icon || undefined,
            keyword: f.keyword || undefined,
            code: f.code || undefined,
            cover: f.cover || undefined,
            actors: f.actors || undefined,
            duration: f.duration || undefined,
            tags: f.tags || undefined,
            releaseDate: f.releaseDate || undefined,
            publisher: f.publisher || undefined,
            magnetLink: f.magnetLink || undefined,
            status: f.status || undefined,
          })),
          total: response.data.total,
        },
      };
    }
    return { success: false };
  },

  getSyncState: async (): Promise<ApiResponse<{
    notifications?: { unread: number };
    favorites: { count: number; updatedAt: number };
    history: { count: number; updatedAt: number };
  }>> => {
    const response = await apiClient.get<{ success: boolean; data: {
      notifications?: { unread: number };
      favorites: { count: number; updatedAt: number };
      history: { count: number; updatedAt: number };
    } }>('/user/sync-state');
    if (response.success && response.data) return { success: true, data: response.data };
    return { success: false };
  },

  getFavoriteIndex: async (): Promise<ApiResponse<{ items: FavoriteRef[] }>> => {
    const response = await apiClient.get<{ success: boolean; data: { items: Array<{ id: string; url: string; code: string | null }> } }>(
      '/user/favorites/index'
    );
    if (response.success && response.data) {
      return {
        success: true,
        data: { items: response.data.items.map(i => ({ id: i.id, url: i.url, code: i.code || undefined })) },
      };
    }
    return { success: false };
  },

  getFavorites: async (): Promise<FavoritesResponse> => {
    const response = await apiClient.get<{ success: boolean; data: { favorites: Array<{
      id: string;
      userId: string;
      title: string;
      subtitle: string | null;
      url: string;
      icon: string | null;
      keyword: string | null;
      code: string | null;
      cover: string | null;
      actors: string | null;
      duration: string | null;
      tags: string | null;
      releaseDate: string | null;
      publisher: string | null;
      magnetLink: string | null;
      status: string | null;
      createdAt: number;
    }> } }>('/user/favorites');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          favorites: response.data.favorites.map(f => ({
            id: f.id,
            userId: f.userId,
            title: f.title,
            subtitle: f.subtitle || undefined,
            url: f.url,
            icon: f.icon || undefined,
            keyword: f.keyword || undefined,
            code: f.code || undefined,
            cover: f.cover || undefined,
            actors: f.actors || undefined,
            duration: f.duration || undefined,
            tags: f.tags || undefined,
            releaseDate: f.releaseDate || undefined,
            publisher: f.publisher || undefined,
            magnetLink: f.magnetLink || undefined,
            status: f.status || undefined,
            createdAt: f.createdAt,
          }))
        }
      };
    }
    return { success: false };
  },

  addFavorite: async (data: AddFavoriteRequest): Promise<{ 
    success: boolean; 
    data: FavoriteItem; 
    message: string 
  }> => {
    const { addFavoriteSchema } = await import('@codeseek/shared/schemas/user');
    const payload = await parseRequest<AddFavoriteRequest>(addFavoriteSchema, data);
    return apiClient.post('/user/favorites', payload);
  },

  removeFavorite: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/user/favorites/${id}`);
  },

  updateFavoriteStatus: async (id: string, status: UpdateFavoriteStatusRequest['status']): Promise<{ 
    success: boolean; 
    data: { id: string; status: string }; 
    message: string 
  }> => {
    const { updateFavoriteStatusSchema } = await import('@codeseek/shared/schemas/user');
    const payload = await parseRequest<UpdateFavoriteStatusRequest>(updateFavoriteStatusSchema, { status });
    return apiClient.patch(`/user/favorites/${id}/status`, payload);
  },

  getSearchHistory: async (limit = 50): Promise<SearchHistoryResponse> => {
    const response = await apiClient.get<{ success: boolean; data: { history: Array<Record<string, unknown>> } }>(`/user/search-history?limit=${limit}`);

    if (response.success && response.data) {
      return {
        success: true,
        data: { history: camelizeKeys<SearchHistoryItem[]>(response.data.history) }
      };
    }
    return { success: false };
  },

  getSearchHistoryPage: async (
    page: number,
    pageSize: number,
    opts: { q?: string; since?: number } = {}
  ): Promise<ApiResponse<{ history: SearchHistoryItem[]; total: number }>> => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (opts.q) params.set('q', opts.q);
    if (opts.since) params.set('since', String(opts.since));
    const response = await apiClient.get<{ success: boolean; data: { history: Array<Record<string, unknown>>; total: number } }>(
      `/user/search-history?${params.toString()}`
    );
    if (response.success && response.data) {
      return {
        success: true,
        data: { history: camelizeKeys<SearchHistoryItem[]>(response.data.history), total: response.data.total },
      };
    }
    return { success: false };
  },

  getSearchHistoryStats: async (): Promise<ApiResponse<SearchHistoryStats>> => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    // 后端用 todayStart + 时区偏移换算记录日期，避免 UTC 日期与本地"今天"错位
    const tzOffset = -now.getTimezoneOffset();
    const response = await apiClient.get<{ success: boolean; data: SearchHistoryStats }>(
      `/user/search-history/stats?todayStart=${todayStart}&tzOffset=${tzOffset}`
    );
    if (response.success && response.data) return { success: true, data: response.data };
    return { success: false };
  },

  clearSearchHistory: async (): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete('/user/search-history');
  },

  deleteSearchHistoryItem: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/user/search-history/${id}`);
  },

  batchDeleteSearchHistory: async (ids: string[]): Promise<{ success: boolean; data: { deletedCount: number }; message: string }> => {
    const { batchDeleteSearchHistorySchema } = await import('@codeseek/shared/schemas/user');
    const payload = await parseRequest<BatchDeleteSearchHistoryRequest>(batchDeleteSearchHistorySchema, { ids });
    return apiClient.post('/user/search-history/batch-delete', payload);
  },

  updateSearchHistory: async (id: string, data: UpdateSearchHistoryRequest): Promise<{ success: boolean; message: string }> => {
    const { updateSearchHistorySchema } = await import('@codeseek/shared/schemas/user');
    const payload = await parseRequest<UpdateSearchHistoryRequest>(updateSearchHistorySchema, data);
    return apiClient.put(`/user/search-history/${id}`, payload);
  },

  getSearchStats: async (): Promise<SearchStatsResponse> => {
    const response = await apiClient.get<{
      success: boolean;
      data: {
        totalSearches: number;
        topSources: Array<{ source: string; count: number }>;
        recentSearches: Array<{ query: string; created_at: number }>;
        searchGrowthPercent: number;
        thisWeekSearches: number;
        lastWeekSearches: number;
      };
    }>('/user/search-stats');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          totalSearches: response.data.totalSearches || 0,
          topSources: response.data.topSources || [],
          recentSearches: (response.data.recentSearches || []).map(r => ({
            query: r.query,
            createdAt: r.created_at,
          })),
          searchGrowthPercent: response.data.searchGrowthPercent || 0,
          thisWeekSearches: response.data.thisWeekSearches || 0,
          lastWeekSearches: response.data.lastWeekSearches || 0,
        }
      };
    }
    return { success: false };
  },

  // 源配置更新统一走 sourceApi.updateUserSourceConfig（带 shared zod 校验），此处不保留重复实现

  getActivities: async (params: {
    limit?: number;
    offset?: number;
    action?: string;
  } = {}): Promise<{
    success: boolean;
    data: {
      activities: Array<{
        id: string;
        action: string;
        data: Record<string, unknown>;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: number;
      }>;
      total: number;
      limit: number;
      offset: number;
    };
  }> => {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.offset) queryParams.set('offset', params.offset.toString());
    if (params.action) queryParams.set('action', params.action);
    return apiClient.get(`/user/activities?${queryParams.toString()}`);
  },

  getActivitiesStats: async (): Promise<{
    success: boolean;
    data: {
      total: number;
      today: number;
      week: number;
      month: number;
      actionsByType: Array<{ action: string; count: number }>;
      summary: {
        logins: number;
        thisWeekLogins: number;
        lastWeekLogins: number;
        failedLogins: number;
        searches: number;
        favorites: number;
      };
    };
  }> => {
    return apiClient.get('/user/activities/stats');
  },
};
