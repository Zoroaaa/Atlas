import { apiClient } from './client';
import type { SystemStats, RecordActionRequest, AnalyticsEvent, AnalyticsStats } from '@/types';

export interface SystemConfigItem {
  key: string;
  value: string;
  description: string | null;
  config_type: string;
  config_group: string | null;
  is_public: number;
  is_sensitive: number;
  is_resettable: number;
  validation_rules: string | null;
  options: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
}

export interface ConfigChangeLog {
  id: string;
  config_key: string;
  old_value: string | null;
  new_value: string;
  change_type: 'create' | 'update' | 'delete' | 'reset';
  changed_by: string | null;
  changed_by_username: string | null;
  change_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
}

export interface ConfigGroup {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  created_at: number;
  updated_at: number;
}

export interface GroupedConfigs {
  info: ConfigGroup | null;
  configs: SystemConfigItem[];
}

export const systemApi = {
  getApiInfo: async (): Promise<{ 
    success: boolean; 
    data: {
      name: string;
      version: string;
      status: string;
    } 
  }> => {
    return apiClient.get('/');
  },

  healthCheck: async (): Promise<{ status: string; timestamp: number }> => {
    return apiClient.get('/health');
  },

  getStats: async (): Promise<{ success: boolean; data: SystemStats }> => {
    const response = await apiClient.get<{ success: boolean; data: {
      users: number;
      sources: number;
      searches: number;
      activeUsers: number;
      activeUsersGrowthPercent: number;
    } }>('/stats');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          activeUsers: response.data.activeUsers || response.data.users || 0,
          activeSources: response.data.sources || 0,
          totalSearches: response.data.searches || 0,
          activeUsersGrowthPercent: response.data.activeUsersGrowthPercent || 0,
        }
      };
    }
    return { 
      success: false, 
      data: {
        activeUsers: 0,
        activeSources: 0,
        totalSearches: 0,
        activeUsersGrowthPercent: 0,
      }
    };
  },

  recordAction: async (data: RecordActionRequest): Promise<{ 
    success: boolean; 
    data: { id: string }; 
    message: string 
  }> => {
    return apiClient.post('/record-action', data);
  },

  getUserActions: async (params?: { 
    userId?: string; 
    action?: string; 
    limit?: number; 
    offset?: number 
  }): Promise<{ 
    success: boolean; 
    data: {
      logs: Array<{
        id: string;
        userId: string;
        userName: string;
        action: string;
        target: string;
        details: string;
        ip: string;
        createdAt: string;
      }>;
      total: number;
    } 
  }> => {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('userId', params.userId);
    if (params?.action) searchParams.append('action', params.action);
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.offset) searchParams.append('offset', String(params.offset));
    const queryString = searchParams.toString();
    
    const response = await apiClient.get<{ 
      success: boolean; 
      data: { 
        actions: Array<{
          id: string;
          user_id: string | null;
          action: string;
          data: string;
          ip_address: string | null;
          created_at: number;
        }>;
        total: number;
      } 
    }>(`/user-actions${queryString ? `?${queryString}` : ''}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          logs: response.data.actions.map(a => {
            let dataObj: Record<string, unknown> = {};
            try {
              dataObj = JSON.parse(a.data || '{}');
            } catch {
              dataObj = {};
            }
            return {
              id: a.id,
              userId: a.user_id || '',
              userName: '',
              action: a.action,
              target: (dataObj.target as string) || (dataObj.query as string) || (dataObj.keyword as string) || '',
              details: a.data,
              ip: a.ip_address || '',
              createdAt: new Date(a.created_at).toISOString(),
            };
          }),
          total: response.data.total,
        }
      };
    }
    return { success: false, data: { logs: [], total: 0 } };
  },
};

export const analyticsApi = {
  recordEvent: async (data: AnalyticsEvent): Promise<{ 
    success: boolean; 
    data: { eventId: string } 
  }> => {
    return apiClient.post('/config/analytics/events', data);
  },

  getStats: async (days = 7): Promise<{ 
    success: boolean; 
    data: AnalyticsStats 
  }> => {
    return apiClient.get(`/config/analytics/stats?days=${days}`);
  },
};

export const configApi = {
  getPublicConfig: async (): Promise<{ success: boolean; data: Record<string, unknown> }> => {
    return apiClient.get('/config/public');
  },

  getAllConfigs: async (): Promise<{ 
    success: boolean; 
    data: SystemConfigItem[];
  }> => {
    return apiClient.get('/config/all');
  },

  getConfigByKey: async (key: string): Promise<{ 
    success: boolean; 
    data: SystemConfigItem;
  }> => {
    return apiClient.get(`/config/${encodeURIComponent(key)}`);
  },

  updateConfig: async (key: string, data: { 
    value: string; 
    description?: string; 
    configType?: string; 
    configGroup?: string;
    isPublic?: boolean; 
    isSensitive?: boolean;
    changeReason?: string;
  }): Promise<{ success: boolean; message: string }> => {
    return apiClient.put(`/config/${encodeURIComponent(key)}`, data);
  },

  deleteConfig: async (key: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/config/${encodeURIComponent(key)}`);
  },

  batchUpdateConfig: async (configs: Array<{
    key: string;
    value: string;
    description?: string;
    configType?: string;
    configGroup?: string;
    isPublic?: boolean;
    isSensitive?: boolean;
  }>, changeReason?: string): Promise<{ 
    success: boolean; 
    data: { 
      results: Array<{ key: string; success: boolean; error?: string }>;
      updated: number;
    };
    message: string;
  }> => {
    return apiClient.put('/config/batch', { configs, changeReason });
  },

  getConfigGroups: async (): Promise<{ 
    success: boolean; 
    data: {
      groups: ConfigGroup[];
      groupedConfigs: Record<string, GroupedConfigs>;
    };
  }> => {
    return apiClient.get('/config/groups');
  },

  resetConfig: async (key: string): Promise<{ 
    success: boolean; 
    data: { key: string; value: string };
    message: string;
  }> => {
    return apiClient.post(`/config/reset/${encodeURIComponent(key)}`, {});
  },

  getConfigLogs: async (params?: {
    key?: string;
    type?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    success: boolean;
    data: {
      logs: ConfigChangeLog[];
      total: number;
      page: number;
      pageSize: number;
    };
  }> => {
    const searchParams = new URLSearchParams();
    if (params?.key) searchParams.append('key', params.key);
    if (params?.type) searchParams.append('type', params.type);
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.pageSize) searchParams.append('pageSize', String(params.pageSize));
    const queryString = searchParams.toString();
    return apiClient.get(`/config/logs${queryString ? `?${queryString}` : ''}`);
  },

  exportConfig: async (): Promise<{
    success: boolean;
    data: {
      version: string;
      exportedAt: string;
      exportedBy: string;
      configs: Array<{
        key: string;
        value: string;
        description: string | null;
        configType: string;
        configGroup: string | null;
        isPublic: boolean;
        isSensitive: boolean;
      }>;
    };
  }> => {
    return apiClient.get('/config/export');
  },

  importConfig: async (configs: Array<{
    key: string;
    value: string;
    description?: string;
    configType?: string;
    configGroup?: string;
    isPublic?: boolean;
    isSensitive?: boolean;
  }>, overwrite = false): Promise<{
    success: boolean;
    data: {
      results: Array<{ key: string; success: boolean; action: string; error?: string }>;
      created: number;
      updated: number;
      skipped: number;
    };
    message: string;
  }> => {
    return apiClient.post('/config/import', { configs, overwrite });
  },
};