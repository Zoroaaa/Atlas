/**
 * 搜索源树服务：系统树与用户私有树的组装、归属校验、数量限制与写操作编排。
 *
 * 约束：管理员只能写 owner_id IS NULL 的系统数据；用户只能写 owner_id = 自己 的私有数据，
 * 任何跨归属读写都必须在进入仓储层之前被拒绝。
 */
import type { MajorCategory, SearchSource, SearchSourceCategory, UserSearchSourceConfig } from '@/types';
import { generateId } from '@/utils';
import { VALIDATION_RULES } from '@/constants';
import {
  listSystemMajorCategories,
  listSystemCategories,
  listUserMajorCategories,
  listUserCategories,
  listUserSources,
  listSystemSourcesWithConfig,
  bumpSystemSourceRevision,
  bumpUserSourceRevision,
} from '@/repositories/search-source-repository';
import {
  findMajorCategoryById,
  findSourceCategoryById,
  findSearchSourceById,
  countUserMajorCategories,
  countUserCategories,
  countUserSources,
  countCategoriesUnderMajor,
  countSourcesUnderCategory,
  listSystemTreeCategories,
  listSystemTreeSources,
  getSystemSourceStats,
  getUserSourceStats,
  findDuplicateMajorCategory,
  findDuplicateCategory,
  findDuplicateSource,
  insertMajorCategory,
  updateMajorCategory,
  softDeleteMajorCategory,
  insertSourceCategory,
  updateSourceCategory,
  softDeleteSourceCategory,
  insertSearchSource,
  updateSearchSource,
  softDeleteSearchSource,
} from '@/repositories/search-source-management-repository';

const R = VALIDATION_RULES;

/** 领域错误：由路由层映射为统一 HTTP 响应 */
export class SourceTreeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 403 | 404 = 400
  ) {
    super(message);
    this.name = 'SourceTreeError';
  }
}

// ── 树读取 ───────────────────────────────────────────

export interface SystemSourceTree {
  majorCategories: MajorCategory[];
  categories: Array<SearchSourceCategory & { major_category_name: string | null }>;
  sources: SearchSource[];
}

/** 系统树：管理后台与搜索页筛选共用，只包含系统数据 */
export async function getSystemTree(db: D1Database): Promise<SystemSourceTree> {
  const [majorCategories, categories, sources] = await Promise.all([
    listSystemMajorCategories(db),
    listSystemTreeCategories(db),
    listSystemTreeSources(db),
  ]);
  return { majorCategories, categories, sources };
}

export interface UserSourceTree {
  system: {
    majorCategories: MajorCategory[];
    categories: Array<SearchSourceCategory & { major_category_name: string | null }>;
    sources: Array<SearchSource & { enabled: boolean; userConfig: UserSearchSourceConfig | null }>;
  };
  mine: {
    majorCategories: MajorCategory[];
    categories: Array<SearchSourceCategory & {
      major_category_name: string | null;
      major_category_owner_id: string | null;
      major_category_active: number | null;
    }>;
    sources: SearchSource[];
  };
  stats: Awaited<ReturnType<typeof getUserSourceStats>>;
}

/** 用户源站页：系统树（含启用状态）+ 个人私有树 */
export async function getUserTree(db: D1Database, userId: string): Promise<UserSourceTree> {
  const [systemMajors, systemCategories, systemSources, myMajors, myCategories, mySources, stats] =
    await Promise.all([
      listSystemMajorCategories(db),
      listSystemCategories(db),
      listSystemSourcesWithConfig(db, userId),
      listUserMajorCategories(db, userId),
      listUserCategories(db, userId),
      listUserSources(db, userId),
      getUserSourceStats(db, userId),
    ]);

  return {
    system: {
      majorCategories: systemMajors,
      categories: systemCategories,
      sources: systemSources,
    },
    mine: {
      majorCategories: myMajors,
      categories: myCategories,
      sources: mySources,
    },
    stats,
  };
}

