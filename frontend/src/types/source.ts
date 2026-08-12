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

// 搜索 Tab 配置 - 单一数据源
export const TAB_IDS = ['jav', 'anime', 'movie', 'manga', 'novel', 'sources', 'community'] as const;
export type SearchTabType = typeof TAB_IDS[number];

// JAV 子搜索模式
export const JAV_SUB_MODES = ['code', 'actress', 'title'] as const;
export type JavSubMode = typeof JAV_SUB_MODES[number];

// Tab 配置接口
export interface TabConfig {
  id: SearchTabType;
  label: string;
  icon: string;
  gradient: string;
  majorCategoryId: string | null;
  placeholder: string;
  description: string;
  pinned?: boolean; // 是否常驻主导航,不设为 true 的进"更多"
}

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
  searchable?: boolean;
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
}

export interface UpdateMajorCategoryRequest {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
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