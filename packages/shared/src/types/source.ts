export type SourceStatus = 'active' | 'inactive' | 'error' | 'unknown';

export type SiteType = 'search' | 'browse' | 'reference';

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
  requiresKeyword: boolean;
  searchPriority: number;
  status: SourceStatus;
  isActive: boolean;
  isSystem?: boolean;
  usageCount: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  majorCategoryId: string;
  majorCategoryName?: string;
  icon?: string;
  color?: string;
  defaultSearchable: boolean;
  defaultSiteType: SiteType;
  searchPriority: number;
  isActive: boolean;
  isSystem?: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  sources?: SearchSource[];
}

export interface MajorCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  requiresKeyword: boolean;
  isActive: boolean;
  isSystem?: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  categories?: Category[];
}

export interface SourceCheckResult {
  sourceId: string;
  status: SourceStatus;
  available: boolean;
  responseTime: number;
  checkedAt: string;
  error?: string;
}

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