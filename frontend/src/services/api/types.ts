/**
 * API 响应类型层
 *
 * 统一后端实际返回的响应结构，消除调用方 `as unknown as` 断言。
 * 与 @codeseek/shared 中的类型互补：shared 定义数据实体，这里定义 API 包装。
 */

import type {
  SearchSuggestion,
  TrendingSearch,
  FavoriteItem,
  SearchHistoryItem,
  User,
  SearchSource,
  UserSourceConfig,
  MajorCategory,
  Category,
  SourceStats,
} from '@/types';
import type { EnrichedSearchData } from '@/types/search';

// ─── 通用响应包装 ──────────────────────────────────────────────────────

/** 后端标准成功响应 */
export interface ApiOkResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/** 后端标准失败响应 */
export interface ApiFailResponse {
  success: false;
  message?: string;
}

/** 后端可能成功也可能失败的联合响应 */
export type ApiResponse<T> = ApiOkResponse<T> | ApiFailResponse;

// ─── 搜索 ──────────────────────────────────────────────────────────────

/** 通用搜索结果项（后端 /search 返回的 results 数组元素） */
export interface SearchResponseItem {
  id: string;
  name: string;
  subtitle?: string;
  icon?: string;
  url: string;
  siteType: string;
  category: string;
  description?: string;
}

/** 通用搜索成功时的 data 结构 */
export interface BasicSearchData {
  keyword: string;
  results: SearchResponseItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * /search 端点的完整响应类型
 *
 * 后端根据 majorCategoryId 返回不同结构：
 *   - anime/movie/jav → data 为 EnrichedSearchData
 *   - 其他            → data 为 BasicSearchData
 */
export type SearchEndpointResponse = ApiResponse<BasicSearchData | EnrichedSearchData>;

/** /search/suggestions 响应 */
export type SearchSuggestionsResponse = ApiResponse<SearchSuggestion[]>;

/** /search/trending 响应 */
export type SearchTrendingResponse = ApiResponse<TrendingSearch[]>;

// ─── 用户 / 收藏 / 历史 ────────────────────────────────────────────────

export type FavoritesResponse = ApiResponse<{ favorites: FavoriteItem[] }>;

export type SearchHistoryResponse = ApiResponse<{ history: SearchHistoryItem[] }>;

export type AuthMeResponse = ApiResponse<User>;

export type UserSettingsResponse = ApiResponse<{ settings: Record<string, unknown> }>;

export type SearchStatsResponse = ApiResponse<{
  totalSearches: number;
  topSources: Array<{ source: string; count: number }>;
  recentSearches: Array<{ query: string; createdAt: number }>;
  searchGrowthPercent: number;
  thisWeekSearches: number;
  lastWeekSearches: number;
}>;

// ─── 来源 ──────────────────────────────────────────────────────────────

export type MajorCategoriesResponse = ApiResponse<MajorCategory[]>;

export type CategoriesResponse = ApiResponse<Category[]>;

export type SourcesResponse = ApiResponse<SearchSource[]>;

export type SourcesWithUserConfigResponse = ApiResponse<Array<SearchSource & { userConfig: UserSourceConfig | null }>>;

export type SourceStatsResponse = ApiResponse<SourceStats>;

export type SourceStatusCheckResponse = ApiResponse<{
  status: string;
  available: boolean;
  responseTime: number;
  error: string | null;
}>;

// ─── 系统 ──────────────────────────────────────────────────────────────

export type SystemStatsResponse = ApiResponse<{
  activeUsers: number;
  activeSources: number;
  totalSearches: number;
  activeUsersGrowthPercent: number;
}>;
