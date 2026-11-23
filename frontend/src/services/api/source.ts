/**
 * 搜索源 API：把后端 snake_case 行数据映射为前端 camelCase 模型。
 *
 * 约束：写操作先经 shared zod 校验；未登录时只读取公共源，userConfig 恒为 null。
 */

import { apiClient } from './client';
import { parseRequest } from '../validation';
import { decodeJwtPayload } from '@/utils/jwt';
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
  UserSourceTree,
  AdminSourceTree,
  SourceHealthResult,
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

/** 源详情接口原始行：后端已按 camelCase DTO 返回 */
interface RawSourceDetail {
  id: string;
  categoryId: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  icon?: string | null;
  urlTemplate: string;
  homepageUrl?: string | null;
  siteType: string;
  searchable: boolean;
  searchPriority: number;
  displayOrder: number;
  isSystem: boolean;
  ownerId?: string | null;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  majorCategoryId?: string | null;
  majorCategoryName?: string | null;
}

/** 用户源配置映射；null 表示该用户没有对这条源做自定义。 */
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

/** catalog 行 → 前端模型：SQLite 的 0/1 布尔与空字符串统一归一化。 */
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

/** 搜索源、分类、用户源配置的增删改查；列表接口在这里完成字段映射。 */
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

  getUserSourceTree: async (): Promise<{ success: boolean; data: UserSourceTree }> => {
    return apiClient.get('/search-sources/tree');
  },

  getAdminSourceTree: async (): Promise<{ success: boolean; data: AdminSourceTree }> => {
    return apiClient.get('/admin/search-sources/tree');
  },

  createMajorCategory: async (data: CreateMajorCategoryRequest): Promise<{ 
    success: boolean; 
    data: MajorCategory; 
    message: string 
  }> => {
    const { createMajorCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<CreateMajorCategoryRequest>(createMajorCategorySchema, data);
    return apiClient.post('/search-sources/mine/major-categories', payload);
  },

  updateMajorCategory: async (id: string, data: UpdateMajorCategoryRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    const { updateMajorCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateMajorCategoryRequest>(updateMajorCategorySchema, data);
    return apiClient.put(`/search-sources/mine/major-categories/${id}`, payload);
  },

  deleteMajorCategory: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/mine/major-categories/${id}`);
  },

  createSystemMajorCategory: async (data: CreateMajorCategoryRequest): Promise<{
    success: boolean;
    data: MajorCategory;
    message: string;
  }> => {
    const { createMajorCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<CreateMajorCategoryRequest>(createMajorCategorySchema, data);
    return apiClient.post('/admin/search-sources/major-categories', payload);
  },

  updateSystemMajorCategory: async (id: string, data: UpdateMajorCategoryRequest): Promise<{
    success: boolean;
    message: string;
  }> => {
    const { updateMajorCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateMajorCategoryRequest>(updateMajorCategorySchema, data);
    return apiClient.put(`/admin/search-sources/major-categories/${id}`, payload);
  },

  deleteSystemMajorCategory: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/admin/search-sources/major-categories/${id}`);
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
    return apiClient.post('/search-sources/mine/categories', payload);
  },

  updateCategory: async (id: string, data: UpdateCategoryRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    const { updateCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateCategoryRequest>(updateCategorySchema, data);
    return apiClient.put(`/search-sources/mine/categories/${id}`, payload);
  },

  deleteCategory: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/mine/categories/${id}`);
  },

  createSystemCategory: async (data: CreateCategoryRequest): Promise<{
    success: boolean;
    data: Category;
    message: string;
  }> => {
    const { createCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<CreateCategoryRequest>(createCategorySchema, data);
    return apiClient.post('/admin/search-sources/categories', payload);
  },

  updateSystemCategory: async (id: string, data: UpdateCategoryRequest): Promise<{
    success: boolean;
    message: string;
  }> => {
    const { updateCategorySchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateCategoryRequest>(updateCategorySchema, data);
    return apiClient.put(`/admin/search-sources/categories/${id}`, payload);
  },

  deleteSystemCategory: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/admin/search-sources/categories/${id}`);
  },

  createSource: async (data: CreateSourceRequest): Promise<{ 
    success: boolean; 
    data: SearchSource; 
    message: string 
  }> => {
    const { createSourceSchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<CreateSourceRequest>(createSourceSchema, data);
    return apiClient.post('/search-sources/mine/sources', payload);
  },

  updateSource: async (id: string, data: UpdateSourceRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    const { updateSourceSchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateSourceRequest>(updateSourceSchema, data);
    return apiClient.put(`/search-sources/mine/sources/${id}`, payload);
  },

  deleteSource: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/mine/sources/${id}`);
  },

  createSystemSource: async (data: CreateSourceRequest): Promise<{
    success: boolean;
    data: SearchSource;
    message: string;
  }> => {
    const { createSourceSchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<CreateSourceRequest>(createSourceSchema, data);
    return apiClient.post('/admin/search-sources/sources', payload);
  },

  updateSystemSource: async (id: string, data: UpdateSourceRequest): Promise<{
    success: boolean;
    message: string;
  }> => {
    const { updateSourceSchema } = await import('@codeseek/shared/schemas/sources');
    const payload = await parseRequest<UpdateSourceRequest>(updateSourceSchema, data);
    return apiClient.put(`/admin/search-sources/sources/${id}`, payload);
  },

  deleteSystemSource: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/admin/search-sources/sources/${id}`);
  },

  incrementUsage: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.post(`/search-sources/${id}/increment-usage`, {});
  },

  getSourcesWithUserConfig: async (): Promise<{ 
    success: boolean; 
    data: Array<SearchSource & { userConfig: UserSourceConfig | null }> 
  }> => {
    // 源列表属于登录后数据：/search-sources 全组挂在 authMiddleware 下，
    // 原先的「未登录走公共列表」分支永远 401，已随该路由一并移除。
    const token = apiClient.getToken();
    if (!token) return { success: false, data: [] };

    // 用户配置接口按 userId 寻址，这里从 JWT payload 直接取；解析失败视为本地 token 损坏
    const payload = decodeJwtPayload(token);
    if (!payload) {
      console.error('[source] JWT payload 解析失败，无法读取用户源配置');
      return { success: false, data: [] };
    }
    const userId = payload.userId;
    
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

  /** 清除本人对某个系统源的自定义配置（恢复默认名称/备注/启用状态） */
  resetUserSourceConfig: async (sourceId: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/search-sources/user-configs/${sourceId}`);
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

  // 失败时返回 data: null，由调用方展示错误态；不能伪造 enabled: true 让 UI 误判
  getSourceById: async (id: string): Promise<{ success: boolean; data: SourceDetailPayload | null }> => {
    const response = await apiClient.get<{
      success: boolean;
      data: {
        source: RawSourceDetail;
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
            categoryId: source.categoryId,
            name: source.name,
            subtitle: source.subtitle || undefined,
            description: source.description || undefined,
            icon: source.icon || undefined,
            urlTemplate: source.urlTemplate || '',
            homepageUrl: source.homepageUrl || undefined,
            siteType: source.siteType as 'search' | 'browse' | 'reference',
            searchable: source.searchable,
            searchPriority: source.searchPriority,
            isSystem: source.isSystem,
            ownerId: source.ownerId ?? null,
            isActive: source.isActive,
            usageCount: source.usageCount,
            displayOrder: source.displayOrder,
            createdAt: source.createdAt,
            updatedAt: source.updatedAt,
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
    return { success: false, data: null };
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
    
    // json 走 apiClient 统一错误处理；csv/opml 是二进制流，只能直接 fetch
    if (format === 'json') {
      return apiClient.get(`/search-sources/mine/export?${params.toString()}`);
    }
    
    const baseUrl = getApiBaseUrl();
    const token = apiClient.getToken();
    const response = await fetch(`${baseUrl}/search-sources/mine/export?${params.toString()}`, {
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

  /** 手动探测单个源：服务端不读缓存，返回本次真实结果（含原因备注）。 */
  checkSourceStatus: async (sourceId: string): Promise<{
    success: boolean;
    data: SourceHealthResult;
  }> => {
    return apiClient.get(`/source-status-check?sourceId=${sourceId}`);
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

  /** 批量手动探测：一次最多 20 条，服务端按批扣减配额（429 表示全量探测次数已用完）。 */
  batchCheckSourceStatus: async (sourceIds: string[]): Promise<{
    success: boolean;
    data: {
      results: SourceHealthResult[];
      checkedAt: number;
      summary: { total: number; available: number; unavailable: number };
    }
  }> => {
    const { batchSourceStatusSchema } = await import('@codeseek/shared/schemas/system');
    const payload = await parseRequest<{ sourceIds: string[] }>(batchSourceStatusSchema, { sourceIds });
    return apiClient.post('/source-status-batch', payload);
  },
};
