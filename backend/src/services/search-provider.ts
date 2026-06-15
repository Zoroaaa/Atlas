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

// ─── 统一搜索选项 ──────────────────────────────────────────────────────

export interface SearchOptions {
  /** API Key 等外部依赖（如 TMDB_API_KEY） */
  apiKeys?: Record<string, string>;
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

  /** 执行搜索 */
  search(keyword: string, page: number, opts?: SearchOptions): Promise<SearchResultBase>;

  /** 搜索建议（可选） */
  suggestions?(keyword: string): Promise<SuggestionItem[]>;

  /** 热门趋势（可选） */
  trending?(): Promise<TrendingItem[]>;
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
