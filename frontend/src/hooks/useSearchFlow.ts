import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchStore, useAuthStore } from '@/stores';
import { useSearchMutation, useSearchHistory, useSearchSuggestions, searchHistoryKeys } from '@/hooks';
import { userApi, analyticsApi } from '@/services/api';
import { useToast } from '@/hooks/useNotification';
import { useQueryClient } from '@tanstack/react-query';
import { isJavCodeLike, normalizeJavCode } from '@codeseek/shared/utils';
import { reportSourceUsage } from '@/utils/sourceUsage';
import i18next from '@/i18n';
import { SEARCH_TABS } from '@/config/tabs';
import type { SearchTabType, JavSubMode } from '@/types/source';
import type { EnrichedSearchData, JavEnrichedData, NovelEnrichedData } from '@/types/search';
import type { JavDetail } from '@/types/jav';
import type { SearchEndpointResponse, SearchResponseItem } from '@/services/api/types';
import type { SearchResult } from '@/types';
import type { SearchSuggestionItem } from './useSearchSuggestions';

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
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [enrichedData, setEnrichedData] = useState<EnrichedSearchData | null>(null);
  const [enrichedPage, setEnrichedPage] = useState(1);

  // JAV详情提取成功后自动更新搜索历史（防循环：用 ref 跟踪已处理的 code）
  const updatedHistoryCodesRef = useRef<Set<string>>(new Set());
  // 搜索请求序号：只接受最后一次请求的响应，避免旧响应覆盖新结果
  const searchRequestIdRef = useRef(0);

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
    const requestId = ++searchRequestIdRef.current;
    // 番号模式不再硬拦截：识别不了的输入由后端按标题/多源搜索回退
    setHasSearched(true);
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
      // 已有更新的搜索发起，丢弃本次过期响应
      if (requestId !== searchRequestIdRef.current) return;
      if (response.success && response.data) {
        if ('resultType' in response.data && ['anime', 'movie', 'jav', 'manga', 'novel'].includes(response.data.resultType)) {
          setEnrichedData(response.data as EnrichedSearchData);

          if (response.data.resultType === 'jav') {
            const javData = response.data as JavEnrichedData;

            // 检查是否有具体错误信息（如"未找到番号"、"源不可用"）
            const errorMsg = javData.errors?.search;
            if (errorMsg && javData.total === 0) {
              // 依据后端返回的失败语义区分：源异常不能报成「查无此号」
              if (javData.searchErrorKind === 'SOURCE_UNAVAILABLE') {
                toast.warning(i18next.t('errors:hooks.search.sourceUnavailableTitle'), errorMsg);
              } else if (javData.searchErrorKind === 'NOT_FOUND') {
                toast.info(i18next.t('errors:hooks.search.resourceNotFoundTitle'), errorMsg);
              } else {
                toast.info(i18next.t('errors:hooks.search.noResultsTitle'), errorMsg);
              }
            }

            if (javData.detail) {
              setJavEnrichedDetail(javData.detail as JavDetail);
            }
            if (javData.fallback === 'title') {
              toast.info(
                i18next.t('errors:hooks.search.fallbackTitleTitle'),
                i18next.t('errors:hooks.search.fallbackTitleMessage')
              );
            } else if (javData.fallback === 'sources-only') {
              toast.info(
                i18next.t('errors:hooks.search.fallbackSourcesTitle'),
                i18next.t('errors:hooks.search.fallbackSourcesMessage')
              );
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
              reportSourceUsage(mapped.map((item) => item.sourceId));
            }
          } else {
            // Novel: 注入多源跳转卡片（与 JAV 机制一致）
            if (response.data.resultType === 'novel') {
              const novelData = response.data as NovelEnrichedData;
              if (novelData.results && novelData.results.length > 0) {
                const mapped = novelData.results.map(r => ({
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
                reportSourceUsage(mapped.map((item) => item.sourceId));
              } else {
                setSearchResults([]);
              }
            } else {
              // Anime/Movie/Manga: 后端按「真实在跑的抓取器」注入源卡片（sourceCards），
              // 与 JAV/Novel 的 results 结构一致，统一映射到 searchResults 供右侧源栏使用
              const cards = (response.data as {
                sourceCards?: Array<{
                  id: string; name: string; icon?: string; url: string;
                  subtitle?: string; siteType: string; category: string; description?: string;
                }>;
              }).sourceCards;
              if (cards && cards.length > 0) {
                const mapped = cards.map(r => ({
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
                reportSourceUsage(mapped.map((item) => item.sourceId));
              } else {
                setSearchResults([]);
              }
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
          reportSourceUsage(mappedResults.map((item) => item.sourceId));
          if (mappedResults.length === 0) {
            toast.info(i18next.t('errors:hooks.search.notFoundTitle'), i18next.t('errors:hooks.search.notFoundMessage'));
          }
        }
        const trimmed = query.trim();
        if (activeTab === 'jav' && isJavCodeLike(trimmed)) {
          // 搜索响应已带详情（本地库或 JavBus）时不再单独请求，避免重复回源
          const hasEnrichedDetail = 'resultType' in response.data
            && response.data.resultType === 'jav'
            && Boolean((response.data as JavEnrichedData).detail);
          // 只有当前详情不是本次番号时才重新拉取，避免沿用上一个番号的详情
          const normalized = normalizeJavCode(trimmed);
          if (!hasEnrichedDetail && (!javEnrichedDetail || (normalized && javEnrichedDetail.code?.toUpperCase() !== normalized.toUpperCase()))) {
            fetchJavDetail(trimmed);
          }
        } else {
          resetJavDetail();
          setJavEnrichedDetail(null);
        }
      }
    } catch (err) {
      if (requestId !== searchRequestIdRef.current) return;
      const errorMessage = err instanceof Error ? err.message : i18next.t('errors:hooks.search.searchFailedDefault');
      toast.error(i18next.t('errors:hooks.search.searchFailedTitle'), errorMessage);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setSearching(false);
      }
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
    // 使仍在途的搜索响应失效，避免切 Tab 后旧结果回填
    searchRequestIdRef.current += 1;
    setSearching(false);
    setSearchResults([]);
    setEnrichedData(null);
    setHasSearched(false);
  }, []);

  // JAV 输入提示：仅在 JAV tab + code 模式且输入非空、未识别为标准番号时显示
  const javFormatHintVisible = activeTab === 'jav' && javSubMode === 'code' && keyword.trim().length > 0
    ? !isJavCodeLike(keyword)
    : false;

  return {
    keyword,
    setKeyword,
    isSearching,
    hasSearched,
    searchResults,
    enrichedData,
    enrichedPage,
    handleSearch,
    handleKeyDown,
    handleCodeClick,
    resetResults,
    javFormatHintVisible,
    // Search suggestions
    suggestions,
    isLoadingSuggestions,
    showSuggestions,
    setShowSuggestions,
    handleSuggestionSelect,
  };
}