/** 管理后台系统统计 */
export function getSystemStats(db: D1Database) {
  return getSystemSourceStats(db);
}

// ── 归属校验 ─────────────────────────────────────────

function assertUserOwns(row: { owner_id: string | null }, userId: string, label: string): void {
  if (row.owner_id !== userId) {
    throw new SourceTreeError('FORBIDDEN', `无权操作他人${label}`, 403);
  }
}

function assertSystemOwned(row: { owner_id: string | null }, label: string): void {
  if (row.owner_id !== null) {
    throw new SourceTreeError('FORBIDDEN', `${label}不属于系统数据`, 403);
  }
}

/** 用户分类允许挂在系统大类或自己的大类下 */
async function assertUserCategoryParent(db: D1Database, majorCategoryId: string, userId: string): Promise<MajorCategory> {
  const major = await findMajorCategoryById(db, majorCategoryId);
  if (!major || !major.is_active) {
    throw new SourceTreeError('NOT_FOUND', '大类不存在', 404);
  }
  if (major.owner_id !== null && major.owner_id !== userId) {
    throw new SourceTreeError('FORBIDDEN', '无权在他人的大类下创建分类', 403);
  }
  return major;
}

/** 系统分类只能挂在系统大类下 */
async function assertSystemCategoryParent(db: D1Database, majorCategoryId: string): Promise<MajorCategory> {
  const major = await findMajorCategoryById(db, majorCategoryId);
  if (!major || !major.is_active) {
    throw new SourceTreeError('NOT_FOUND', '大类不存在', 404);
  }
  if (major.owner_id !== null) {
    throw new SourceTreeError('FORBIDDEN', '系统分类只能挂在系统大类下', 403);
  }
  return major;
}

/** 用户源只能挂在自己的分类下 */
async function assertUserSourceCategory(db: D1Database, categoryId: string, userId: string): Promise<SearchSourceCategory> {
  const category = await findSourceCategoryById(db, categoryId);
  if (!category || !category.is_active) {
    throw new SourceTreeError('NOT_FOUND', '分类不存在', 404);
  }
  if (category.owner_id !== userId) {
    throw new SourceTreeError('FORBIDDEN', '搜索源只能挂在自己的分类下', 403);
  }
  return category;
}

/** 系统源只能挂在系统分类下 */
async function assertSystemSourceCategory(db: D1Database, categoryId: string): Promise<SearchSourceCategory> {
  const category = await findSourceCategoryById(db, categoryId);
  if (!category || !category.is_active) {
    throw new SourceTreeError('NOT_FOUND', '分类不存在', 404);
  }
  if (category.owner_id !== null) {
    throw new SourceTreeError('FORBIDDEN', '系统搜索源只能挂在系统分类下', 403);
  }
  return category;
}

// ── 写操作输入 ───────────────────────────────────────

export interface MajorCategoryInput {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface CategoryInput {
  majorCategoryId: string;
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  defaultSearchable?: boolean;
  defaultSiteType?: string;
  searchPriority?: number;
  displayOrder?: number;
  isActive?: boolean;
}

export interface SourceInput {
  categoryId: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  icon?: string;
  urlTemplate: string;
  homepageUrl?: string | null;
  searchable?: boolean;
  searchPriority?: number;
  displayOrder?: number;
  isActive?: boolean;
}

// ── 用户私有树写操作 ─────────────────────────────────

/** 创建个人大类 */
export async function createUserMajorCategory(
  db: D1Database,
  userId: string,
  input: MajorCategoryInput
): Promise<MajorCategory> {
  const total = await countUserMajorCategories(db, userId);
  if (total >= R.USER_SOURCE_TREE.MAX_MAJOR_CATEGORIES) {
    throw new SourceTreeError('VALIDATION_ERROR', `个人大类最多${R.USER_SOURCE_TREE.MAX_MAJOR_CATEGORIES}个`);
  }
  const name = input.name.trim();
  if (await findDuplicateMajorCategory(db, userId, name)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '大类名称已存在');
  }

