/**
 * 搜索源数据访问层：搜索/目录读取、归属隔离与结果卡片映射。
 *
 * 归属约定：owner_id IS NULL 为系统数据，非空为用户私有数据；
 * 用户可见集合 = 系统树 + 当前用户自己的私有树，任何查询不得跨用户读取。
 */
import type { MajorCategory, SearchSource, SearchSourceCategory, UserSearchSourceConfig } from '@/types';
import type { EntityType } from '@/repositories/entity-alias-repository';
import { lookupQueryVariants } from '@/services/alias-resolver';
import { buildQueryVariants, type QueryVariant } from '@/services/query-normalizer';
import { pickKeywordForSource } from '@/services/source-language';

/** 结果卡片：多源跳转卡片与通用模式结果共用同一形态 */
export interface SearchSourceCard {
  id: string;
  name: string;
  subtitle: string | null;
  icon: string | null;
  url: string;
  siteType: string;
  category: string;
  description: string | null;
}

/** 搜索源可见性：系统源只能来自系统分类，用户源只能来自本人分类 */
const VISIBLE_SOURCE_WHERE = `
  s.is_active = 1
  AND s.searchable = 1
  AND c.is_active = 1
  AND m.is_active = 1
  AND (
    (s.owner_id IS NULL AND c.owner_id IS NULL AND m.owner_id IS NULL)
    OR (s.owner_id = ? AND c.owner_id = ?)
  )
`;

/** 源目录行：附带分类/大类与当前用户配置 */
export type SourceCatalogRow = SearchSource & {
  category_name: string;
  category_icon: string | null;
  category_color: string;
  major_category_id: string;
  major_category_name: string;
  config_id: string | null;
  config_is_enabled: number | null;
  config_custom_priority: number | null;
  config_custom_name: string | null;
  config_custom_subtitle: string | null;
  config_custom_icon: string | null;
  config_notes: string | null;
};

/** 按大类查询可用搜索源（系统源 + 当前用户私有源） */
export async function listSourcesByCategory(
  db: D1Database,
  opts: { categoryId: string; userId: string; defaultOnly?: boolean }
): Promise<SearchSource[]> {
  const defaultClause = opts.defaultOnly ? ' AND c.default_searchable = 1' : '';
  const rows = await db
    .prepare(
      `SELECT s.* FROM search_sources s
       INNER JOIN search_source_categories c ON s.category_id = c.id
       INNER JOIN search_major_categories m ON c.major_category_id = m.id
       WHERE ${VISIBLE_SOURCE_WHERE}${defaultClause} AND c.major_category_id = ?
       ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC`
    )
    .bind(opts.userId, opts.userId, opts.categoryId)
    .all<SearchSource>();
  return rows.results || [];
}

/** 查询全部默认参与搜索的可用搜索源（未指定大类时的通用模式使用） */
export async function listDefaultSources(
  db: D1Database,
  userId: string
): Promise<SearchSource[]> {
  const rows = await db
    .prepare(
      `SELECT s.* FROM search_sources s
       INNER JOIN search_source_categories c ON s.category_id = c.id
       INNER JOIN search_major_categories m ON c.major_category_id = m.id
       WHERE ${VISIBLE_SOURCE_WHERE} AND c.default_searchable = 1
       ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC`
    )
    .bind(userId, userId)
    .all<SearchSource>();
  return rows.results || [];
}

/** 系统大类（仅 owner_id IS NULL） */
export async function listSystemMajorCategories(db: D1Database): Promise<MajorCategory[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM search_major_categories
       WHERE owner_id IS NULL AND is_active = 1
       ORDER BY display_order ASC`
    )
    .all<MajorCategory>();
  return rows.results || [];
}

/** 系统分类（仅系统大类下的系统分类） */
export async function listSystemCategories(
  db: D1Database,
  majorCategoryId?: string
): Promise<Array<SearchSourceCategory & { major_category_name: string | null }>> {
  const params: string[] = [];
  let majorClause = '';
  if (majorCategoryId) {
    majorClause = ' AND c.major_category_id = ?';
    params.push(majorCategoryId);
  }
  const rows = await db
    .prepare(
      `SELECT c.*, mc.name AS major_category_name
       FROM search_source_categories c
       INNER JOIN search_major_categories mc ON c.major_category_id = mc.id
       WHERE c.owner_id IS NULL AND mc.owner_id IS NULL AND c.is_active = 1 AND mc.is_active = 1${majorClause}
       ORDER BY mc.display_order ASC, c.display_order ASC`
    )
    .bind(...params)
    .all<SearchSourceCategory & { major_category_name: string | null }>();
  return rows.results || [];
}

/** 用户私有大类 */
export async function listUserMajorCategories(db: D1Database, userId: string): Promise<MajorCategory[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM search_major_categories
       WHERE owner_id = ? AND is_active = 1
       ORDER BY display_order ASC`
    )
    .bind(userId)
    .all<MajorCategory>();
  return rows.results || [];
}

