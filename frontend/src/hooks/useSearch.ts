/**
 * 通用搜索 Hook（适用于通用搜索模式）
 *
 * ⚠️ 适用范围：
 *   此 hook 仅支持「通用模式」搜索（sourceIds 分页）。
 *   聚合搜索（anime_sources / movie_sources）由 MainSearchPage 内联的
 *   handleSearch 直接调用 searchApi，不经过此 hook。
 *
 *   如果需要让聚合搜索也走此 hook，需扩展 performSearch 支持 majorCategoryId 参数。
 *   当前状态：此 hook 主要被非主搜索页面使用。
 */
import { useState, useCallback, useEffect } from 'react';
import { useSearchStore, useAuthStore } from '@/stores';
import { searchApi, userApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import i18next from '@/i18n';
import { useValidationRules, useUserLimits, usePaginationConfig } from '@/contexts';
import type { SearchResult, SearchHistoryItem, SearchSuggestion } from '@/types';

interface UseSearchOptions {
  autoSaveHistory?: boolean;
  maxHistoryItems?: number;
}

interface UseSearchReturn {
  keyword: string;
  setKeyword: (keyword: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  error: string | null;
  currentPage: number;
  totalResults: number;
  hasMore: boolean;
  selectedSources: string[];
  searchHistory: SearchHistoryItem[];
  suggestions: SearchSuggestion[];
  performSearch: (searchKeyword?: string, page?: number) => Promise<void>;
  loadMore: () => Promise<void>;
  clearResults: () => void;
  resetSearch: () => void;
  toggleSource: (sourceId: string) => void;
  selectAllSources: () => void;
  loadHistory: () => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  loadSuggestions: (keyword: string) => Promise<void>;
  loadTrending: () => Promise<void>;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const validationRules = useValidationRules();
  const userLimits = useUserLimits();
  const paginationConfig = usePaginationConfig();
  const { autoSaveHistory = true, maxHistoryItems = userLimits.maxSearchHistory } = options;
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const { keyword, setKeyword, currentPage, setCurrentPage } = useSearchStore();

  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);

  const performSearch = useCallback(async (searchKeyword?: string, page = 1) => {
    const query = searchKeyword || keyword;
    if (!query?.trim()) {
      setError(i18next.t('errors:hooks.search.keywordRequired'));
      return;
    }

    setError(null);
    setSearching(true);

    try {
      const response = await searchApi.search({
        keyword: query.trim(),
        sourceIds: selectedSources.length > 0 ? selectedSources : undefined,
        page,
        pageSize: paginationConfig.defaultPageSize,
      });

      if (response.success && response.data) {
        // useSearch 只处理通用搜索结果（BasicSearchData），不处理聚合响应
        if ('results' in response.data && !('resultType' in response.data)) {
          const { results: rawResults, pagination } = response.data;
          // 后端返回 id/name，前端模型使用 sourceId/sourceName
          const searchResults: SearchResult[] = rawResults.map(r => ({
            sourceId: r.id,
            sourceName: r.name,
            sourceIcon: r.icon,
            url: r.url,
            description: r.description,
          }));

          if (page === 1) {
            setResults(searchResults);
          } else {
            setResults(prev => [...prev, ...searchResults]);
          }

          if (pagination) {
            setTotalResults(pagination.total);
            setCurrentPage(pagination.page);
            setHasMore(pagination.hasMore);
          }

          if (autoSaveHistory && isAuthenticated && searchResults.length > 0) {
            const historyItem: SearchHistoryItem = {
              id: crypto.randomUUID(),
              userId: '',
              query: query.trim(),
              source: selectedSources.join(','),
              resultsCount: pagination?.total ?? 0,
              createdAt: Date.now(),
            };
            setSearchHistory(prev => [historyItem, ...prev]);
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : i18next.t('errors:hooks.search.searchFailedDefault');
      setError(errorMessage);
      toast.error(i18next.t('errors:hooks.search.searchFailedTitle'), errorMessage);
    } finally {
      setSearching(false);
    }
  }, [
    keyword,
    selectedSources,
    autoSaveHistory,
    isAuthenticated,
    toast,
    paginationConfig.defaultPageSize,
    setCurrentPage,
  ]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isSearching) return;
    await performSearch(keyword, currentPage + 1);
  }, [hasMore, isSearching, keyword, currentPage, performSearch]);

  const clearResults = useCallback(() => {
    setResults([]);
    setTotalResults(0);
    setCurrentPage(1);
    setHasMore(false);
    setError(null);
  }, [setCurrentPage]);

  const resetSearch = useCallback(() => {
    setKeyword('');
    clearResults();
    setSelectedSources([]);
  }, [setKeyword, clearResults]);

  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSources(prev =>
      prev.includes(sourceId)
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  }, []);

  const selectAllSources = useCallback(() => {
    setSelectedSources([]);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await userApi.getSearchHistory(maxHistoryItems);
      if (response.success && response.data) {
        setSearchHistory(response.data.history.slice(0, maxHistoryItems));
      }
    } catch (err) {
      console.error('Failed to load search history:', err);
    }
  }, [isAuthenticated, maxHistoryItems]);

  const deleteHistoryItem = useCallback(async (id: string) => {
    try {
      await userApi.deleteSearchHistoryItem(id);
      setSearchHistory(prev => prev.filter(h => h.id !== id));
    } catch (_err) {
      toast.error(i18next.t('errors:hooks.search.deleteFailedTitle'), i18next.t('errors:hooks.search.deleteHistoryFailedMessage'));
    }
  }, [toast]);

  const clearAllHistory = useCallback(async () => {
    try {
      await userApi.clearSearchHistory();
      setSearchHistory([]);
      toast.success(i18next.t('errors:hooks.search.clearedTitle'), i18next.t('errors:hooks.search.clearedMessage'));
    } catch (_err) {
      toast.error(i18next.t('errors:hooks.search.clearHistoryFailedTitle'), i18next.t('errors:hooks.search.clearHistoryFailedMessage'));
    }
  }, [toast]);

  const loadSuggestions = useCallback(async (keyword: string) => {
    if (!keyword || keyword.length < validationRules.SEARCH_KEYWORD_MIN_LENGTH) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await searchApi.getSuggestions(keyword);
      if (response.success && response.data) {
        setSuggestions(response.data);
      }
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    }
  }, [validationRules.SEARCH_KEYWORD_MIN_LENGTH]);

  const loadTrending = useCallback(async () => {
    try {
      const response = await searchApi.getTrending();
      if (response.success && response.data) {
        setSuggestions(response.data);
      }
    } catch (err) {
      console.error('Failed to load trending:', err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadHistory();
    }
  }, [isAuthenticated, loadHistory]);

  return {
    keyword,
    setKeyword,
    results,
    isSearching,
    error,
    currentPage,
    totalResults,
    hasMore,
    selectedSources,
    searchHistory,
    suggestions,
    performSearch,
    loadMore,
    clearResults,
    resetSearch,
    toggleSource,
    selectAllSources,
    loadHistory,
    deleteHistoryItem,
    clearAllHistory,
    loadSuggestions,
    loadTrending,
  };
}
