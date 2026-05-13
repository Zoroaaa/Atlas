// API 契约类型 - 从共享包导入
export type {
  SourceStatus,
  SiteType,
  SearchSource,
  Category,
  MajorCategory,
  SourceCheckResult,
  UserSourceConfig,
  SourceStats,
} from '@codeseek/shared';

// 前端专属请求类型
export interface CreateSourceRequest {
  categoryId: string;
  name: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  urlTemplate: string;
  homepageUrl?: string;
  siteType?: import('@codeseek/shared').SiteType;
  searchable?: boolean;
  requiresKeyword?: boolean;
  searchPriority?: number;
}

export interface UpdateSourceRequest {
  categoryId?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  urlTemplate?: string;
  homepageUrl?: string;
  siteType?: import('@codeseek/shared').SiteType;
  searchable?: boolean;
  requiresKeyword?: boolean;
  searchPriority?: number;
}

export interface CreateCategoryRequest {
  majorCategoryId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  defaultSearchable?: boolean;
  defaultSiteType?: import('@codeseek/shared').SiteType;
  searchPriority?: number;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  defaultSearchable?: boolean;
  defaultSiteType?: import('@codeseek/shared').SiteType;
  searchPriority?: number;
}

export interface CreateMajorCategoryRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  requiresKeyword?: boolean;
}

export interface UpdateMajorCategoryRequest {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  requiresKeyword?: boolean;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateUserSourceConfigRequest {
  isEnabled?: boolean;
  customPriority?: number;
  customName?: string;
  customSubtitle?: string;
  customIcon?: string;
  notes?: string;
}

export interface BatchUpdateUserSourceConfigRequest {
  configs: Array<{
    sourceId: string;
    isEnabled?: boolean;
    customPriority?: number;
    customName?: string;
    customSubtitle?: string;
    customIcon?: string;
    notes?: string;
  }>;
}