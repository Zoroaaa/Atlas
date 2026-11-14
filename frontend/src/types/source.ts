// API 契约类型 - 从共享包导入
import type { SiteType, UserSourceConfig, SearchSource, SourceStats } from '@codeseek/shared';

export type {
  SourceStatus,
  SiteType,
  SearchSource,
  Category,
  MajorCategory,
  SourceCheckResult,
  UserSourceConfig,
  SourceStats,
  CreateSourceRequest,
  UpdateSourceRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateMajorCategoryRequest,
  UpdateMajorCategoryRequest,
  UpdateUserSourceConfigRequest,
  BatchUpdateUserSourceConfigRequest,
} from '@codeseek/shared';

// 搜索 Tab 配置 - 单一数据源
export const TAB_IDS = ['jav', 'anime', 'movie', 'manga', 'novel', 'sources', 'community'] as const;
export type SearchTabType = typeof TAB_IDS[number];

// JAV 子搜索模式
export const JAV_SUB_MODES = ['code', 'actress', 'title'] as const;
export type JavSubMode = typeof JAV_SUB_MODES[number];

// Tab 配置接口 - 文本字段存储 i18n key,在消费端用 t(key) 解析
export interface TabConfig {
  id: SearchTabType;
  labelKey: string;       // 完整标签 i18n key,如 'tabs:jav.label'
  shortLabelKey: string;  // 简短标签 i18n key(移动端底部导航用),如 'tabs:jav.short'
  icon: string;
  gradient: string;
  majorCategoryId: string | null;
  placeholderKey: string; // 搜索框 placeholder i18n key
  descriptionKey: string; // Tab 描述 i18n key
  pinned?: boolean; // 是否常驻主导航,不设为 true 的进"更多"
}

/* ── 源看板（catalog 接口）契约 ── */

export interface SourceCatalogItem {
  id: string;
  categoryId: string;
  name: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  urlTemplate: string;
  homepageUrl?: string;
  siteType: SiteType;
  searchable: boolean;
  usageCount: number;
  isSystem: boolean;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  majorCategoryId?: string;
  majorCategoryName?: string;
  /** 无配置行视为启用，仅显式禁用为 false */
  enabled: boolean;
  userConfig: UserSourceConfig | null;
}

export interface SourceCatalogPage {
  items: SourceCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SourceCatalogParams {
  keyword?: string;
  majorCategoryId?: string;
  categoryId?: string;
  siteType?: string;
  searchable?: boolean;
  /** 范围：all / mine / enabled / searchable */
  scope?: 'all' | 'mine' | 'enabled' | 'searchable';
  /** 排序：default / name / usage */
  sort?: 'default' | 'name' | 'usage';
  page?: number;
  pageSize?: number;
}

export interface SourceDetailPayload {
  source: SearchSource & {
    categoryName?: string;
    categoryIcon?: string;
    categoryColor?: string;
    majorCategoryId?: string;
    majorCategoryName?: string;
  };
  categoryPath: Array<{ id: string; name: string; type: 'major' | 'category' }>;
  enabled: boolean;
  userConfig: UserSourceConfig | null;
  status: {
    status: string;
    available: boolean;
    responseTime: number;
    error: string | null;
    checkedAt: number;
  } | null;
}

export interface SourceBoardStats extends SourceStats {
  enabledSources?: number;
  availableSources?: number;
}