  const id = generateId();
  const now = Date.now();
  await insertMajorCategory(db, {
    id,
    name,
    description: input.description?.trim() || '',
    icon: input.icon?.trim() || '🌟',
    color: input.color?.trim() || '#6b7280',
    displayOrder: input.displayOrder ?? 0,
    ownerId: userId,
    now,
  });
  await bumpUserSourceRevision(db, userId);

  const created = await findMajorCategoryById(db, id);
  if (!created) throw new SourceTreeError('SERVER_ERROR', '创建大类失败');
  return created;
}

/** 更新个人大类 */
export async function updateUserMajorCategory(
  db: D1Database,
  userId: string,
  id: string,
  input: Partial<MajorCategoryInput>
): Promise<void> {
  const existing = await findMajorCategoryById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '大类不存在', 404);
  assertUserOwns(existing, userId, '大类');

  const nextName = input.name?.trim();
  if (nextName !== undefined && await findDuplicateMajorCategory(db, userId, nextName, id)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '大类名称已存在');
  }

  await updateMajorCategory(db, id, {
    name: nextName,
    description: input.description?.trim(),
    icon: input.icon?.trim(),
    color: input.color,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
  }, Date.now());
  await bumpUserSourceRevision(db, userId);
}

/** 删除个人大类；仍有分类时拒绝，避免产生孤立节点 */
export async function deleteUserMajorCategory(db: D1Database, userId: string, id: string): Promise<void> {
  const existing = await findMajorCategoryById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '大类不存在', 404);
  assertUserOwns(existing, userId, '大类');

  const childCount = await countCategoriesUnderMajor(db, id, userId);
  if (childCount > 0) {
    throw new SourceTreeError('VALIDATION_ERROR', '该大类下还有分类，无法删除');
  }

  await softDeleteMajorCategory(db, id, Date.now());
  await bumpUserSourceRevision(db, userId);
}

/** 创建个人分类（可挂在系统大类下） */
export async function createUserCategory(
  db: D1Database,
  userId: string,
  input: CategoryInput
): Promise<SearchSourceCategory> {
  const total = await countUserCategories(db, userId);
  if (total >= R.USER_SOURCE_TREE.MAX_CATEGORIES) {
    throw new SourceTreeError('VALIDATION_ERROR', `个人分类最多${R.USER_SOURCE_TREE.MAX_CATEGORIES}个`);
  }
  await assertUserCategoryParent(db, input.majorCategoryId, userId);
  const name = input.name.trim();
  if (await findDuplicateCategory(db, userId, input.majorCategoryId, name)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '分类名称已存在');
  }

  const id = generateId();
  const now = Date.now();
  await insertSourceCategory(db, {
    id,
    majorCategoryId: input.majorCategoryId,
    name,
    description: input.description?.trim() || '',
    icon: input.icon?.trim() || '📁',
    color: input.color?.trim() || '#3b82f6',
    displayOrder: input.displayOrder ?? 0,
    defaultSearchable: input.defaultSearchable !== false,
    defaultSiteType: input.defaultSiteType || 'search',
    searchPriority: Math.min(Math.max(input.searchPriority ?? 5, 1), 10),
    ownerId: userId,
    now,
  });
  await bumpUserSourceRevision(db, userId);

  const created = await findSourceCategoryById(db, id);
  if (!created) throw new SourceTreeError('SERVER_ERROR', '创建分类失败');
  return created;
}

