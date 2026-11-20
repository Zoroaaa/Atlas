/**
 * 搜索源管理数据访问层：系统树与用户私有树的增删改、重复校验与数量统计。
 *
 * 约束：所有写操作必须显式携带 owner 作用域；系统数据 owner_id IS NULL，
 * 用户数据 owner_id = userId，不允许在同一查询里混用。
 */
import type { MajorCategory, SearchSource, SearchSourceCategory } from '@/types';

// ── 查询 ─────────────────────────────────────────────

/** 按 id 读取大类（包含停用记录，供写操作校验归属） */
export async function findMajorCategoryById(db: D1Database, id: string): Promise<MajorCategory | null> {
  return db.prepare('SELECT * FROM search_major_categories WHERE id = ?').bind(id).first<MajorCategory>();
}

/** 按 id 读取分类（包含停用记录，供写操作校验归属） */
export async function findSourceCategoryById(db: D1Database, id: string): Promise<SearchSourceCategory | null> {
  return db.prepare('SELECT * FROM search_source_categories WHERE id = ?').bind(id).first<SearchSourceCategory>();
}

/** 按 id 读取搜索源（包含停用记录，供写操作校验归属） */
export async function findSearchSourceById(db: D1Database, id: string): Promise<SearchSource | null> {
  return db.prepare('SELECT * FROM search_sources WHERE id = ?').bind(id).first<SearchSource>();
}

