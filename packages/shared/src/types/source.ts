/**
 * 源站域共享类型：源站、分类、大类、状态检测与用户个性化配置。
 *
 * 契约约束：字段需与 `schemas/sources` 对齐；用户配置缺失时按「启用」处理。
 */

/** 源站可用状态；unknown 表示尚未检测，与 error（检测失败）语义不同。 */
export type SourceStatus = 'active' | 'inactive' | 'error' | 'unknown';

/** 站点类型：search 支持关键词搜索，browse 仅可浏览，reference 为工具/参考站。 */
export type SiteType = 'search' | 'browse' | 'reference';

/** 源站定义；urlTemplate 中的 {keyword} 由搜索时替换。 */
export interface SearchSource {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  urlTemplate: string;
  homepageUrl?: string;
  categoryId: string;
  siteType: SiteType;
  searchable: boolean;
  searchPriority: number;
  status: SourceStatus;
  isActive: boolean;
  isSystem?: boolean;
  /** 非空表示当前用户私有源；系统源为 null */
  ownerId?: string | null;
  usageCount: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 子分类；defaultSiteType / defaultSearchable 作为新建源站的默认值。 */
export interface Category {
  id: string;
  name: string;
  description?: string;
  majorCategoryId: string;
  majorCategoryName?: string;
  /** 父大类归属：null 表示系统大类；用于用户源站分组展示 */
  majorCategoryOwnerId?: string | null;
  /** 父大类是否仍启用；停用后个人分类仍可由本人清理 */
  majorCategoryActive?: boolean;
  icon?: string;
  color?: string;
  defaultSearchable: boolean;
  defaultSiteType: SiteType;
  searchPriority: number;
  isActive: boolean;
  isSystem?: boolean;
  /** 非空表示当前用户私有分类；系统分类为 null */
  ownerId?: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  sources?: SearchSource[];
}

/** 大类，仅作为分类的上级分组。 */
export interface MajorCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  isActive: boolean;
  isSystem?: boolean;
  /** 非空表示当前用户私有大类；系统大类为 null */
  ownerId?: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  categories?: Category[];
}

/** 单次源站连通性检测结果；responseTime 单位为毫秒。 */
export interface SourceCheckResult {
  sourceId: string;
  status: SourceStatus;
  available: boolean;
  responseTime: number;
  checkedAt: string;
  error?: string;
}

/** 用户对源站的个性化配置；custom* 为空时回落到源站自身字段。 */
export interface UserSourceConfig {
  id: string;
  userId: string;
  sourceId: string;
  isEnabled: boolean;
  customPriority: number | null;
  customName: string | null;
  customSubtitle: string | null;
  customIcon: string | null;
  notes: string | null;
}

/** 源站管理页的统计聚合。 */
export interface SourceStats {
  totalSources: number;
  searchableSources: number;
  totalCategories: number;
  totalMajorCategories: number;
  topUsedSources: Array<{
    id: string;
    name: string;
    usageCount: number;
  }>;
  sourcesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
  }>;
  sourcesBySiteType: Array<{
    siteType: string;
    count: number;
  }>;
}

// 请求契约类型统一由 zod schema 推导
export type {
  CreateMajorCategoryRequest,
  UpdateMajorCategoryRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateSourceRequest,
  UpdateSourceRequest,
  BatchUpdateUserSourceConfigRequest,
} from '../schemas/sources';
export type { UpdateUserSourceConfigRequest } from '../schemas/user';