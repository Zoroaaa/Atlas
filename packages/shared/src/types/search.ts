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

export interface SearchResult {
  sourceId: string;
  sourceName: string;
  sourceIcon?: string;
  url: string;
  description?: string;
}

export interface SearchRequest {
  keyword: string;
  sourceIds?: string[];
  page?: number;
  pageSize?: number;
  majorCategoryId?: string;
  categoryId?: string;
}

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

export interface SearchSuggestion {
  keyword: string;
  count: number;
}

export interface TrendingSearch {
  keyword: string;
  count: number;
}

export interface AddFavoriteRequest {
  title: string;
  subtitle?: string;
  url: string;
  icon?: string;
  keyword?: string;
  magnetLink?: string;
  code?: string;
  cover?: string;
  actors?: string;
  duration?: string;
  tags?: string;
  releaseDate?: string;
  publisher?: string;
  status?: string;
}

export interface SaveSearchHistoryRequest {
  query: string;
  source?: string;
  resultsCount?: number;
}

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