/** 统计用户私有大类数量 */
export async function countUserMajorCategories(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM search_major_categories WHERE owner_id = ? AND is_active = 1')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 统计用户私有分类数量 */
export async function countUserCategories(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM search_source_categories WHERE owner_id = ? AND is_active = 1')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 统计用户私有源数量 */
export async function countUserSources(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM search_sources WHERE owner_id = ? AND is_active = 1')
    .bind(userId)
    .first<{ count: number }>();
  return row?.count || 0;
}

/** 统计大类下的有效分类数量（可按归属过滤） */
export async function countCategoriesUnderMajor(
  db: D1Database,
  majorCategoryId: string,
  ownerId: string | null
): Promise<number> {
  const ownerClause = ownerId === null ? 'owner_id IS NULL' : 'owner_id = ?';
  const stmt = db
    .prepare(
      `SELECT COUNT(*) AS count FROM search_source_categories
       WHERE major_category_id = ? AND is_active = 1 AND ${ownerClause}`
    )
    .bind(...(ownerId === null ? [majorCategoryId] : [majorCategoryId, ownerId]));
  const row = await stmt.first<{ count: number }>();
  return row?.count || 0;
}

/** 统计分类下的有效源数量（可按归属过滤） */
export async function countSourcesUnderCategory(
  db: D1Database,
  categoryId: string,
  ownerId: string | null
): Promise<number> {
  const ownerClause = ownerId === null ? 'owner_id IS NULL' : 'owner_id = ?';
  const stmt = db
    .prepare(
      `SELECT COUNT(*) AS count FROM search_sources
       WHERE category_id = ? AND is_active = 1 AND ${ownerClause}`
    )
    .bind(...(ownerId === null ? [categoryId] : [categoryId, ownerId]));
  const row = await stmt.first<{ count: number }>();
  return row?.count || 0;
}

/** 系统树全部分类（管理后台使用，不返回用户私有分类） */
export async function listSystemTreeCategories(
  db: D1Database
): Promise<Array<SearchSourceCategory & { major_category_name: string | null }>> {
  const rows = await db
    .prepare(
      `SELECT c.*, mc.name AS major_category_name
       FROM search_source_categories c
       INNER JOIN search_major_categories mc ON c.major_category_id = mc.id
       WHERE c.owner_id IS NULL AND mc.owner_id IS NULL
         AND c.is_active = 1 AND mc.is_active = 1
       ORDER BY mc.display_order ASC, c.display_order ASC`
    )
    .all<SearchSourceCategory & { major_category_name: string | null }>();
  return rows.results || [];
}

/** 系统树全部搜索源（管理后台使用，不返回用户私有源） */
export async function listSystemTreeSources(db: D1Database): Promise<SearchSource[]> {
  const rows = await db
    .prepare(
      `SELECT s.* FROM search_sources s
       INNER JOIN search_source_categories c ON s.category_id = c.id
       INNER JOIN search_major_categories m ON c.major_category_id = m.id
       WHERE s.owner_id IS NULL AND c.owner_id IS NULL AND m.owner_id IS NULL
         AND s.is_active = 1 AND c.is_active = 1 AND m.is_active = 1
       ORDER BY m.display_order ASC, c.display_order ASC, s.search_priority DESC, s.display_order ASC`
    )
    .all<SearchSource>();
  return rows.results || [];
}

/** 系统大类统计 */
export async function getSystemSourceStats(db: D1Database): Promise<{
  totalMajorCategories: number;
  totalCategories: number;
  totalSources: number;
  searchableSources: number;
}> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM search_major_categories WHERE owner_id IS NULL AND is_active = 1) AS totalMajorCategories,
         (SELECT COUNT(*) FROM search_source_categories WHERE owner_id IS NULL AND is_active = 1) AS totalCategories,
         (SELECT COUNT(*) FROM search_sources WHERE owner_id IS NULL AND is_active = 1) AS totalSources,
         (SELECT COUNT(*) FROM search_sources WHERE owner_id IS NULL AND is_active = 1 AND searchable = 1) AS searchableSources`
    )
    .first<{
      totalMajorCategories: number;
      totalCategories: number;
      totalSources: number;
      searchableSources: number;
    }>();
  return row || { totalMajorCategories: 0, totalCategories: 0, totalSources: 0, searchableSources: 0 };
}

/** 用户源统计：个人树数量 + 系统源启用数量 */
export async function getUserSourceStats(
  db: D1Database,
  userId: string
): Promise<{
  myMajorCategories: number;
  myCategories: number;
  mySources: number;
  systemSources: number;
  enabledSystemSources: number;
}> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM search_major_categories WHERE owner_id = ? AND is_active = 1) AS myMajorCategories,
         (SELECT COUNT(*) FROM search_source_categories WHERE owner_id = ? AND is_active = 1) AS myCategories,
         (SELECT COUNT(*) FROM search_sources WHERE owner_id = ? AND is_active = 1) AS mySources,
         (SELECT COUNT(*) FROM search_sources s
          INNER JOIN search_source_categories c ON s.category_id = c.id
          INNER JOIN search_major_categories m ON c.major_category_id = m.id
          WHERE s.owner_id IS NULL AND s.is_active = 1 AND c.is_active = 1 AND m.is_active = 1) AS systemSources,
         (SELECT COUNT(*) FROM search_sources s
          INNER JOIN search_source_categories c ON s.category_id = c.id
          INNER JOIN search_major_categories m ON c.major_category_id = m.id
          WHERE s.owner_id IS NULL AND s.is_active = 1 AND c.is_active = 1 AND m.is_active = 1
            AND NOT EXISTS (
              SELECT 1 FROM user_search_source_configs u
              WHERE u.user_id = ? AND u.source_id = s.id AND u.is_enabled = 0
            )) AS enabledSystemSources`
    )
    .bind(userId, userId, userId, userId)
    .first<{
      myMajorCategories: number;
      myCategories: number;
      mySources: number;
      systemSources: number;
      enabledSystemSources: number;
    }>();
  return row || {
    myMajorCategories: 0,
    myCategories: 0,
    mySources: 0,
    systemSources: 0,
    enabledSystemSources: 0,
  };
}

