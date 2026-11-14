import { apiClient } from './client';
import { parseRequest } from '../validation';
import { getApiBaseUrl } from '@/constants';
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
  SourceBoardStats,
  SourceCatalogItem,
  SourceCatalogPage,
  SourceCatalogParams,
  SourceDetailPayload,
} from '@/types';

/** catalog 接口原始行（后端返回 snake_case + 少量 camelCase 别名） */
interface RawCatalogItem {
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
  usage_count: number;
  is_system: number;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  majorCategoryId: string | null;
  majorCategoryName: string | null;
  enabled: boolean;
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
}

interface RawUserConfig {
  id: string;
  user_id: string;
  source_id: string;
  is_enabled: number;
  custom_priority: number | null;
  custom_name: string | null;
  custom_subtitle: string | null;
  custom_icon: string | null;
  notes: string | null;
}

function mapUserConfig(config: RawUserConfig | null): UserSourceConfig | null {
  if (!config) return null;
  return {
    id: config.id,
    userId: config.user_id,
    sourceId: config.source_id,
    isEnabled: config.is_enabled === 1,
    customPriority: config.custom_priority,
    customName: config.custom_name,
    customSubtitle: config.custom_subtitle,
    customIcon: config.custom_icon,
    notes: config.notes,
  };
}

