import { apiClient } from './client';
import type { Role, AdminUser, AdminUserDetail, UserLoginLog } from '@/types';
import type {
  DataRecord,
  DataRecordDetail,
  DataStorageStats,
  DataStorageTrends,
  DataRecordsQuery,
  DataRecordStatus,
} from '@/types';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface AdminStats {
  users: {
    total: number;
    active: number;
    verified: number;
    newThisWeek: number;
    dailyActive: number;
  };
  roles: Array<{
    id: string;
    name: string;
    displayName: string;
    userCount: number;
  }>;
  sources: {
    total: number;
    active: number;
    searchable: number;
    totalUsage: number;
  };
  searches: {
    total: number;
    uniqueUsers: number;
    uniqueKeywords: number;
  };
  community: {
    posts: number;
    tags: number;
    reviews: number;
    pendingReports: number;
  };
  topSearchKeywords: Array<{ query: string; count: number }>;
  topUsedSources: Array<{ name: string; usage_count: number }>;
}

interface LoginStats {
  dailyStats: Array<{
    date: string;
    total: number;
    success: number;
    failed: number;
    unique_users: number;
  }>;
  topIPs: Array<{ ip_address: string; count: number }>;
  failedAttempts: Array<{ ip_address: string; count: number }>;
}

export const adminApi = {
  getRoles: async (): Promise<Role[]> => {
    const response = await apiClient.get<{ success: boolean; data: { roles: Role[] } }>('/admin/roles');
    return response.data.roles;
  },

  getUsersStats: async (): Promise<{
    total: number;
    active: number;
    inactive: number;
    verified: number;
    newToday: number;
    newWeek: number;
    newMonth: number;
    activeToday: number;
    roleDistribution: Array<{ display_name: string; count: number }>;
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>('/admin/users/stats');
    return response.data;
  },

  getUsers: async (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    roleId?: string;
  } = {}): Promise<PaginatedResponse<AdminUser>> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.search) queryParams.set('search', params.search);
    if (params.status) queryParams.set('status', params.status);
    if (params.roleId) queryParams.set('roleId', params.roleId);

    const response = await apiClient.get<{
      success: boolean;
      data: {
        users: AdminUser[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
    }>(`/admin/users?${queryParams.toString()}`);

    return {
      items: response.data.users,
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.pageSize,
      totalPages: response.data.totalPages,
    };
  },

  getUserDetail: async (userId: string): Promise<AdminUserDetail> => {
    const response = await apiClient.get<{ success: boolean; data: { user: Omit<AdminUserDetail, 'stats' | 'recentSessions' | 'recentActions'>; stats: AdminUserDetail['stats']; recentSessions: AdminUserDetail['recentSessions']; recentActions: AdminUserDetail['recentActions'] } }>(`/admin/users/${userId}`);
    return {
      ...response.data.user,
      stats: response.data.stats,
      recentSessions: response.data.recentSessions || [],
      recentActions: response.data.recentActions || [],
    } as AdminUserDetail;
  },

  updateUserStatus: async (userId: string, isActive: boolean, reason?: string): Promise<void> => {
    await apiClient.put(`/admin/users/${userId}/status`, { isActive, reason });
  },

  updateUserRole: async (userId: string, roleId: string): Promise<{ roleId: string; roleName: string }> => {
    const response = await apiClient.put<{ success: boolean; data: { roleId: string; roleName: string } }>(`/admin/users/${userId}/role`, { roleId });
    return response.data;
  },

  updateUserPermissions: async (userId: string, permissions: string[]): Promise<void> => {
    await apiClient.put(`/admin/users/${userId}/permissions`, { permissions });
  },

  getUserLoginLogs: async (userId: string, params: {
    page?: number;
    pageSize?: number;
  } = {}): Promise<PaginatedResponse<UserLoginLog>> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());

    const response = await apiClient.get<{
      success: boolean;
      data: {
        logs: UserLoginLog[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
    }>(`/admin/users/${userId}/login-logs?${queryParams.toString()}`);

    return {
      items: response.data.logs,
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.pageSize,
      totalPages: response.data.totalPages,
    };
  },

  getActiveUsers: async (params: {
    limit?: number;
    days?: number;
  } = {}): Promise<AdminUser[]> => {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.days) queryParams.set('days', params.days.toString());

    const response = await apiClient.get<{ success: boolean; data: { users: AdminUser[] } }>(`/admin/active-users?${queryParams.toString()}`);
    return response.data.users;
  },

  getLoginStats: async (days: number = 7): Promise<LoginStats> => {
    const response = await apiClient.get<{ success: boolean; data: LoginStats }>(`/admin/login-stats?days=${days}`);
    return response.data;
  },

  getStats: async (): Promise<AdminStats> => {
    const response = await apiClient.get<{ success: boolean; data: AdminStats }>('/admin/stats');
    return response.data;
  },

  getLogsStats: async (): Promise<{
    total: number;
    today: number;
    week: number;
    uniqueUsersToday: number;
    actionsByType: Array<{ action: string; count: number }>;
    loginToday: { success: number; failed: number };
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>('/admin/logs/stats');
    return response.data;
  },

  getLogs: async (params: {
    page?: number;
    pageSize?: number;
    userId?: string;
    username?: string;
    action?: string;
  } = {}): Promise<PaginatedResponse<{
    id: string;
    user_id: string | null;
    action: string;
    data: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: number;
    username: string | null;
  }>> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.userId) queryParams.set('userId', params.userId);
    if (params.username) queryParams.set('username', params.username);
    if (params.action) queryParams.set('action', params.action);

    const response = await apiClient.get<{
      success: boolean;
      data: {
        logs: Array<{
          id: string;
          user_id: string | null;
          action: string;
          data: string;
          ip_address: string | null;
          user_agent: string | null;
          created_at: number;
          username: string | null;
        }>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
    }>(`/admin/logs?${queryParams.toString()}`);

    return {
      items: response.data.logs,
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.pageSize,
      totalPages: response.data.totalPages,
    };
  },

  cleanup: async (): Promise<{
    oldPasswordResetLogs: number;
    oldActions: number;
    oldSecurityEvents: number;
  }> => {
    const response = await apiClient.post<{
      success: boolean;
      data: {
        oldPasswordResetLogs: number;
        oldActions: number;
        oldSecurityEvents: number;
      };
    }>('/admin/cleanup', {});
    return response.data;
  },

  getDashboardOverview: async (): Promise<{
    users: {
      total: number;
      active: number;
      newToday: number;
      newWeek: number;
      newMonth: number;
      activeToday: number;
    };
    sessions: {
      total: number;
      active: number;
      uniqueUsers: number;
    };
    actions: {
      total: number;
      uniqueUsers: number;
      today: number;
      week: number;
    };
    analytics: {
      total: number;
      uniqueUsers: number;
      uniqueSessions: number;
      today: number;
      week: number;
    };
    sources: {
      total: number;
      active: number;
      totalUsage: number;
    };
    searches: {
      total: number;
      uniqueUsers: number;
      today: number;
      week: number;
    };
    logins: {
      successToday: number;
      failedToday: number;
    };
    community: {
      posts: number;
      reviews: number;
      pendingReports: number;
    };
    recentActions: Array<{
      action: string;
      data: Record<string, unknown>;
      createdAt: number;
      username: string;
    }>;
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>('/admin/dashboard/overview');
    return response.data;
  },

  getDashboardTrends: async (days: number = 7): Promise<{
    userRegistrations: Array<{ date: string; count: number }>;
    dailyLogins: Array<{ date: string; total: number; success: number; failed: number }>;
    dailySearches: Array<{ date: string; count: number }>;
    dailyAnalytics: Array<{ date: string; count: number }>;
    dailyActiveUsers: Array<{ date: string; count: number }>;
    period: { days: number; startTime: number };
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>(`/admin/dashboard/trends?days=${days}`);
    return response.data;
  },

  getUserBehavior: async (days: number = 7): Promise<{
    actionsByType: Array<{ action: string; count: number }>;
    topActiveUsers: Array<{ id: string; username: string; email: string; action_count: number }>;
    hourlyActivity: Array<{ hour: string; count: number }>;
    weeklyActivity: Array<{ weekday: string; count: number }>;
    period: { days: number; startTime: number };
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>(`/admin/dashboard/user-behavior?days=${days}`);
    return response.data;
  },

  getSessionsStats: async (): Promise<{
    total: number;
    active: number;
    uniqueUsers: number;
    recentlyActive: number;
    todaySessions: number;
    deviceDistribution: Array<{ device_type: string; count: number }>;
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>('/admin/sessions/stats');
    return response.data;
  },

  getSessions: async (params: {
    page?: number;
    pageSize?: number;
    userId?: string;
    status?: string;
  } = {}): Promise<PaginatedResponse<{
    id: string;
    userId: string;
    username: string;
    email: string;
    ipAddress: string;
    userAgent: string;
    createdAt: number;
    lastActivity: number;
    expiresAt: number;
    isActive: boolean;
    expiresInSeconds: number;
  }>> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.userId) queryParams.set('userId', params.userId);
    if (params.status) queryParams.set('status', params.status);

    const response = await apiClient.get<{ success: boolean; data: any }>(`/admin/sessions?${queryParams.toString()}`);
    return {
      items: response.data.sessions,
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.pageSize,
      totalPages: response.data.totalPages,
    };
  },

  terminateSession: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`/admin/sessions/${sessionId}`);
  },

  getAnalyticsStats: async (days: number = 7): Promise<{
    totalEvents: number;
    uniqueUsers: number;
    uniqueSessions: number;
    eventsByType: Array<{ event_type: string; count: number }>;
    dailyEvents: Array<{ date: string; count: number }>;
    topReferers: Array<{ referer: string; count: number }>;
    hourlyDistribution: Array<{ hour: string; count: number }>;
    period: { days: number; startTime: number };
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>(`/admin/analytics/stats?days=${days}`);
    const data = response.data;
    return {
      totalEvents: data?.totalEvents ?? 0,
      uniqueUsers: data?.uniqueUsers ?? 0,
      uniqueSessions: data?.uniqueSessions ?? 0,
      eventsByType: data?.eventsByType ?? [],
      dailyEvents: data?.dailyEvents ?? [],
      topReferers: data?.topReferers ?? [],
      hourlyDistribution: data?.hourlyDistribution ?? [],
      period: data?.period ?? { days, startTime: Date.now() - days * 86400000 },
    };
  },

  getAnalyticsEvents: async (params: {
    page?: number;
    pageSize?: number;
    eventType?: string;
    userId?: string;
  } = {}): Promise<PaginatedResponse<{
    id: string;
    userId: string;
    username: string;
    sessionId: string;
    eventType: string;
    eventData: Record<string, unknown>;
    ipAddress: string;
    userAgent: string;
    referer: string;
    createdAt: number;
  }>> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.eventType) queryParams.set('eventType', params.eventType);
    if (params.userId) queryParams.set('userId', params.userId);

    const response = await apiClient.get<{ success: boolean; data: any }>(`/admin/analytics/events?${queryParams.toString()}`);
    return {
      items: response.data.events,
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.pageSize,
      totalPages: response.data.totalPages,
    };
  },

  getReports: async (params: {
    page?: number;
    pageSize?: number;
    status?: string;
  } = {}): Promise<PaginatedResponse<{
    id: string;
    post_id: string;
    title: string;
    post_type: string;
    reporter_user_id: string;
    reporter_username: string;
    report_reason: string;
    report_details: string | null;
    status: string;
    created_at: number;
  }>> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.status) queryParams.set('status', params.status);

    const response = await apiClient.get<{
      success: boolean;
      data: {
        reports: Array<{
          id: string;
          post_id: string;
          title: string;
          post_type: string;
          reporter_user_id: string;
          reporter_username: string;
          report_reason: string;
          report_details: string | null;
          status: string;
          created_at: number;
        }>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
    }>(`/admin/reports?${queryParams.toString()}`);

    return {
      items: response.data.reports,
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.pageSize,
      totalPages: response.data.totalPages,
    };
  },

  handleReport: async (reportId: string, data: {
    status: 'resolved' | 'dismissed';
    action?: string;
    notes?: string;
  }): Promise<void> => {
    await apiClient.put(`/admin/reports/${reportId}`, data);
  },

  // 系统观测（错误监控）
  getErrorStats: async (days: number = 7): Promise<{
    total: number;
    frontend: number;
    backend: number;
    today: number;
    week: number;
    uniqueErrors: number;
    byType: Array<{ error_type: string; count: number }>;
    topErrors: Array<{
      fingerprint: string;
      message: string;
      error_type: string;
      source: string;
      url: string | null;
      count: number;
      last_seen: number;
      first_seen: number;
    }>;
    dailyErrors: Array<{ date: string; count: number }>;
    period: { days: number; startTime: number };
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>(`/admin/errors/stats?days=${days}`);
    return response.data;
  },

  getErrors: async (params: {
    page?: number;
    pageSize?: number;
    source?: 'frontend' | 'backend';
    errorType?: string;
    fingerprint?: string;
    search?: string;
  } = {}): Promise<PaginatedResponse<{
    id: string;
    source: string;
    error_type: string;
    message: string;
    stack: string | null;
    url: string | null;
    line_number: number | null;
    column_number: number | null;
    user_id: string | null;
    session_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    fingerprint: string | null;
    created_at: number;
    username: string | null;
  }>> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.source) queryParams.set('source', params.source);
    if (params.errorType) queryParams.set('errorType', params.errorType);
    if (params.fingerprint) queryParams.set('fingerprint', params.fingerprint);
    if (params.search) queryParams.set('search', params.search);

    const response = await apiClient.get<{ success: boolean; data: any }>(`/admin/errors?${queryParams.toString()}`);
    return {
      items: response.data.errors,
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.pageSize,
      totalPages: response.data.totalPages,
    };
  },

  getErrorDetail: async (errorId: string): Promise<{
    error: any;
    related: Array<{ id: string; created_at: number; ip_address: string | null; user_agent: string | null }>;
  }> => {
    const response = await apiClient.get<{ success: boolean; data: any }>(`/admin/errors/${errorId}`);
    return response.data;
  },

  deleteError: async (errorId: string, byFingerprint: boolean = false): Promise<void> => {
    const query = byFingerprint ? '?byFingerprint=true' : '';
    await apiClient.delete(`/admin/errors/${errorId}${query}`);
  },
};