/** 最近一次源状态探测结果 */
export async function findLatestSourceStatus(
  db: D1Database,
  sourceId: string
): Promise<{
  status: string;
  available: number;
  response_time: number;
  check_error: string | null;
  created_at: number;
} | null> {
  return db
    .prepare(
      `SELECT status, available, response_time, check_error, created_at
       FROM source_status_cache
       WHERE source_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(sourceId)
    .first<{
      status: string;
      available: number;
      response_time: number;
      check_error: string | null;
      created_at: number;
    }>();
}

/** 源看板统计：当前用户可见的系统源与私有源 */
export async function getUserVisibleBoardStats(
  db: D1Database,
  userId: string
): Promise<{
  totalSources: number;
  searchableSources: number;
  enabledSources: number;
  availableSources: number;
  totalCategories: number;
  totalMajorCategories: number;
}> {
  const row = await db
    .prepare(
      `WITH visible AS (
         SELECT s.*
         FROM search_sources s
         INNER JOIN search_source_categories c ON s.category_id = c.id
         INNER JOIN search_major_categories m ON c.major_category_id = m.id
         WHERE s.is_active = 1 AND c.is_active = 1 AND m.is_active = 1
           AND (s.owner_id IS NULL OR s.owner_id = ?)
       )
       SELECT
         (SELECT COUNT(*) FROM visible) AS totalSources,
         (SELECT COUNT(*) FROM visible WHERE searchable = 1) AS searchableSources,
         (SELECT COUNT(*) FROM visible v
          WHERE NOT EXISTS (
            SELECT 1 FROM user_search_source_configs u
            WHERE u.user_id = ? AND u.source_id = v.id AND u.is_enabled = 0
          )) AS enabledSources,
         (SELECT COUNT(*) FROM visible v
          WHERE EXISTS (
            SELECT 1 FROM source_status_cache sc
            WHERE sc.id = (
              SELECT id FROM source_status_cache
              WHERE source_id = v.id ORDER BY created_at DESC LIMIT 1
            ) AND sc.available = 1
          )) AS availableSources,
         (SELECT COUNT(*) FROM search_source_categories c
          INNER JOIN search_major_categories m ON c.major_category_id = m.id
          WHERE c.is_active = 1 AND m.is_active = 1
            AND (c.owner_id IS NULL OR c.owner_id = ?)) AS totalCategories,
         (SELECT COUNT(*) FROM search_major_categories m
          WHERE m.is_active = 1 AND (m.owner_id IS NULL OR m.owner_id = ?)) AS totalMajorCategories`
    )
    .bind(userId, userId, userId, userId)
    .first<{
      totalSources: number;
      searchableSources: number;
      enabledSources: number;
      availableSources: number;
      totalCategories: number;
      totalMajorCategories: number;
    }>();
  return row || {
    totalSources: 0,
    searchableSources: 0,
    enabledSources: 0,
    availableSources: 0,
    totalCategories: 0,
    totalMajorCategories: 0,
  };
}

// ── 重复校验 ─────────────────────────────────────────

/** 同一归属下的大类重名检查 */
export async function findDuplicateMajorCategory(
  db: D1Database,
  ownerId: string | null,
  name: string,
  excludeId?: string
): Promise<{ id: string } | null> {
  const ownerClause = ownerId === null ? 'owner_id IS NULL' : 'owner_id = ?';
  const params: (string | number)[] = ownerId === null ? [name] : [ownerId, name];
  let excludeClause = '';
  if (excludeId) {
    excludeClause = ' AND id != ?';
    params.push(excludeId);
  }
  return db
    .prepare(
      `SELECT id FROM search_major_categories
       WHERE ${ownerClause} AND LOWER(name) = LOWER(?)${excludeClause}`
    )
    .bind(...params)
    .first<{ id: string }>();
}

/** 同一大类、同一归属下的分类重名检查 */
export async function findDuplicateCategory(
  db: D1Database,
  ownerId: string | null,
  majorCategoryId: string,
  name: string,
  excludeId?: string
): Promise<{ id: string } | null> {
  const ownerClause = ownerId === null ? 'owner_id IS NULL' : 'owner_id = ?';
  const params: (string | number)[] = ownerId === null
    ? [majorCategoryId, name]
    : [ownerId, majorCategoryId, name];
  let excludeClause = '';
  if (excludeId) {
    excludeClause = ' AND id != ?';
    params.push(excludeId);
  }
  return db
    .prepare(
      `SELECT id FROM search_source_categories
       WHERE ${ownerClause} AND major_category_id = ? AND LOWER(name) = LOWER(?)${excludeClause}`
    )
    .bind(...params)
    .first<{ id: string }>();
}

/** 同一分类、同一归属下的源重名检查 */
export async function findDuplicateSource(
  db: D1Database,
  ownerId: string | null,
  categoryId: string,
  name: string,
  excludeId?: string
): Promise<{ id: string } | null> {
  const ownerClause = ownerId === null ? 'owner_id IS NULL' : 'owner_id = ?';
  const params: (string | number)[] = ownerId === null
    ? [categoryId, name]
    : [ownerId, categoryId, name];
  let excludeClause = '';
  if (excludeId) {
    excludeClause = ' AND id != ?';
    params.push(excludeId);
  }
  return db
    .prepare(
      `SELECT id FROM search_sources
       WHERE ${ownerClause} AND category_id = ? AND LOWER(name) = LOWER(?)${excludeClause}`
    )
    .bind(...params)
    .first<{ id: string }>();
}

// ── 写入 ─────────────────────────────────────────────

/** 新建大类；ownerId 为 null 时写系统大类 */
export async function insertMajorCategory(
  db: D1Database,
  input: {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    displayOrder: number;
    ownerId: string | null;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO search_major_categories (
         id, name, description, icon, color, display_order,
         is_system, is_active, owner_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.name,
      input.description,
      input.icon,
      input.color,
      input.displayOrder,
      input.ownerId === null ? 1 : 0,
      input.ownerId,
      input.now,
      input.now
    )
    .run();
}

/** 更新大类基础字段 */
export async function updateMajorCategory(
  db: D1Database,
  id: string,
  updates: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    displayOrder?: number;
    isActive?: boolean;
  },
  now: number
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(updates.description);
  }
  if (updates.icon !== undefined) {
    sets.push('icon = ?');
    params.push(updates.icon);
  }
  if (updates.color !== undefined) {
    sets.push('color = ?');
    params.push(updates.color);
  }
  if (updates.displayOrder !== undefined) {
    sets.push('display_order = ?');
    params.push(updates.displayOrder);
  }
  if (updates.isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(updates.isActive ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(now, id);
  await db
    .prepare(`UPDATE search_major_categories SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();
}

/** 软删除大类 */
export async function softDeleteMajorCategory(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare('UPDATE search_major_categories SET is_active = 0, updated_at = ? WHERE id = ?')
    .bind(now, id)
    .run();
}

/** 新建分类；ownerId 为 null 时写系统分类 */
export async function insertSourceCategory(
  db: D1Database,
  input: {
    id: string;
    majorCategoryId: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    displayOrder: number;
    defaultSearchable: boolean;
    defaultSiteType: string;
    searchPriority: number;
    ownerId: string | null;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO search_source_categories (
         id, major_category_id, name, description, icon, color, display_order,
         is_system, is_active, default_searchable, default_site_type, search_priority,
         created_by, owner_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.majorCategoryId,
      input.name,
      input.description,
      input.icon,
      input.color,
      input.displayOrder,
      input.ownerId === null ? 1 : 0,
      input.defaultSearchable ? 1 : 0,
      input.defaultSiteType,
      input.searchPriority,
      input.ownerId,
      input.ownerId,
      input.now,
      input.now
    )
    .run();
}

/** 更新分类字段 */
export async function updateSourceCategory(
  db: D1Database,
  id: string,
  updates: {
    majorCategoryId?: string;
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    defaultSearchable?: boolean;
    defaultSiteType?: string;
    searchPriority?: number;
    displayOrder?: number;
    isActive?: boolean;
  },
  now: number
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (updates.majorCategoryId !== undefined) {
    sets.push('major_category_id = ?');
    params.push(updates.majorCategoryId);
  }
  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(updates.description);
  }
  if (updates.icon !== undefined) {
    sets.push('icon = ?');
    params.push(updates.icon);
  }
  if (updates.color !== undefined) {
    sets.push('color = ?');
    params.push(updates.color);
  }
  if (updates.defaultSearchable !== undefined) {
    sets.push('default_searchable = ?');
    params.push(updates.defaultSearchable ? 1 : 0);
  }
  if (updates.defaultSiteType !== undefined) {
    sets.push('default_site_type = ?');
    params.push(updates.defaultSiteType);
  }
  if (updates.searchPriority !== undefined) {
    sets.push('search_priority = ?');
    params.push(updates.searchPriority);
  }
  if (updates.displayOrder !== undefined) {
    sets.push('display_order = ?');
    params.push(updates.displayOrder);
  }
  if (updates.isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(updates.isActive ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(now, id);
  await db
    .prepare(`UPDATE search_source_categories SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();
}

/** 软删除分类 */
export async function softDeleteSourceCategory(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare('UPDATE search_source_categories SET is_active = 0, updated_at = ? WHERE id = ?')
    .bind(now, id)
    .run();
}

/** 新建搜索源；ownerId 为 null 时写系统源 */
export async function insertSearchSource(
  db: D1Database,
  input: {
    id: string;
    categoryId: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    icon: string;
    urlTemplate: string;
    homepageUrl: string | null;
    siteType: string;
    searchable: boolean;
    searchPriority: number;
    ownerId: string | null;
    now: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO search_sources (
         id, category_id, name, subtitle, description, icon, url_template, homepage_url,
         site_type, searchable, search_priority, is_system, is_active, display_order,
         usage_count, created_by, owner_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 999, 0, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.categoryId,
      input.name,
      input.subtitle,
      input.description,
      input.icon,
      input.urlTemplate,
      input.homepageUrl,
      input.siteType,
      input.searchable ? 1 : 0,
      input.searchPriority,
      input.ownerId === null ? 1 : 0,
      input.ownerId,
      input.ownerId,
      input.now,
      input.now
    )
    .run();
}

/** 更新搜索源字段 */
export async function updateSearchSource(
  db: D1Database,
  id: string,
  updates: {
    categoryId?: string;
    name?: string;
    subtitle?: string | null;
    description?: string | null;
    icon?: string;
    urlTemplate?: string;
    homepageUrl?: string | null;
    searchable?: boolean;
    searchPriority?: number;
    isActive?: boolean;
  },
  now: number
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (updates.categoryId !== undefined) {
    sets.push('category_id = ?');
    params.push(updates.categoryId);
  }
  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.subtitle !== undefined) {
    sets.push('subtitle = ?');
    params.push(updates.subtitle);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(updates.description);
  }
  if (updates.icon !== undefined) {
    sets.push('icon = ?');
    params.push(updates.icon);
  }
  if (updates.urlTemplate !== undefined) {
    sets.push('url_template = ?');
    params.push(updates.urlTemplate);
  }
  if (updates.homepageUrl !== undefined) {
    sets.push('homepage_url = ?');
    params.push(updates.homepageUrl);
  }
  if (updates.searchable !== undefined) {
    sets.push('searchable = ?');
    params.push(updates.searchable ? 1 : 0);
  }
  if (updates.searchPriority !== undefined) {
    sets.push('search_priority = ?');
    params.push(updates.searchPriority);
  }
  if (updates.isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(updates.isActive ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(now, id);
  await db
    .prepare(`UPDATE search_sources SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();
}

/** 软删除搜索源 */
export async function softDeleteSearchSource(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare('UPDATE search_sources SET is_active = 0, updated_at = ? WHERE id = ?')
    .bind(now, id)
    .run();
}
