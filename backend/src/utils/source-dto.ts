/**
 * 搜索源域 DTO 映射：数据库 snake_case 行 → 前端 camelCase。
 *
 * 约束：isSystem 由 owner_id 派生，ownerId 保留原始归属，前端不得自行推断写权限。
 */
import type { MajorCategory, SearchSource, SearchSourceCategory } from '@/types';

/** 大类 DTO */
export function toMajorCategoryDto(row: MajorCategory) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    icon: row.icon || undefined,
    color: row.color,
    displayOrder: row.display_order,
    isSystem: row.owner_id === null,
    ownerId: row.owner_id,
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** 分类 DTO */
export function toCategoryDto(
  row: SearchSourceCategory & {
    major_category_name?: string | null;
    major_category_owner_id?: string | null;
    major_category_active?: number | null;
  }
) {
  return {
    id: row.id,
    majorCategoryId: row.major_category_id,
    majorCategoryName: row.major_category_name || undefined,
    majorCategoryOwnerId: row.major_category_owner_id ?? null,
    majorCategoryActive: row.major_category_active === undefined || row.major_category_active === null
      ? true
      : row.major_category_active === 1,
    name: row.name,
    description: row.description || '',
    icon: row.icon || undefined,
    color: row.color,
    defaultSearchable: row.default_searchable === 1,
    defaultSiteType: row.default_site_type,
    searchPriority: row.search_priority,
    displayOrder: row.display_order,
    isSystem: row.owner_id === null,
    ownerId: row.owner_id,
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** 搜索源 DTO */
export function toSourceDto(row: SearchSource) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    subtitle: row.subtitle || undefined,
    description: row.description || undefined,
    icon: row.icon || undefined,
    urlTemplate: row.url_template,
    homepageUrl: row.homepage_url || undefined,
    siteType: row.site_type,
    searchable: row.searchable === 1,
    searchPriority: row.search_priority,
    displayOrder: row.display_order,
    isSystem: row.owner_id === null,
    ownerId: row.owner_id,
    isActive: row.is_active === 1,
    usageCount: row.usage_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    status: 'active' as const,
  };
}
