/**
 * 搜索域共享类型：历史、收藏、结果、建议与趋势。
 * 契约约束：请求体优先由 zod 推导，仅后端内部使用的请求保留手写；字段需与 shared schemas 同步。
 */

/** 搜索历史条目；由搜索接口在后端写入，前端只读。 */
export interface SearchHistoryItem {
  id: string;
  userId: string;
  query: string;
  source: string;
  resultsCount: number;
  createdAt: number;
  title?: string;
  subtitle?: string;
  code?: string;
  actors?: string;
  duration?: string;
  tags?: string;
  releaseDate?: string;
  publisher?: string;
  keyword?: string;
  /** 封面 URL（方案B增强：Bangumi封面/TMDB poster/JAV封面） */
  cover?: string;
}

/** 收藏条目；cover / code 等增强字段可能缺失，渲染时需回退。 */
export interface FavoriteItem {
  id: string;
  userId: string;
  title: string;
  subtitle?: string;
  url: string;
  icon?: string;
  keyword?: string;
  createdAt: number;
  code?: string;
  cover?: string;
  actors?: string;
  duration?: string;
  tags?: string;
  releaseDate?: string;
  publisher?: string;
  magnetLink?: string;
  status?: string;
}

/** 单个源站的搜索命中结果。 */
export interface SearchResult {
  sourceId: string;
  sourceName: string;
  sourceIcon?: string;
  url: string;
  description?: string;
}

// 请求契约类型统一由 zod schema 推导
export type { SearchRequest } from '../schemas/search';
export type { AddFavoriteRequest } from '../schemas/user';

/** 搜索接口的响应结构。 */
export interface SearchResponse {
  success: boolean;
  data: {
    keyword: string;
    results: SearchResult[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      hasMore: boolean;
    };
  };
}

/** 搜索建议项，count 为历史命中次数。 */
export interface SearchSuggestion {
  keyword: string;
  count: number;
}

/** 热门搜索项。 */
export interface TrendingSearch {
  keyword: string;
  count: number;
}

// 搜索历史由搜索接口在后端写入，没有独立的前端调用方，schema 留在后端
export interface SaveSearchHistoryRequest {
  query: string;
  source?: string;
  resultsCount?: number;
}

/** 搜索统计聚合结果。 */
export interface SearchStats {
  totalSearches: number;
  topSources: Array<{
    source: string;
    count: number;
  }>;
  recentSearches: Array<{
    query: string;
    createdAt: number;
  }>;
}