function mapCatalogItem(item: RawCatalogItem): SourceCatalogItem {
  return {
    id: item.id,
    categoryId: item.category_id,
    name: item.name,
    subtitle: item.subtitle || undefined,
    description: item.description || undefined,
    icon: item.icon || undefined,
    urlTemplate: item.url_template,
    homepageUrl: item.homepage_url || undefined,
    siteType: item.site_type as 'search' | 'browse' | 'reference',
    searchable: item.searchable === 1,
    usageCount: item.usage_count,
    isSystem: item.is_system === 1,
    categoryName: item.categoryName || undefined,
    categoryIcon: item.categoryIcon || undefined,
    categoryColor: item.categoryColor || undefined,
    majorCategoryId: item.majorCategoryId || undefined,
    majorCategoryName: item.majorCategoryName || undefined,
    enabled: item.enabled,
    userConfig: mapUserConfig(item.userConfig),
  };
}

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

  createMajorCategory: async (data: CreateMajorCategoryRequest): Promise<{ 
    success: boolean; 
    data: MajorCategory; 
    message: string 
  }> => {
    const { createMajorCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<CreateMajorCategoryRequest>(createMajorCategorySchema, data);
    return apiClient.post('/search-sources/major-categories', payload);
  },

  updateMajorCategory: async (id: string, data: UpdateMajorCategoryRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    const { updateMajorCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateMajorCategoryRequest>(updateMajorCategorySchema, data);
    return apiClient.put(`/search-sources/major-categories/${id}`, payload);
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

  createCategory: async (data: CreateCategoryRequest): Promise<{ 
    success: boolean; 
    data: Category; 
    message: string 
  }> => {
    const { createCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<CreateCategoryRequest>(createCategorySchema, data);
    return apiClient.post('/search-sources/categories', payload);
  },

  updateCategory: async (id: string, data: UpdateCategoryRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    const { updateCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateCategoryRequest>(updateCategorySchema, data);
    return apiClient.put(`/search-sources/categories/${id}`, payload);
  },

  deleteCategory: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/categories/${id}`);
  },

  createSource: async (data: CreateSourceRequest): Promise<{ 
    success: boolean; 
    data: SearchSource; 
    message: string 
  }> => {
    const { createSourceSchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<CreateSourceRequest>(createSourceSchema, data);
    return apiClient.post('/search-sources', payload);
  },

  updateSource: async (id: string, data: UpdateSourceRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    const { updateSourceSchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateSourceRequest>(updateSourceSchema, data);
    return apiClient.put(`/search-sources/${id}`, payload);
  },

  deleteSource: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/${id}`);
  },

  incrementUsage: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.post(`/search-sources/${id}/increment-usage`, {});
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
    const { updateSourceConfigSchema } = await import('@codeseek/shared/schemas/user');
    const payload = await parseRequest<UpdateUserSourceConfigRequest>(updateSourceConfigSchema, config);
    return apiClient.put(`/user/source-configs/${sourceId}`, payload);
  },

  batchUpdateUserSourceConfigs: async (data: BatchUpdateUserSourceConfigRequest): Promise<{ 
    success: boolean; 
    data: { updatedCount: number }; 
    message: string 
  }> => {
    const { batchUpdateUserConfigsSchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<BatchUpdateUserSourceConfigRequest>(batchUpdateUserConfigsSchema, data);
    return apiClient.post('/search-sources/user-configs/batch', payload);
  },

  getSourceCatalog: async (params: SourceCatalogParams = {}): Promise<{
    success: boolean;
    data: SourceCatalogPage;
  }> => {
    const qs = new URLSearchParams();
    if (params.keyword) qs.append('keyword', params.keyword);
    if (params.majorCategoryId) qs.append('majorCategoryId', params.majorCategoryId);
    if (params.categoryId) qs.append('categoryId', params.categoryId);
    if (params.siteType) qs.append('siteType', params.siteType);
    if (params.searchable !== undefined) qs.append('searchable', params.searchable ? 'true' : 'false');
    if (params.scope && params.scope !== 'all') qs.append('scope', params.scope);
    if (params.sort && params.sort !== 'default') qs.append('sort', params.sort);
    if (params.page) qs.append('page', String(params.page));
    if (params.pageSize) qs.append('pageSize', String(params.pageSize));

    const response = await apiClient.get<{
      success: boolean;
      data: { items: RawCatalogItem[]; total: number; page: number; pageSize: number; hasMore: boolean };
    }>(`/search-sources/catalog?${qs.toString()}`);

    if (response.success && response.data) {
      return {
        success: true,
        data: {
          items: (response.data.items || []).map(mapCatalogItem),
          total: response.data.total,
          page: response.data.page,
          pageSize: response.data.pageSize,
          hasMore: response.data.hasMore,
        },
      };
    }
    return { success: false, data: { items: [], total: 0, page: 1, pageSize: 0, hasMore: false } };
  },

  getSourceById: async (id: string): Promise<{ success: boolean; data: SourceDetailPayload }> => {
    const response = await apiClient.get<{
      success: boolean;
      data: {
        source: RawCatalogItem & { is_active: number };
        categoryPath: Array<{ id: string; name: string; type: 'major' | 'category' }>;
        enabled: boolean;
        userConfig: RawUserConfig | null;
        status: SourceDetailPayload['status'];
      };
    }>(`/search-sources/${id}`);

    if (response.success && response.data) {
      const { source, categoryPath, enabled, userConfig, status } = response.data;
      return {
        success: true,
        data: {
          source: {
            id: source.id,
            categoryId: source.category_id,
            name: source.name,
            subtitle: source.subtitle || undefined,
            description: source.description || undefined,
            icon: source.icon || undefined,
            urlTemplate: source.url_template,
            homepageUrl: source.homepage_url || undefined,
            siteType: source.site_type as 'search' | 'browse' | 'reference',
            searchable: source.searchable === 1,
            searchPriority: 0,
            isSystem: source.is_system === 1,
            isActive: source.is_active === 1,
            usageCount: source.usage_count,
            displayOrder: 0,
            createdAt: '',
            updatedAt: '',
            status: 'active',
            categoryName: source.categoryName || undefined,
            categoryIcon: source.categoryIcon || undefined,
            categoryColor: source.categoryColor || undefined,
            majorCategoryId: source.majorCategoryId || undefined,
            majorCategoryName: source.majorCategoryName || undefined,
          },
          categoryPath: categoryPath || [],
          enabled,
          userConfig: mapUserConfig(userConfig),
          status: status || null,
        },
      };
    }
    return {
      success: false,
      data: {
        source: {} as SourceDetailPayload['source'],
        categoryPath: [],
        enabled: true,
        userConfig: null,
        status: null,
      },
    };
  },

  getSourceStats: async (): Promise<{ 
    success: boolean; 
    data: SourceBoardStats 
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
    
    const baseUrl = getApiBaseUrl();
    const token = apiClient.getToken();
    const response = await fetch(`${baseUrl}/search-sources/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'omit',
    });
    if (!response.ok) {
      // 不要把错误 JSON 当成 csv/opml 文件下载
      const errorData = await response.json().catch(() => null);
      throw new Error(
        errorData?.error?.message || errorData?.message || `HTTP error! status: ${response.status}`
      );
    }
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

  batchCheckSourceStatus: async (sourceIds: string[]): Promise<{ 
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
    }
  }> => {
    const { batchSourceStatusSchema } = await import('@codeseek/shared/schemas/system');
    const payload = await parseRequest<{ sourceIds: string[] }>(batchSourceStatusSchema, { sourceIds });
    return apiClient.post('/source-status-batch', payload);
  },

  clearSourceStatusCache: async (sourceId: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/source-status-cache/${sourceId}`);
  },
};
