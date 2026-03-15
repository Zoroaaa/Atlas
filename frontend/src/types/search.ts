export interface SearchHistoryItem {
  id: string;
  userId: string;
  query: string;
  source: string;
  resultsCount: number;
  createdAt: number;
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
}

export interface SearchResult {
  sourceId: string;
  sourceName: string;
  sourceIcon?: string;
  url: string;
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