// ============================================================
// 数据存储管理
// ============================================================

export const dataStorageApi = {
  getStats: async (): Promise<DataStorageStats> => {
    const response = await apiClient.get<{ success: boolean; data: DataStorageStats }>(
      '/admin/data-storage/stats'
    );
    return response.data;
  },

  getTrends: async (days: number = 30): Promise<DataStorageTrends> => {
    const response = await apiClient.get<{ success: boolean; data: DataStorageTrends }>(
      `/admin/data-storage/trends?days=${days}`
    );
    return response.data;
  },

  getRecords: async (params: DataRecordsQuery = {}): Promise<PaginatedResponse<DataRecord>> => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.type) queryParams.set('type', params.type);
    if (params.status) queryParams.set('status', params.status);
    if (params.search) queryParams.set('search', params.search);

    const response = await apiClient.get<{ success: boolean; data: PaginatedResponse<DataRecord> }>(
      `/admin/data-storage/records?${queryParams.toString()}`
    );
    return response.data;
  },

  getRecord: async (id: string): Promise<DataRecordDetail> => {
    const response = await apiClient.get<{ success: boolean; data: DataRecordDetail }>(
      `/admin/data-storage/records/${id}`
    );
    return response.data;
  },

  updateRecordStatus: async (id: string, status: DataRecordStatus): Promise<void> => {
    await apiClient.put(`/admin/data-storage/records/${id}/status`, { status });
  },

  deleteRecord: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/data-storage/records/${id}`);
  },

  cleanup: async (): Promise<{ deleted: number }> => {
    const response = await apiClient.post<{ success: boolean; data: { deleted: number } }>(
      '/admin/data-storage/cleanup',
      {}
    );
    return response.data;
  },
};
