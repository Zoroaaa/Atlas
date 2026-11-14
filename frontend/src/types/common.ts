// API 契约类型 - 从共享包导入
export type {
  ApiError,
  ApiSuccess,
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
} from '@codeseek/shared';

// 前端专属管理/统计类型
export interface SystemStats {
  activeUsers: number;
  activeSources: number;
  totalSearches: number;
  activeUsersGrowthPercent?: number;
}

export interface AdminSystemStats {
  users: {
    total: number;
    active: number;
    verified: number;
    newThisWeek: number;
    dailyActive: number;
  };
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
  topKeywords: Array<{
    keyword: string;
    count: number;
  }>;
  topUsedSources: Array<{
    id: string;
    name: string;
    usageCount: number;
  }>;
}

export interface SystemConfig {
  appVersion: string;
  allowRegistration: boolean;
  minUsernameLength: number;
  maxUsernameLength: number;
  minPasswordLength: number;
  maxPasswordLength: number;
  maxFavoritesPerUser: number;
  maxHistoryPerUser: number;
  maxTagsPerUser: number;
  enableActionLogging: boolean;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  target: string;
  details: string;
  ip: string;
  createdAt: string;
}

export interface Report {
  id: string;
  sharedSourceId: string;
  sharedSourceName: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  details?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

// 请求契约类型统一由 zod schema 推导
export type { UpdateUserStatusRequest, HandleReportRequest } from '@codeseek/shared';
export type { AnalyticsEvent } from '@codeseek/shared';

// 前端定义了 recordAction 调用但没有任何调用点，schema 留在后端
export interface RecordActionRequest {
  userId?: string;
  action: string;
  data?: unknown;
}

export interface AnalyticsStats {
  totalEvents: number;
  uniqueUsers: number;
  uniqueSessions: number;
  eventsByType: Array<{
    eventType: string;
    count: number;
  }>;
  dailyStats: Array<{
    date: string;
    events: number;
    users: number;
  }>;
}