/**
 * 用户私有分类（含挂在系统大类下的个人分类）。
 *
 * 父大类被管理员停用后，个人分类仍需对本人可见并可删除，因此这里用 LEFT JOIN，
 * 不按父大类 is_active 过滤；是否参与搜索由 listSourcesByCategory 另行判断。
 */
export async function listUserCategories(
  db: D1Database,
  userId: string
): Promise<Array<SearchSourceCategory & {
  major_category_name: string | null;
  major_category_owner_id: string | null;
  major_category_active: number | null;
}>> {
  const rows = await db
    .prepare(
      `SELECT c.*,
              mc.name AS major_category_name,
              mc.owner_id AS major_category_owner_id,
              mc.is_active AS major_category_active
       FROM search_source_categories c
       LEFT JOIN search_major_categories mc ON c.major_category_id = mc.id
       WHERE c.owner_id = ? AND c.is_active = 1
       ORDER BY COALESCE(mc.display_order, 999) ASC, c.display_order ASC`
    )
    .bind(userId)
    .all<SearchSourceCategory & {
      major_category_name: string | null;
      major_category_owner_id: string | null;
      major_category_active: number | null;
    }>();
  return rows.results || [];
}

/** 用户私有源（父大类停用后仍返回，便于本人清理） */
export async function listUserSources(db: D1Database, userId: string): Promise<SearchSource[]> {
  const rows = await db
    .prepare(
      `SELECT s.* FROM search_sources s
       INNER JOIN search_source_categories c ON s.category_id = c.id
       LEFT JOIN search_major_categories m ON c.major_category_id = m.id
       WHERE s.owner_id = ? AND s.is_active = 1 AND c.is_active = 1 AND c.owner_id = ?
       ORDER BY COALESCE(m.display_order, 999) ASC, c.display_order ASC, s.display_order ASC`
    )
    .bind(userId, userId)
    .all<SearchSource>();
  return rows.results || [];
}

/** 系统源列表（附带当前用户配置），供系统源 tab 使用 */
export async function listSystemSourcesWithConfig(
  db: D1Database,
  userId: string
): Promise<Array<SearchSource & { enabled: boolean; userConfig: UserSearchSourceConfig | null }>> {
  const rows = await db
    .prepare(
      `SELECT s.*,
              u.id AS config_id,
              u.is_enabled AS config_is_enabled,
              u.custom_priority AS config_custom_priority,
              u.custom_name AS config_custom_name,
              u.custom_subtitle AS config_custom_subtitle,
              u.custom_icon AS config_custom_icon,
              u.notes AS config_notes
       FROM search_sources s
       INNER JOIN search_source_categories c ON s.category_id = c.id
       INNER JOIN search_major_categories m ON c.major_category_id = m.id
       LEFT JOIN user_search_source_configs u ON u.source_id = s.id AND u.user_id = ?
       WHERE s.owner_id IS NULL AND c.owner_id IS NULL AND m.owner_id IS NULL
         AND s.is_active = 1 AND c.is_active = 1 AND m.is_active = 1
       ORDER BY m.display_order ASC, c.display_order ASC, s.search_priority ASC, s.display_order ASC`
    )
    .bind(userId)
    .all<SearchSource & {
      config_id: string | null;
      config_is_enabled: number | null;
      config_custom_priority: number | null;
      config_custom_name: string | null;
      config_custom_subtitle: string | null;
      config_custom_icon: string | null;
      config_notes: string | null;
    }>();

  return (rows.results || []).map((row) => {
    const {
      config_id,
      config_is_enabled,
      config_custom_priority,
      config_custom_name,
      config_custom_subtitle,
      config_custom_icon,
      config_notes,
      ...source
    } = row;

    return {
      ...source,
      // 无配置行视为启用，仅显式 is_enabled = 0 才禁用
      enabled: config_is_enabled !== 0,
      userConfig: config_id
        ? {
            id: config_id,
            user_id: userId,
            source_id: source.id,
            is_enabled: config_is_enabled ?? 1,
            custom_priority: config_custom_priority,
            custom_name: config_custom_name,
            custom_subtitle: config_custom_subtitle,
            custom_icon: config_custom_icon,
            notes: config_notes,
            created_at: 0,
            updated_at: 0,
          }
        : null,
    };
  });
}