/** 更新个人分类 */
export async function updateUserCategory(
  db: D1Database,
  userId: string,
  id: string,
  input: Partial<CategoryInput>
): Promise<void> {
  const existing = await findSourceCategoryById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '分类不存在', 404);
  assertUserOwns(existing, userId, '分类');

  const nextMajorId = input.majorCategoryId ?? existing.major_category_id;
  if (input.majorCategoryId !== undefined) {
    await assertUserCategoryParent(db, input.majorCategoryId, userId);
  }
  const nextName = input.name?.trim();
  if (nextName !== undefined && await findDuplicateCategory(db, userId, nextMajorId, nextName, id)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '分类名称已存在');
  }

  await updateSourceCategory(db, id, {
    majorCategoryId: input.majorCategoryId,
    name: nextName,
    description: input.description?.trim(),
    icon: input.icon?.trim(),
    color: input.color,
    defaultSearchable: input.defaultSearchable,
    defaultSiteType: input.defaultSiteType,
    searchPriority: input.searchPriority,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
  }, Date.now());
  await bumpUserSourceRevision(db, userId);
}

/** 删除个人分类；仍有源时拒绝 */
export async function deleteUserCategory(db: D1Database, userId: string, id: string): Promise<void> {
  const existing = await findSourceCategoryById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '分类不存在', 404);
  assertUserOwns(existing, userId, '分类');

  const childCount = await countSourcesUnderCategory(db, id, userId);
  if (childCount > 0) {
    throw new SourceTreeError('VALIDATION_ERROR', '该分类下还有搜索源，无法删除');
  }

  await softDeleteSourceCategory(db, id, Date.now());
  await bumpUserSourceRevision(db, userId);
}

/** 创建个人搜索源 */
export async function createUserSource(
  db: D1Database,
  userId: string,
  input: SourceInput
): Promise<SearchSource> {
  const total = await countUserSources(db, userId);
  if (total >= R.USER_SOURCE_TREE.MAX_SOURCES) {
    throw new SourceTreeError('VALIDATION_ERROR', `个人搜索源最多${R.USER_SOURCE_TREE.MAX_SOURCES}个`);
  }
  const category = await assertUserSourceCategory(db, input.categoryId, userId);
  const name = input.name.trim();
  if (await findDuplicateSource(db, userId, input.categoryId, name)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '搜索源名称已存在');
  }

  const id = generateId();
  const now = Date.now();
  await insertSearchSource(db, {
    id,
    categoryId: input.categoryId,
    name,
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    icon: input.icon?.trim() || '🔍',
    urlTemplate: input.urlTemplate.trim(),
    homepageUrl: input.homepageUrl?.trim() || null,
    siteType: category.default_site_type || 'search',
    searchable: input.searchable !== false,
    searchPriority: Math.min(Math.max(input.searchPriority ?? 5, 1), 10),
    ownerId: userId,
    now,
  });
  await bumpUserSourceRevision(db, userId);

  const created = await findSearchSourceById(db, id);
  if (!created) throw new SourceTreeError('SERVER_ERROR', '创建搜索源失败');
  return created;
}

/** 更新个人搜索源 */
export async function updateUserSource(
  db: D1Database,
  userId: string,
  id: string,
  input: Partial<SourceInput>
): Promise<void> {
  const existing = await findSearchSourceById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '搜索源不存在', 404);
  assertUserOwns(existing, userId, '搜索源');

  if (input.categoryId !== undefined && input.categoryId !== existing.category_id) {
    await assertUserSourceCategory(db, input.categoryId, userId);
  }
  const nextCategoryId = input.categoryId ?? existing.category_id;
  const nextName = input.name?.trim();
  if (nextName !== undefined && await findDuplicateSource(db, userId, nextCategoryId, nextName, id)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '搜索源名称已存在');
  }

  await updateSearchSource(db, id, {
    categoryId: input.categoryId,
    name: nextName,
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    icon: input.icon?.trim(),
    urlTemplate: input.urlTemplate?.trim(),
    homepageUrl: input.homepageUrl?.trim() || null,
    searchable: input.searchable,
    searchPriority: input.searchPriority,
    isActive: input.isActive,
  }, Date.now());
  await bumpUserSourceRevision(db, userId);
}

/** 删除个人搜索源 */
export async function deleteUserSource(db: D1Database, userId: string, id: string): Promise<void> {
  const existing = await findSearchSourceById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '搜索源不存在', 404);
  assertUserOwns(existing, userId, '搜索源');

  await softDeleteSearchSource(db, id, Date.now());
  await bumpUserSourceRevision(db, userId);
}

