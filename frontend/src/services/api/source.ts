import { apiClient } from './client';
import type {
  MajorCategory,
  Category,
  SearchSource,
  UserSourceConfig,
  CreateMajorCategoryRequest,
  UpdateMajorCategoryRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateSourceRequest,
  UpdateSourceRequest,
  UpdateUserSourceConfigRequest,
  BatchUpdateUserSourceConfigRequest,
  SourceStats,
} from '@/types';

export const sourceApi = {
  getMajorCategories: async (): Promise<{ 
    success: boolean; 
    data: MajorCategory[]
  }> => {
    const response = await apiClient.get<{ success: boolean; data: { categories: Array<{
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      color: string;
      requires_keyword: number;
      display_order: number;
      is_system: number;
      is_active: number;
      created_at: number;
      updated_at: number;
    }> } }>('/search-sources/major-categories');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.categories.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description || undefined,
          icon: c.icon || undefined,
          color: c.color,
          requiresKeyword: c.requires_keyword === 1,
          isSystem: c.is_system === 1,
          isActive: c.is_active === 1,
          displayOrder: c.display_order,
          createdAt: new Date(c.created_at).toISOString(),
          updatedAt: new Date(c.updated_at).toISOString(),
        }))
      };
    }
    return { success: false, data: [] };
  },

  getMajorCategory: async (id: string): Promise<{ 
    success: boolean; 
    data: MajorCategory 
  }> => {
    return apiClient.get(`/search-sources/major-categories/${id}`);
  },

  createMajorCategory: async (data: CreateMajorCategoryRequest): Promise<{ 
    success: boolean; 
    data: MajorCategory; 
    message: string 
  }> => {
    return apiClient.post('/search-sources/major-categories', data);
  },

  updateMajorCategory: async (id: string, data: UpdateMajorCategoryRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    return apiClient.put(`/search-sources/major-categories/${id}`, data);
  },

  deleteMajorCategory: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/major-categories/${id}`);
  },

  getCategories: async (majorCategoryId?: string): Promise<{ 
    success: boolean; 
    data: Category[]
  }> => {
    const params = majorCategoryId ? `?majorCategoryId=${majorCategoryId}` : '';
    const response = await apiClient.get<{ success: boolean; data: { categories: Array<{
      id: string;
      major_category_id: string;
      major_category_name: string | null;
      name: string;
      description: string | null;
      icon: string | null;
      color: string;
      default_searchable: number;
      default_site_type: string;
      search_priority: number;
      is_system: number;
      is_active: number;
      display_order: number;
      created_by: string | null;
      created_at: number;
      updated_at: number;
    }> } }>(`/search-sources/categories${params}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.categories.map(c => ({
          id: c.id,
          majorCategoryId: c.major_category_id,
          majorCategoryName: c.major_category_name || undefined,
          name: c.name,
          description: c.description || undefined,
          icon: c.icon || undefined,
          color: c.color,
          defaultSearchable: c.default_searchable === 1,
          defaultSiteType: c.default_site_type as 'search' | 'browse' | 'reference',
          searchPriority: c.search_priority,
          isSystem: c.is_system === 1,
          isActive: c.is_active === 1,
          displayOrder: c.display_order,
          createdAt: new Date(c.created_at).toISOString(),
          updatedAt: new Date(c.updated_at).toISOString(),
        }))
      };
    }
    return { success: false, data: [] };
  },

  getCategory: async (id: string): Promise<{ 
    success: boolean; 
    data: Category 
  }> => {
    return apiClient.get(`/search-sources/categories/${id}`);
  },

  createCategory: async (data: CreateCategoryRequest): Promise<{ 
    success: boolean; 
    data: Category; 
    message: string 
  }> => {
    return apiClient.post('/search-sources/categories', data);
  },

  updateCategory: async (id: string, data: UpdateCategoryRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    return apiClient.put(`/search-sources/categories/${id}`, data);
  },

  deleteCategory: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/categories/${id}`);
  },

  getSources: async (options?: {
    categoryId?: string;
    searchable?: boolean;
    siteType?: string;
    majorCategoryId?: string;
  }): Promise<{ 
    success: boolean; 
    data: SearchSource[] 
  }> => {
    const params = new URLSearchParams();
    if (options?.categoryId) params.append('categoryId', options.categoryId);
    if (options?.searchable !== undefined) params.append('searchable', String(options.searchable));
    if (options?.siteType) params.append('siteType', options.siteType);
    if (options?.majorCategoryId) params.append('majorCategoryId', options.majorCategoryId);
    const queryString = params.toString();
    return apiClient.get(`/search-sources${queryString ? `?${queryString}` : ''}`);
  },

  getSource: async (id: string): Promise<{ 
    success: boolean; 
    data: SearchSource 
  }> => {
    return apiClient.get(`/search-sources/${id}`);
  },

  createSource: async (data: CreateSourceRequest): Promise<{ 
    success: boolean; 
    data: SearchSource; 
    message: string 
  }> => {
    return apiClient.post('/search-sources', data);
  },

  updateSource: async (id: string, data: UpdateSourceRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    return apiClient.put(`/search-sources/${id}`, data);
  },

  deleteSource: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/${id}`);
  },

  incrementUsage: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.post(`/search-sources/${id}/increment-usage`, {});
  },

  getPopularSources: async (limit = 20): Promise<{ 
    success: boolean; 
    data: SearchSource[] 
  }> => {
    return apiClient.get(`/search-sources/popular?limit=${limit}`);
  },

  searchSources: async (keyword: string): Promise<{ 
    success: boolean; 
    data: SearchSource[] 
  }> => {
    return apiClient.get(`/search-sources/search?keyword=${encodeURIComponent(keyword)}`);
  },

  getActiveSources: async (): Promise<{ 
    success: boolean; 
    data: SearchSource[]
  }> => {
    const response = await apiClient.get<{ success: boolean; data: { sources: Array<{
      id: string;
      category_id: string;
      name: string;
      subtitle: string | null;
      description: string | null;
      icon: string | null;
      url_template: string;
      homepage_url: string | null;
      site_type: string;
      searchable: number;
      requires_keyword: number;
      search_priority: number;
      is_system: number;
      is_active: number;
      display_order: number;
      usage_count: number;
      last_used_at: number | null;
      created_by: string | null;
      created_at: number;
      updated_at: number;
    }> } }>('/search-sources?searchable=true');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.sources.map(s => ({
          id: s.id,
          categoryId: s.category_id,
          name: s.name,
          subtitle: s.subtitle || undefined,
          description: s.description || undefined,
          icon: s.icon || undefined,
          urlTemplate: s.url_template,
          homepageUrl: s.homepage_url || undefined,
          siteType: s.site_type as 'search' | 'browse' | 'reference',
          searchable: s.searchable === 1,
          requiresKeyword: s.requires_keyword === 1,
          searchPriority: s.search_priority,
          isSystem: s.is_system === 1,
          isActive: s.is_active === 1,
          usageCount: s.usage_count,
          displayOrder: s.display_order,
          createdAt: new Date(s.created_at).toISOString(),
          updatedAt: new Date(s.updated_at).toISOString(),
          status: 'active' as const,
        }))
      };
    }
    return { success: false, data: [] };
  },

  getUserSourceConfigs: async (): Promise<{ 
    success: boolean; 
    data: UserSourceConfig[] 
  }> => {
    return apiClient.get('/user/source-configs');
  },

  getSourcesWithUserConfig: async (): Promise<{ 
    success: boolean; 
    data: Array<SearchSource & { userConfig: UserSourceConfig | null }> 
  }> => {
    const token = apiClient.getToken();
    if (!token) {
      const response = await apiClient.get<{ success: boolean; data: { sources: Array<{
        id: string;
        category_id: string;
        name: string;
        subtitle: string | null;
        description: string | null;
        icon: string | null;
        url_template: string;
        homepage_url: string | null;
        site_type: string;
        searchable: number;
        requires_keyword: number;
        search_priority: number;
        is_system: number;
        is_active: number;
        display_order: number;
        usage_count: number;
        last_used_at: number | null;
        created_by: string | null;
        created_at: number;
        updated_at: number;
      }> } }>('/search-sources');
      
      if (response.success && response.data) {
        return {
          success: true,
          data: response.data.sources.map(s => ({
            id: s.id,
            categoryId: s.category_id,
            name: s.name,
            subtitle: s.subtitle || undefined,
            description: s.description || undefined,
            icon: s.icon || undefined,
            urlTemplate: s.url_template,
            homepageUrl: s.homepage_url || undefined,
            siteType: s.site_type as 'search' | 'browse' | 'reference',
            searchable: s.searchable === 1,
            requiresKeyword: s.requires_keyword === 1,
            searchPriority: s.search_priority,
            isSystem: s.is_system === 1,
            isActive: s.is_active === 1,
            usageCount: s.usage_count,
            displayOrder: s.display_order,
            createdAt: new Date(s.created_at).toISOString(),
            updatedAt: new Date(s.updated_at).toISOString(),
            status: 'active' as const,
            userConfig: null,
          }))
        };
      }
      return { success: false, data: [] };
    }
    
    let userId = '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.userId;
    } catch {
      return { success: false, data: [] };
    }
    
    const response = await apiClient.get<{ success: boolean; data: { sources: Array<{
      id: string;
      category_id: string;
      name: string;
      subtitle: string | null;
      description: string | null;
      icon: string | null;
      url_template: string;
      homepage_url: string | null;
      site_type: string;
      searchable: number;
      requires_keyword: number;
      search_priority: number;
      is_system: number;
      is_active: number;
      display_order: number;
      usage_count: number;
      last_used_at: number | null;
      created_by: string | null;
      created_at: number;
      updated_at: number;
      userConfig: {
        id: string;
        user_id: string;
        source_id: string;
        is_enabled: number;
        custom_priority: number | null;
        custom_name: string | null;
        custom_subtitle: string | null;
        custom_icon: string | null;
        notes: string | null;
      } | null;
    }> } }>(`/search-sources/with-user-config/${userId}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.sources.map(s => ({
          id: s.id,
          categoryId: s.category_id,
          name: s.name,
          subtitle: s.subtitle || undefined,
          description: s.description || undefined,
          icon: s.icon || undefined,
          urlTemplate: s.url_template,
          homepageUrl: s.homepage_url || undefined,
          siteType: s.site_type as 'search' | 'browse' | 'reference',
          searchable: s.searchable === 1,
          requiresKeyword: s.requires_keyword === 1,
          searchPriority: s.search_priority,
          isSystem: s.is_system === 1,
          isActive: s.is_active === 1,
          usageCount: s.usage_count,
          displayOrder: s.display_order,
          createdAt: new Date(s.created_at).toISOString(),
          updatedAt: new Date(s.updated_at).toISOString(),
          status: 'active' as const,
          userConfig: s.userConfig ? {
            id: s.userConfig.id,
            userId: s.userConfig.user_id,
            sourceId: s.userConfig.source_id,
            isEnabled: s.userConfig.is_enabled === 1,
            customPriority: s.userConfig.custom_priority,
            customName: s.userConfig.custom_name,
            customSubtitle: s.userConfig.custom_subtitle,
            customIcon: s.userConfig.custom_icon,
            notes: s.userConfig.notes,
          } : null,
        }))
      };
    }
    return { success: false, data: [] };
  },

  updateUserSourceConfig: async (sourceId: string, config: UpdateUserSourceConfigRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    return apiClient.put(`/user/source-configs/${sourceId}`, config);
  },

  batchUpdateUserSourceConfigs: async (data: BatchUpdateUserSourceConfigRequest): Promise<{ 
    success: boolean; 
    data: { updatedCount: number }; 
    message: string 
  }> => {
    return apiClient.post('/search-sources/user-configs/batch', data);
  },

  deleteUserSourceConfig: async (sourceId: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/user/source-configs/${sourceId}`);
  },

  getSourceStats: async (): Promise<{ 
    success: boolean; 
    data: SourceStats 
  }> => {
    return apiClient.get('/search-sources/stats');
  },

  exportSources: async (format: 'json' | 'csv' | 'opml' = 'json', categoryId?: string): Promise<unknown> => {
    const params = new URLSearchParams();
    params.append('format', format);
    if (categoryId) params.append('categoryId', categoryId);
    
    if (format === 'json') {
      return apiClient.get(`/search-sources/export?${params.toString()}`);
    }
    
    const baseUrl = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? '/api'
      : 'https://backend.codeseek.pp.ua/api';
    const response = await fetch(`${baseUrl}/search-sources/export?${params.toString()}`);
    return response.blob();
  },

  exportUserConfigs: async (): Promise<{ 
    success: boolean; 
    data: UserSourceConfig[] 
  }> => {
    const token = apiClient.getToken();
    if (!token) return { success: false, data: [] };
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return apiClient.get(`/search-sources/export-user-configs/${payload.userId}`);
    } catch {
      return { success: false, data: [] };
    }
  },

  checkSourceStatus: async (sourceId: string, keyword = 'test'): Promise<{ 
    success: boolean; 
    data: {
      status: string;
      available: boolean;
      responseTime: number;
      error: string | null;
    } 
  }> => {
    return apiClient.get(`/source-status-check?sourceId=${sourceId}&keyword=${encodeURIComponent(keyword)}`);
  },

  getSourceStatusHistory: async (sourceId: string, limit = 50, hours = 24): Promise<{ 
    success: boolean; 
    data: {
      source: SearchSource;
      history: Array<{
        status: string;
        available: boolean;
        responseTime: number;
        checkedAt: string;
        error: string | null;
      }>;
      summary: {
        totalChecks: number;
        availableCount: number;
        unavailableCount: number;
        availabilityRate: number;
        avgResponseTime: number;
        lastChecked: string | null;
      };
    } 
  }> => {
    return apiClient.get(`/source-status-history/${sourceId}?limit=${limit}&hours=${hours}`);
  },

  batchCheckSourceStatus: async (sourceIds: string[], keyword = 'test'): Promise<{ 
    success: boolean; 
    data: {
      results: Array<{
        sourceId: string;
        sourceName: string;
        status: string;
        available: boolean;
        responseTime: number;
        error: string | null;
      }>;
      checkedAt: number;
      keyword: string;
    }
  }> => {
    return apiClient.post('/source-status-batch', { sourceIds, keyword });
  },

  clearSourceStatusCache: async (sourceId: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/source-status-cache/${sourceId}`);
  },
};
