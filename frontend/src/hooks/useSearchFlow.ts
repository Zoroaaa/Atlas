import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchStore, useAuthStore } from '@/stores';
import { useSearchMutation, useSearchHistory, useSearchSuggestions, searchHistoryKeys } from '@/hooks';
import { userApi, analyticsApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useQueryClient } from '@tanstack/react-query';
import i18next from '@/i18n';
import { SEARCH_TABS } from '@/config/tabs';
import type { SearchTabType, JavSubMode } from '@/types/source';
import type { EnrichedSearchData, JavEnrichedData, NovelEnrichedData } from '@/types/search';
import type { JavDetail } from '@/types/jav';
import type { SearchEndpointResponse, SearchResponseItem } from '@/services/api/types';
import type { SearchResult } from '@/types';
import type { SearchSuggestionItem } from './useSearchSuggestions';

/** JAV 番号格式：字母(2-8位) + 可选横杠 + 数字(2-6位)，如 URVRSP-589、BUFE-133 */
export function isValidJavCode(code: string): boolean {
  return /^[A-Za-z]{2,8}-?\d{2,6}$/.test(code.trim());
}

export interface SearchResultItem extends SearchResult {
  subtitle?: string;
  siteType?: string;
  category?: string;
  description?: string;
}

interface UseSearchFlowOptions {
  activeTab: SearchTabType;
  fetchJavDetail: (code: string) => void;
  resetJavDetail: () => void;
  javEnrichedDetail: JavDetail | null;
  setJavEnrichedDetail: (detail: JavDetail | null) => void;
  javSubMode: JavSubMode;
  onSearch?: (keyword: string, subMode?: JavSubMode) => void;
}

export function useSearchFlow({
  activeTab,
  fetchJavDetail,
  resetJavDetail,
  javEnrichedDetail,
  setJavEnrichedDetail,
  javSubMode,
  onSearch,
}: UseSearchFlowOptions) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();
  const { keyword, setKeyword } = useSearchStore();
  const searchMutation = useSearchMutation();
  const { data: searchHistory = [] } = useSearchHistory(20);

  // ── Search Suggestions ──
  // 传大类 ID，后端会查该大类 + 该大类下所有子类 + 'all'
  const currentSource = SEARCH_TABS[activeTab].majorCategoryId ?? undefined;
  const { suggestions, isLoading: isLoadingSuggestions, showSuggestions, setShowSuggestions } = useSearchSuggestions({ source: currentSource });

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

  const handleSearch = useCallback(async (overrideKeyword?: string, page = 1, overrideSubMode?: JavSubMode) => {
    // overrideSubMode 用于 URL 回读场景：避免 setJavSubMode 异步导致闭包仍是旧值
    const effectiveSubMode = overrideSubMode ?? javSubMode;
    const query = overrideKeyword || keyword;
    if (!query.trim()) {
      toast.warning(i18next.t('errors:hooks.search.keywordRequired'));
      return;
    }
    // JAV 番号搜索格式校验：仅 code 模式生效
    if (activeTab === 'jav' && effectiveSubMode === 'code' && !isValidJavCode(query)) {
      toast.warning(i18next.t('errors:hooks.search.formatErrorTitle'), i18next.t('errors:hooks.search.formatErrorMessage'));
      return;
    }
    // 关闭搜索建议
    setShowSuggestions(false);
    // 通知外部（用于 URL 同步等）：携带 effectiveSubMode，避免外部闭包捕获旧 javSubMode
    onSearch?.(query.trim(), activeTab === 'jav' ? effectiveSubMode : undefined);
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
        majorCategoryId: SEARCH_TABS[activeTab].majorCategoryId || undefined,
        page,
        javSubMode: activeTab === 'jav' ? effectiveSubMode : undefined,
      });
      if (response.success && response.data) {
        if ('resultType' in response.data && ['anime', 'movie', 'jav', 'manga', 'novel'].includes(response.data.resultType)) {
          setEnrichedData(response.data as EnrichedSearchData);

          if (response.data.resultType === 'jav') {
            const javData = response.data as JavEnrichedData;

            // 检查是否有具体错误信息（如"未找到番号"、"无效格式"）
            const errorMsg = javData.errors?.search;
            if (errorMsg && javData.total === 0) {
              // 区分不同错误类型，给出更精确的提示
              if (errorMsg.includes('未找到') || errorMsg.includes('无该')) {
                toast.info(i18next.t('errors:hooks.search.resourceNotFoundTitle'), errorMsg);
              } else if (errorMsg.includes('格式') || errorMsg.includes('无效')) {
                toast.warning(i18next.t('errors:hooks.search.formatErrorTitle'), errorMsg);
              } else {
                toast.info(i18next.t('errors:hooks.search.noResultsTitle'), errorMsg);
              }
            }

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
            // Novel: 注入多源跳转卡片（与 JAV 机制一致）
            if (response.data.resultType === 'novel') {
              const novelData = response.data as NovelEnrichedData;
              if (novelData.results && novelData.results.length > 0) {
                setSearchResults(novelData.results.map(r => ({
                  sourceId: r.id,
                  sourceName: r.name,
                  sourceIcon: r.icon,
                  url: r.url,
                  subtitle: r.subtitle,
                  siteType: r.siteType,
                  category: r.category,
                  description: r.description,
                })));
              } else {
                setSearchResults([]);
              }
            } else {
              setSearchResults([]);
            }
            // Anime/Movie: 检查聚合搜索的各数据源错误
            const enriched = response.data as EnrichedSearchData;
            if ('errors' in enriched && enriched.total === 0) {
              const errors = enriched.errors as Record<string, string | null>;
              const errorKeys = Object.keys(errors).filter(k => errors[k]);
              if (errorKeys.length > 0) {
                toast.info(i18next.t('errors:hooks.search.noRelatedResourcesTitle'), i18next.t('errors:hooks.search.noRelatedResourcesMessage'));
              }
            }
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
            toast.info(i18next.t('errors:hooks.search.notFoundTitle'), i18next.t('errors:hooks.search.notFoundMessage'));
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : i18next.t('errors:hooks.search.searchFailedDefault');
      toast.error(i18next.t('errors:hooks.search.searchFailedTitle'), errorMessage);
    } finally {
      setSearching(false);
    }
  }, [keyword, toast, activeTab, javSubMode, fetchJavDetail, javEnrichedDetail, resetJavDetail, user?.id, searchMutation, setJavEnrichedDetail, setShowSuggestions, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleCodeClick = (code: string) => {
    setKeyword(code);
    handleSearch(code);
    // 点击番号后自动滚动到顶部搜索区域，让用户感知到切换
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSuggestionSelect = (item: SearchSuggestionItem) => {
    setKeyword(item.keyword);
    handleSearch(item.keyword);
  };

  const resetResults = useCallback(() => {
    setSearchResults([]);
    setEnrichedData(null);
  }, []);

  // JAV 输入格式校验：仅在 JAV tab + code 模式且输入非空时生效
  const javFormatValid = activeTab === 'jav' && javSubMode === 'code' && keyword.trim().length > 0
    ? isValidJavCode(keyword)
    : true;

  return {
    keyword,
    setKeyword,
    isSearching,
    searchResults,
    enrichedData,
    enrichedPage,
    handleSearch,
    handleKeyDown,
    handleCodeClick,
    resetResults,
    javFormatValid,
    // Search suggestions
    suggestions,
    isLoadingSuggestions,
    showSuggestions,
    setShowSuggestions,
    handleSuggestionSelect,
  };
}