// ── 系统树写操作 ─────────────────────────────────────

/** 创建系统大类 */
export async function createSystemMajorCategory(db: D1Database, input: MajorCategoryInput): Promise<MajorCategory> {
  const name = input.name.trim();
  if (await findDuplicateMajorCategory(db, null, name)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '大类名称已存在');
  }
  const id = generateId();
  const now = Date.now();
  await insertMajorCategory(db, {
    id,
    name,
    description: input.description?.trim() || '',
    icon: input.icon?.trim() || '🌟',
    color: input.color?.trim() || '#6b7280',
    displayOrder: input.displayOrder ?? 0,
    ownerId: null,
    now,
  });
  await bumpSystemSourceRevision(db);
  const created = await findMajorCategoryById(db, id);
  if (!created) throw new SourceTreeError('SERVER_ERROR', '创建大类失败');
  return created;
}

/** 更新系统大类 */
export async function updateSystemMajorCategory(
  db: D1Database,
  id: string,
  input: Partial<MajorCategoryInput>
): Promise<void> {
  const existing = await findMajorCategoryById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '大类不存在', 404);
  assertSystemOwned(existing, '大类');
  const nextName = input.name?.trim();
  if (nextName !== undefined && await findDuplicateMajorCategory(db, null, nextName, id)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '大类名称已存在');
  }
  await updateMajorCategory(db, id, {
    name: nextName,
    description: input.description?.trim(),
    icon: input.icon?.trim(),
    color: input.color,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
  }, Date.now());
  await bumpSystemSourceRevision(db);
}

/** 删除系统大类；只统计系统分类，用户私有分类不会阻塞管理员 */
export async function deleteSystemMajorCategory(db: D1Database, id: string): Promise<void> {
  const existing = await findMajorCategoryById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '大类不存在', 404);
  assertSystemOwned(existing, '大类');

  const childCount = await countCategoriesUnderMajor(db, id, null);
  if (childCount > 0) {
    throw new SourceTreeError('VALIDATION_ERROR', '该大类下还有系统分类，无法删除');
  }
  await softDeleteMajorCategory(db, id, Date.now());
  await bumpSystemSourceRevision(db);
}

/** 创建系统分类 */
export async function createSystemCategory(db: D1Database, input: CategoryInput): Promise<SearchSourceCategory> {
  await assertSystemCategoryParent(db, input.majorCategoryId);
  const name = input.name.trim();
  if (await findDuplicateCategory(db, null, input.majorCategoryId, name)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '分类名称已存在');
  }
  const id = generateId();
  const now = Date.now();
  await insertSourceCategory(db, {
    id,
    majorCategoryId: input.majorCategoryId,
    name,
    description: input.description?.trim() || '',
    icon: input.icon?.trim() || '📁',
    color: input.color?.trim() || '#3b82f6',
    displayOrder: input.displayOrder ?? 0,
    defaultSearchable: input.defaultSearchable !== false,
    defaultSiteType: input.defaultSiteType || 'search',
    searchPriority: Math.min(Math.max(input.searchPriority ?? 5, 1), 10),
    ownerId: null,
    now,
  });
  await bumpSystemSourceRevision(db);
  const created = await findSourceCategoryById(db, id);
  if (!created) throw new SourceTreeError('SERVER_ERROR', '创建分类失败');
  return created;
}

