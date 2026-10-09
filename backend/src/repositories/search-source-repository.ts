/**
 * 搜索源数据访问层
 *
 * 收口 search_sources × search_source_categories 的联表查询与「结果卡片」映射，
 * 避免同一 SQL 散落在 search 路由与各 Provider 中重复出现。
 */
import type { SearchSource } from '@/types';

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

/** 可用搜索源公共查询片段 */
const SOURCE_SELECT = `SELECT s.* FROM search_sources s
  INNER JOIN search_source_categories c ON s.category_id = c.id
  WHERE s.is_active = 1 AND s.searchable = 1`;

/**
 * 按大类查询可用搜索源（系统源 + 该用户私有源）
 * @param defaultOnly 仅取大类下标记为默认可搜索的源（通用模式使用）
 */
export async function listSourcesByCategory(
  db: D1Database,
  opts: { categoryId: string; userId: string; defaultOnly?: boolean }
): Promise<SearchSource[]> {
  const defaultClause = opts.defaultOnly ? ' AND c.default_searchable = 1' : '';
  const rows = await db
    .prepare(
      `${SOURCE_SELECT}${defaultClause} AND c.major_category_id = ?
       AND (s.is_system = 1 OR s.created_by = ?)
       ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC`
    )
    .bind(opts.categoryId, opts.userId)
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
      `${SOURCE_SELECT} AND c.default_searchable = 1
       AND (s.is_system = 1 OR s.created_by = ?)
       ORDER BY c.search_priority ASC, s.search_priority ASC, s.display_order ASC`
    )
    .bind(userId)
    .all<SearchSource>();
  return rows.results || [];
}

/**
 * 查询用户启用的搜索源 id 集合
 * @returns null 表示用户未做任何配置（视为全部启用）
 */
export async function listEnabledSourceIds(
  db: D1Database,
  userId: string
): Promise<Set<string> | null> {
  const rows = await db
    .prepare(
      `SELECT source_id FROM user_search_source_configs 
       WHERE user_id = ? AND is_enabled = 1`
    )
    .bind(userId)
    .all<{ source_id: string }>();

  if (!rows.results || rows.results.length === 0) return null;
  return new Set(rows.results.map(r => r.source_id));
}

/** 按用户启用项过滤搜索源（enabled 为 null 时全部保留） */
export function filterEnabledSources(
  sources: SearchSource[],
  enabled: Set<string> | null
): SearchSource[] {
  return enabled ? sources.filter(s => enabled.has(s.id)) : sources;
}

/** 搜索源 → 结果卡片（替换 url 模板中的关键词占位符） */
export function toSourceCards(sources: SearchSource[], keyword: string): SearchSourceCard[] {
  const encoded = encodeURIComponent(keyword);
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    subtitle: source.subtitle,
    icon: source.icon,
    url: source.url_template.replace('{keyword}', encoded),
    siteType: source.site_type,
    category: source.category_id,
    description: source.description,
  }));
}