/** 当前用户可见的全部源（系统源 + 本人私有源），供兼容列表接口使用 */
export async function listVisibleSources(db: D1Database, userId: string): Promise<SearchSource[]> {
  const rows = await db
    .prepare(
      `SELECT s.* FROM search_sources s
       INNER JOIN search_source_categories c ON s.category_id = c.id
       INNER JOIN search_major_categories m ON c.major_category_id = m.id
       WHERE s.is_active = 1 AND c.is_active = 1 AND m.is_active = 1
         AND (s.owner_id IS NULL OR s.owner_id = ?)
       ORDER BY m.display_order ASC, c.display_order ASC, s.search_priority ASC, s.display_order ASC`
    )
    .bind(userId)
    .all<SearchSource>();
  return rows.results || [];
}

/** 源目录分页查询：系统源 + 当前用户私有源 */
export async function listSourceCatalog(
  db: D1Database,
  opts: {
    userId: string;
    keyword?: string;
    majorCategoryId?: string;
    categoryId?: string;
    siteType?: string;
    searchable?: boolean;
    scope?: string;
    sort?: string;
    page: number;
    pageSize: number;
    escapeLikePattern: (value: string) => string;
  }
): Promise<{ items: SourceCatalogRow[]; total: number }> {
  const joins = `
    FROM search_sources s
    INNER JOIN search_source_categories c ON s.category_id = c.id
    INNER JOIN search_major_categories m ON c.major_category_id = m.id
    LEFT JOIN user_search_source_configs u ON u.source_id = s.id AND u.user_id = ?
    WHERE s.is_active = 1
      AND c.is_active = 1
      AND m.is_active = 1
      AND (s.owner_id IS NULL OR s.owner_id = ?)
  `;
  const conditions: string[] = [];
  const params: (string | number)[] = [opts.userId, opts.userId];

  if (opts.keyword) {
    const pattern = `%${opts.escapeLikePattern(opts.keyword)}%`;
    conditions.push("(s.name LIKE ? ESCAPE '\\' OR s.subtitle LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern, pattern);
  }
  if (opts.majorCategoryId) {
    conditions.push('c.major_category_id = ?');
    params.push(opts.majorCategoryId);
  }
  if (opts.categoryId) {
    conditions.push('s.category_id = ?');
    params.push(opts.categoryId);
  }
  if (opts.siteType) {
    conditions.push('s.site_type = ?');
    params.push(opts.siteType);
  }
  if (opts.searchable !== undefined) {
    conditions.push('s.searchable = ?');
    params.push(opts.searchable ? 1 : 0);
  }
  if (opts.scope === 'mine') {
    conditions.push('s.owner_id = ?');
    params.push(opts.userId);
  } else if (opts.scope === 'enabled') {
    conditions.push('(u.is_enabled IS NULL OR u.is_enabled = 1)');
  } else if (opts.scope === 'searchable') {
    conditions.push('s.searchable = 1');
  }

  const whereClause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
  const orderBy = opts.sort === 'name'
    ? 's.name ASC'
    : opts.sort === 'usage'
      ? 's.usage_count DESC, s.name ASC'
      : 'm.display_order ASC, c.display_order ASC, s.search_priority ASC, s.display_order ASC';

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS count ${joins}${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const rows = await db
    .prepare(
      `SELECT s.*,
              c.name AS category_name,
              c.icon AS category_icon,
              c.color AS category_color,
              c.major_category_id AS major_category_id,
              m.name AS major_category_name,
              u.id AS config_id,
              -- 个人源由用户直接维护，不存在「启停」概念，历史配置行不得让它从搜索中消失
              CASE WHEN s.owner_id IS NOT NULL THEN 1 ELSE u.is_enabled END AS config_is_enabled,
              u.custom_priority AS config_custom_priority,
              u.custom_name AS config_custom_name,
              u.custom_subtitle AS config_custom_subtitle,
              u.custom_icon AS config_custom_icon,
              u.notes AS config_notes
       ${joins}${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .bind(...params, opts.pageSize, (opts.page - 1) * opts.pageSize)
    .all<SourceCatalogRow>();

  return { items: rows.results || [], total: countRow?.count || 0 };
}

/** 按 id 读取当前用户可见的源（系统源或本人私有源） */
export async function findVisibleSourceById(
  db: D1Database,
  sourceId: string,
  userId: string
): Promise<SearchSource | null> {
  return db
    .prepare(
      `SELECT s.* FROM search_sources s
       INNER JOIN search_source_categories c ON s.category_id = c.id
       INNER JOIN search_major_categories m ON c.major_category_id = m.id
       WHERE s.id = ? AND s.is_active = 1 AND c.is_active = 1 AND m.is_active = 1
         AND (s.owner_id IS NULL OR s.owner_id = ?)`
    )
    .bind(sourceId, userId)
    .first<SearchSource>();
}

/** 源详情：附带分类/大类路径，供详情接口组装 categoryPath */
export async function findVisibleSourceDetail(
  db: D1Database,
  sourceId: string,
  userId: string
): Promise<(SearchSource & {
  category_name: string;
  category_icon: string | null;
  category_color: string;
  major_category_id: string;
  major_category_name: string;
}) | null> {
  return db
    .prepare(
      `SELECT s.*,
              c.name AS category_name,
              c.icon AS category_icon,
              c.color AS category_color,
              c.major_category_id AS major_category_id,
              m.name AS major_category_name
       FROM search_sources s
       INNER JOIN search_source_categories c ON s.category_id = c.id
       INNER JOIN search_major_categories m ON c.major_category_id = m.id
       WHERE s.id = ? AND s.is_active = 1 AND c.is_active = 1 AND m.is_active = 1
         AND (s.owner_id IS NULL OR s.owner_id = ?)`
    )
    .bind(sourceId, userId)
    .first<SearchSource & {
      category_name: string;
      category_icon: string | null;
      category_color: string;
      major_category_id: string;
      major_category_name: string;
    }>();
}

/** 累加源使用次数；调用方必须先完成可见性校验 */
export async function incrementSourceUsage(db: D1Database, sourceId: string): Promise<void> {
  await db
    .prepare('UPDATE search_sources SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?')
    .bind(Date.now(), sourceId)
    .run();
}

/**
 * 搜索缓存所需的用户源状态：禁用集合 + 个人树版本 + 系统树版本。
 * 三个查询合并到一次 batch，避免搜索主链路多一次往返。
 */
export async function getSourceState(
  db: D1Database,
  userId: string
): Promise<{ disabled: Set<string>; userRevision: number; systemRevision: number }> {
  const [disabledRows, userRow, systemRow] = (await db.batch([
    db.prepare(
      `SELECT u.source_id
       FROM user_search_source_configs u
       INNER JOIN search_sources s ON s.id = u.source_id
       WHERE u.user_id = ? AND u.is_enabled = 0 AND s.owner_id IS NULL`
    ).bind(userId),
    db.prepare('SELECT source_revision FROM users WHERE id = ?').bind(userId),
    db.prepare("SELECT value FROM system_config WHERE key = 'search_sources_revision'"),
  ])) as unknown as [
    { results: Array<{ source_id: string }> },
    { results: Array<{ source_revision: number }> },
    { results: Array<{ value: string }> },
  ];

  return {
    disabled: new Set((disabledRows.results || []).map(r => r.source_id)),
    userRevision: userRow.results?.[0]?.source_revision || 0,
    systemRevision: Number(systemRow.results?.[0]?.value || 0),
  };
}

/** 个人树或用户源配置变更后递增用户版本，使搜索缓存立即失效 */
export async function bumpUserSourceRevision(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE users SET source_revision = source_revision + 1 WHERE id = ?')
    .bind(userId)
    .run();
}

/** 系统树变更后递增全局版本，使所有用户的搜索缓存失效 */
export async function bumpSystemSourceRevision(db: D1Database): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO system_config (key, value, created_at, updated_at)
       VALUES ('search_sources_revision', '1', ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = CAST(CAST(system_config.value AS INTEGER) + 1 AS TEXT),
         updated_at = excluded.updated_at`
    )
    .bind(now, now)
    .run();
}

/** 过滤掉用户显式禁用的搜索源（disabled 为空时原样保留） */
export function filterEnabledSources(
  sources: SearchSource[],
  disabled: Set<string> | null
): SearchSource[] {
  return disabled && disabled.size > 0 ? sources.filter(s => !disabled.has(s.id)) : sources;
}

/** 搜索源 → 结果卡片（按源的语言能力替换关键词占位符） */
export async function toSourceCards(
  db: D1Database,
  sources: SearchSource[],
  keyword: string,
  options: { variants?: QueryVariant[]; entityType?: EntityType } = {}
): Promise<SearchSourceCard[]> {
  const deterministic = buildQueryVariants(keyword);
  const variants =
    options.variants ??
    (await lookupQueryVariants(db, keyword, options.entityType ?? 'work'));

  return sources.map(source => {
    const picked = pickKeywordForSource(source.id, keyword, variants, deterministic);
    return {
      id: source.id,
      name: source.name,
      subtitle: source.subtitle,
      icon: source.icon,
      // 模板里的 {keyword} 必须 encodeURIComponent，否则关键词中的 &、# 会截断查询串
      url: source.url_template.replace('{keyword}', encodeURIComponent(picked.text)),
      siteType: source.site_type,
      category: source.category_id,
      description: source.description,
    };
  });
}
