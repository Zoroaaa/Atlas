import { apiClient } from './client';
import type {
  SearchHistoryItem,
  FavoriteItem,
  SearchSuggestion,
  TrendingSearch,
  SearchRequest,
  SearchResponse,
  AddFavoriteRequest,
  SaveSearchHistoryRequest,
} from '@/types';

export const searchApi = {
  search: async (data: SearchRequest): Promise<SearchResponse> => {
    return apiClient.post<SearchResponse>('/search', data);
  },

  getSuggestions: async (keyword: string, limit = 10): Promise<{ 
    success: boolean; 
    data: SearchSuggestion[] 
  }> => {
    return apiClient.get(`/search/suggestions?keyword=${encodeURIComponent(keyword)}&limit=${limit}`);
  },

  getTrending: async (limit = 20, hours = 24): Promise<{ 
    success: boolean; 
    data: TrendingSearch[] 
  }> => {
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

  getFavorites: async (): Promise<{ 
    success: boolean; 
    data: { favorites: FavoriteItem[] } 
  }> => {
    const response = await apiClient.get<{ success: boolean; data: { favorites: Array<{
      id: string;
      user_id: string;
      title: string;
      subtitle: string | null;
      url: string;
      icon: string | null;
      keyword: string | null;
      created_at: number;
      updated_at: number;
    }> } }>('/user/favorites');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          favorites: response.data.favorites.map(f => ({
            id: f.id,
            userId: f.user_id,
            title: f.title,
            subtitle: f.subtitle || undefined,
            url: f.url,
            icon: f.icon || undefined,
            keyword: f.keyword || undefined,
            createdAt: f.created_at,
          }))
        }
      };
    }
    return { success: false, data: { favorites: [] } };
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

  getSearchHistory: async (limit = 50): Promise<{ 
    success: boolean; 
    data: { history: SearchHistoryItem[] } 
  }> => {
    const response = await apiClient.get<{ success: boolean; data: { history: Array<{
      id: string;
      user_id: string;
      query: string;
      source: string;
      results_count: number;
      created_at: number;
    }> } }>(`/user/search-history?limit=${limit}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          history: response.data.history.map(h => ({
            id: h.id,
            userId: h.user_id,
            query: h.query,
            source: h.source,
            resultsCount: h.results_count,
            createdAt: h.created_at,
          }))
        }
      };
    }
    return { success: false, data: { history: [] } };
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

  getSearchStats: async (): Promise<{ 
    success: boolean; 
    data: {
      totalSearches: number;
      topSources: Array<{ source: string; count: number }>;
      recentSearches: Array<{ query: string; createdAt: number }>;
      searchGrowthPercent: number;
      thisWeekSearches: number;
      lastWeekSearches: number;
    } 
  }> => {
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
    return { 
      success: false, 
      data: {
        totalSearches: 0,
        topSources: [],
        recentSearches: [],
        searchGrowthPercent: 0,
        thisWeekSearches: 0,
        lastWeekSearches: 0,
      }
    };
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
