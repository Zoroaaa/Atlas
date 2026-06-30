import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchStore, useAuthStore } from '@/stores';
import { useSearchMutation, useSearchHistory, useSearchSuggestions, searchHistoryKeys } from '@/hooks';
import { userApi, analyticsApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { SEARCH_TABS } from '@/config/tabs';
import type { SearchTabType } from '@/types/source';
import type { EnrichedSearchData, JavEnrichedData } from '@/types/search';
import type { JavDetail } from '@/types/jav';
import type { SearchEndpointResponse, SearchResponseItem } from '@/services/api/types';
import type { SearchResult, MajorCategory, Category } from '@/types';
import type { SearchSuggestionItem } from './useSearchSuggestions';

export interface SearchResultItem extends SearchResult {
  subtitle?: string;
  siteType?: string;
  category?: string;
  description?: string;
}

interface UseSearchFlowOptions {
  activeTab: SearchTabType;
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
  majorCategories: MajorCategory[];
  categories: Category[];
  fetchJavDetail: (code: string) => void;
  resetJavDetail: () => void;
  javEnrichedDetail: JavDetail | null;
  setJavEnrichedDetail: (detail: JavDetail | null) => void;
  onSearch?: (keyword: string) => void;
}

export function useSearchFlow({
  activeTab,
  selectedCategory,
  setSelectedCategory,
  majorCategories,
  categories,
  fetchJavDetail,
  resetJavDetail,
  javEnrichedDetail,
  setJavEnrichedDetail,
  onSearch,
}: UseSearchFlowOptions) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();
  const { keyword, setKeyword } = useSearchStore();
  const searchMutation = useSearchMutation();
  const { data: searchHistory = [] } = useSearchHistory(20);

  // ── Search Suggestions ──
  const { suggestions, isLoading: isLoadingSuggestions, showSuggestions, setShowSuggestions } = useSearchSuggestions();

  // ── Local state (previously in searchStore) ──
  const [isSearching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [enrichedData, setEnrichedData] = useState<EnrichedSearchData | null>(null);
  const [enrichedPage, setEnrichedPage] = useState(1);

  // JAV详情提取成功后自动更新搜索历史（防循环：用 ref 跟踪已处理的 code）
  const updatedHistoryCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || !javEnrichedDetail || !searchHistory.length) return;

    const code = javEnrichedDetail.code.toUpperCase();
    if (updatedHistoryCodesRef.current.has(code)) return;

    let cancelled = false;
    const updateHistoryWithJavDetail = async () => {
      try {
        const targetHistory = searchHistory.find(h =>
          h.query.toUpperCase().includes(code) ||
          code.includes(h.query.toUpperCase())
        );

        if (targetHistory) {
          updatedHistoryCodesRef.current.add(code);

          await userApi.updateSearchHistory(targetHistory.id, {
            title: javEnrichedDetail!.title,
            code: javEnrichedDetail!.code,
            actors: javEnrichedDetail!.actresses?.join(', '),
            duration: javEnrichedDetail!.duration,
            tags: javEnrichedDetail!.tags?.join(', '),
            releaseDate: javEnrichedDetail!.releaseDate,
            publisher: javEnrichedDetail!.publisher || javEnrichedDetail!.maker,
            keyword: javEnrichedDetail!.code,
          });

          if (cancelled) return;
          queryClient.invalidateQueries({ queryKey: searchHistoryKeys.all });
        }
      } catch (error) {
        console.error('Failed to update search history with JAV detail:', error);
      }
    };

    updateHistoryWithJavDetail();
    return () => { cancelled = true; };
  }, [javEnrichedDetail, isAuthenticated, searchHistory, queryClient]);

  const searchableCategories = categories.filter(cat => {
    const mc = majorCategories.find(mc => mc.id === cat.majorCategoryId);
    const isInCurrentMajorCategory = mc?.id === SEARCH_TABS[activeTab].majorCategoryId;
    return isInCurrentMajorCategory && cat.defaultSearchable === true;
  });

  const handleSearch = useCallback(async (overrideKeyword?: string, page = 1) => {
    const query = overrideKeyword || keyword;
    if (!query.trim()) {
      toast.warning('请输入搜索关键词');
      return;
    }
    // 关闭搜索建议
    setShowSuggestions(false);
    // 通知外部（用于 URL 同步等）
    onSearch?.(query.trim());
    const sessionId = sessionStorage.getItem('analytics_session_id') || (() => {
      const id = Math.random().toString(36).slice(2);
      sessionStorage.setItem('analytics_session_id', id);
      return id;
    })();
    analyticsApi.recordEvent({
      userId: user?.id,
      sessionId,
      eventType: 'search',
      eventData: { keyword: query.trim() },
    }).catch(() => {});
    setSearching(true);
    setEnrichedData(null);
    setEnrichedPage(page);
    try {
      const response: SearchEndpointResponse = await searchMutation.mutateAsync({
        keyword: query.trim(),
        categoryId: selectedCategory || undefined,
        majorCategoryId: SEARCH_TABS[activeTab].majorCategoryId || undefined,
        page,
      });
      if (response.success && response.data) {
        if ('resultType' in response.data && ['anime', 'movie', 'jav'].includes(response.data.resultType)) {
          setEnrichedData(response.data as EnrichedSearchData);

          if (response.data.resultType === 'jav') {
            const javData = response.data as JavEnrichedData;
            if (javData.detail) {
              setJavEnrichedDetail(javData.detail as JavDetail);
            }
            if (javData.results) {
              const mapped: SearchResultItem[] = javData.results.map(r => ({
                sourceId: r.id,
                sourceName: r.name,
                sourceIcon: r.icon,
                url: r.url,
                subtitle: r.subtitle,
                siteType: r.siteType,
                category: r.category,
                description: r.description,
              }));
              setSearchResults(mapped);
            }
          } else {
            setSearchResults([]);
          }
        } else {
          const basicData = response.data as { results: SearchResponseItem[] };
          const mappedResults: SearchResultItem[] = basicData.results.map(r => ({
            sourceId: r.id,
            sourceName: r.name,
            sourceIcon: r.icon,
            url: r.url,
            subtitle: r.subtitle,
            siteType: r.siteType,
            category: r.category,
            description: r.description,
          }));
          setSearchResults(mappedResults);
          if (mappedResults.length === 0) {
            toast.info('未找到结果', '尝试更换关键词搜索');
          }
        }
        const trimmed = query.trim().toUpperCase();
        if (activeTab === 'jav' && /^[A-Z]{2,8}-?\d{2,6}$/.test(trimmed)) {
          if (!javEnrichedDetail) {
            fetchJavDetail(trimmed);
          }
        } else {
          resetJavDetail();
          setJavEnrichedDetail(null);
        }
      }
    } catch {
      toast.error('搜索失败', '请稍后重试');
    } finally {
      setSearching(false);
    }
  }, [keyword, selectedCategory, toast, activeTab, fetchJavDetail, javEnrichedDetail, resetJavDetail, user?.id, searchMutation, setJavEnrichedDetail, setShowSuggestions, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleCodeClick = (code: string) => {
    setKeyword(code);
    handleSearch(code);
  };

  const handleSuggestionSelect = (item: SearchSuggestionItem) => {
    setKeyword(item.keyword);
    handleSearch(item.keyword);
  };

  const resetResults = useCallback(() => {
    setSearchResults([]);
    setEnrichedData(null);
  }, []);

  return {
    keyword,
    setKeyword,
    selectedCategory,
    setSelectedCategory,
    isSearching,
    searchResults,
    enrichedData,
    enrichedPage,
    searchableCategories,
    handleSearch,
    handleKeyDown,
    handleCodeClick,
    resetResults,
    // Search suggestions
    suggestions,
    isLoadingSuggestions,
    showSuggestions,
    setShowSuggestions,
    handleSuggestionSelect,
  };
}
