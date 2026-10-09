/**
 * 统一搜索引擎抽象层
 *
 * 设计目标：
 *   1. 消除路由层 if-else 分发，新增搜索类别只需实现接口 + 注册
 *   2. 为后续扩展（音乐搜索、电子书搜索等）铺平道路
 *   3. 统一搜索选项、结果类型、建议/热门接口契约
 *
 * 使用方式：
 *   1. 实现 SearchProvider 接口
 *   2. 调用 providerRegistry.register(provider)
 *   3. 路由层通过 providerRegistry.getByCategory(categoryId) 获取 Provider 并调用
 */

import type { JwtPayload } from '@/types';

// ─── 统一搜索上下文 ────────────────────────────────────────────────────

/**
 * 搜索执行上下文：由路由注入，让 Provider 能自行完成「需访问数据/用户态」的逻辑
 * （如 JAV/Novel 注入按用户过滤的多源跳转卡片、JAV 女优子模式）。
 */
export interface SearchContext {
  /** 数据访问，供需要查询搜索源的 Provider 使用 */
  db: D1Database;
  /** 当前用户（未登录为 undefined） */
  user?: JwtPayload;
  /** 命中的 majorCategoryId */
  categoryId: string;
  /** 子模式（如 JAV 的 code/title/actress） */
  subMode?: string;
  /** 用户启用的搜索源 id 集合；null 表示未做任何配置（视为全部启用） */
  enabledSources?: Set<string> | null;
  /** API Key 等外部依赖（如 TMDB_API_KEY） */
  apiKeys?: Record<string, string>;
}

/** 搜索历史增强字段：由 Provider 从自身结果形态提取，路由负责落库 */
export interface HistoryEnrichment {
  /** 形如 ['title=?', 'cover=?'] */
  fields: string[];
  /** 与 fields 顺序对应的绑定值 */
  values: (string | number)[];
}

// ─── 统一搜索结果基类 ──────────────────────────────────────────────────

export interface SearchResultBase {
  /** 结果类型标识，对应 provider.id */
  resultType: string;
  /** 搜索关键词 */
  keyword: string;
  /** 当前页码 */
  page: number;
  /** 总结果数 */
  total: number;
  /** 各源错误信息 */
  errors: Record<string, string | null>;
}

// ─── 搜索建议项 ────────────────────────────────────────────────────────

export interface SuggestionItem {
  text: string;
  /** 可选：用于展示的额外信息 */
  meta?: Record<string, unknown>;
}

// ─── 热门趋势项 ────────────────────────────────────────────────────────

export interface TrendingItem {
  keyword: string;
  count: number;
  /** 可选封面/图标 */
  cover?: string;
  /** 可选副标题 */
  subtitle?: string;
}

// ─── SearchProvider 接口 ────────────────────────────────────────────────

export interface SearchProvider {
  /** 唯一标识（如 'anime' | 'movie' | 'jav'） */
  id: string;
  /** 显示名称（如 '动漫搜索' | '影视搜索' | 'JAV搜索'） */
  name: string;
  /** 支持的 majorCategoryId 列表 */
  supportedCategories: string[];

  /**
   * 结果是否注入「按用户过滤的搜索源卡片」（如 JAV/Novel 的多源跳转卡片）
   * true 时该响应属用户态，路由需按用户隔离 HTTP 缓存
   */
  readonly injectsUserSources?: boolean;

  /** 执行搜索（子模式、源注入等 Provider 专属逻辑均在其内部处理） */
  search(keyword: string, page: number, ctx: SearchContext): Promise<SearchResultBase>;

  /** 搜索建议（可选） */
  suggestions?(keyword: string): Promise<SuggestionItem[]>;

  /** 热门趋势（可选） */
  trending?(): Promise<TrendingItem[]>;

  /**
   * 从搜索结果提取写入搜索历史的增强字段（可选）
   * 返回 null 表示无可增强内容（路由将跳过历史更新）
   */
  buildHistoryEnrichment?(result: Record<string, unknown>): HistoryEnrichment | null;
}

// ─── Provider 注册中心 ──────────────────────────────────────────────────

class SearchProviderRegistry {
  private providers = new Map<string, SearchProvider>();

  /** 注册一个 SearchProvider */
  register(provider: SearchProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`[SearchProviderRegistry] Provider "${provider.id}" 已存在，将被覆盖`);
    }
    this.providers.set(provider.id, provider);
  }

  /** 按 ID 获取 Provider */
  get(id: string): SearchProvider | undefined {
    return this.providers.get(id);
  }

  /** 按 majorCategoryId 查找匹配的 Provider */
  getByCategory(categoryId: string): SearchProvider | undefined {
    for (const p of this.providers.values()) {
      if (p.supportedCategories.includes(categoryId)) return p;
    }
    return undefined;
  }

  /** 获取所有已注册的 Provider */
  getAll(): SearchProvider[] {
    return Array.from(this.providers.values());
  }

  /** 检查是否已注册任何 Provider */
  get size(): number {
    return this.providers.size;
  }
}

/** 全局单例 — 所有 SearchProvider 在此注册 */
export const providerRegistry = new SearchProviderRegistry();
