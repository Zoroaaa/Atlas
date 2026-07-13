import { apiClient } from './client';
import { camelizeKeys } from '@/utils';
import type {
  SearchHistoryItem,
  FavoriteItem,
  AddFavoriteRequest,
  SaveSearchHistoryRequest,
} from '@/types';
import type {
  SearchEndpointResponse,
  SearchSuggestionsResponse,
  SearchTrendingResponse,
  FavoritesResponse,
  SearchHistoryResponse,
  SearchStatsResponse,
} from './types';

export const searchApi = {
  search: async (data: {
    keyword: string;
    sourceIds?: string[];
    categoryId?: string;
    majorCategoryId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SearchEndpointResponse> => {
    return apiClient.post<SearchEndpointResponse>('/search', data);
  },

  getSuggestions: async (keyword: string, limit = 10, signal?: AbortSignal): Promise<SearchSuggestionsResponse> => {
    return apiClient.get(`/search/suggestions?keyword=${encodeURIComponent(keyword)}&limit=${limit}`, signal);
  },

  getTrending: async (limit = 20, hours = 24): Promise<SearchTrendingResponse> => {
    return apiClient.get(`/search/trending?limit=${limit}&hours=${hours}`);
  },
};

export const userApi = {
  getSettings: async (): Promise<{ 
    success: boolean; 
    data: { settings: Record<string, unknown> } 
  }> => {
    return apiClient.get('/user/settings');
  },

  updateSettings: async (settings: Record<string, unknown>): Promise<{ 
    success: boolean; 
    data: { settings: Record<string, unknown> }; 
    message: string 
  }> => {
    return apiClient.put('/user/settings', { settings });
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
    return apiClient.post('/user/favorites', data);
  },

  removeFavorite: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/user/favorites/${id}`);
  },

  updateFavoriteStatus: async (id: string, status: string): Promise<{ 
    success: boolean; 
    data: { id: string; status: string }; 
    message: string 
  }> => {
    return apiClient.patch(`/user/favorites/${id}/status`, { status });
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

  saveSearchHistory: async (data: SaveSearchHistoryRequest): Promise<{ 
    success: boolean; 
    data: SearchHistoryItem; 
    message: string 
  }> => {
    return apiClient.post('/user/search-history', data);
  },

  clearSearchHistory: async (): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete('/user/search-history');
  },

  deleteSearchHistoryItem: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/user/search-history/${id}`);
  },

  updateSearchHistory: async (id: string, data: {
    title?: string;
    subtitle?: string;
    code?: string;
    actors?: string;
    duration?: string;
    tags?: string;
    releaseDate?: string;
    publisher?: string;
    keyword?: string;
  }): Promise<{ success: boolean; message: string }> => {
    return apiClient.put(`/user/search-history/${id}`, data);
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

  updateSourceConfig: async (sourceId: string, config: {
    isEnabled?: boolean;
    customPriority?: number;
    customName?: string;
    customSubtitle?: string;
    customIcon?: string;
    notes?: string;
  }): Promise<{ success: boolean; message: string }> => {
    return apiClient.put(`/user/source-configs/${sourceId}`, config);
  },

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
        actionLabel: string;
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