/** 更新系统分类 */
export async function updateSystemCategory(
  db: D1Database,
  id: string,
  input: Partial<CategoryInput>
): Promise<void> {
  const existing = await findSourceCategoryById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '分类不存在', 404);
  assertSystemOwned(existing, '分类');
  if (input.majorCategoryId !== undefined) {
    await assertSystemCategoryParent(db, input.majorCategoryId);
  }
  const nextMajorId = input.majorCategoryId ?? existing.major_category_id;
  const nextName = input.name?.trim();
  if (nextName !== undefined && await findDuplicateCategory(db, null, nextMajorId, nextName, id)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '分类名称已存在');
  }
  await updateSourceCategory(db, id, {
    majorCategoryId: input.majorCategoryId,
    name: nextName,
    description: input.description?.trim(),
    icon: input.icon?.trim(),
    color: input.color,
    defaultSearchable: input.defaultSearchable,
    defaultSiteType: input.defaultSiteType,
    searchPriority: input.searchPriority,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
  }, Date.now());
  await bumpSystemSourceRevision(db);
}

/** 删除系统分类；只统计系统源 */
export async function deleteSystemCategory(db: D1Database, id: string): Promise<void> {
  const existing = await findSourceCategoryById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '分类不存在', 404);
  assertSystemOwned(existing, '分类');

  const childCount = await countSourcesUnderCategory(db, id, null);
  if (childCount > 0) {
    throw new SourceTreeError('VALIDATION_ERROR', '该分类下还有系统搜索源，无法删除');
  }
  await softDeleteSourceCategory(db, id, Date.now());
  await bumpSystemSourceRevision(db);
}

/** 创建系统搜索源 */
export async function createSystemSource(db: D1Database, input: SourceInput): Promise<SearchSource> {
  const category = await assertSystemSourceCategory(db, input.categoryId);
  const name = input.name.trim();
  if (await findDuplicateSource(db, null, input.categoryId, name)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '搜索源名称已存在');
  }
  const id = generateId();
  const now = Date.now();
  await insertSearchSource(db, {
    id,
    categoryId: input.categoryId,
    name,
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    icon: input.icon?.trim() || '🔍',
    urlTemplate: input.urlTemplate.trim(),
    homepageUrl: input.homepageUrl?.trim() || null,
    siteType: category.default_site_type || 'search',
    searchable: input.searchable !== false,
    searchPriority: Math.min(Math.max(input.searchPriority ?? 5, 1), 10),
    ownerId: null,
    now,
  });
  await bumpSystemSourceRevision(db);
  const created = await findSearchSourceById(db, id);
  if (!created) throw new SourceTreeError('SERVER_ERROR', '创建搜索源失败');
  return created;
}

/** 更新系统搜索源 */
export async function updateSystemSource(
  db: D1Database,
  id: string,
  input: Partial<SourceInput>
): Promise<void> {
  const existing = await findSearchSourceById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '搜索源不存在', 404);
  assertSystemOwned(existing, '搜索源');

  if (input.categoryId !== undefined && input.categoryId !== existing.category_id) {
    await assertSystemSourceCategory(db, input.categoryId);
  }
  const nextCategoryId = input.categoryId ?? existing.category_id;
  const nextName = input.name?.trim();
  if (nextName !== undefined && await findDuplicateSource(db, null, nextCategoryId, nextName, id)) {
    throw new SourceTreeError('DUPLICATE_ERROR', '搜索源名称已存在');
  }
  await updateSearchSource(db, id, {
    categoryId: input.categoryId,
    name: nextName,
    subtitle: input.subtitle?.trim() || null,
    description: input.description?.trim() || null,
    icon: input.icon?.trim(),
    urlTemplate: input.urlTemplate?.trim(),
    homepageUrl: input.homepageUrl?.trim() || null,
    searchable: input.searchable,
    searchPriority: input.searchPriority,
    isActive: input.isActive,
  }, Date.now());
  await bumpSystemSourceRevision(db);
}

/** 删除系统搜索源 */
export async function deleteSystemSource(db: D1Database, id: string): Promise<void> {
  const existing = await findSearchSourceById(db, id);
  if (!existing || !existing.is_active) throw new SourceTreeError('NOT_FOUND', '搜索源不存在', 404);
  assertSystemOwned(existing, '搜索源');
  await softDeleteSearchSource(db, id, Date.now());
  await bumpSystemSourceRevision(db);
}
