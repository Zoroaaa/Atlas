import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores';
import { searchApi } from '@/services/api';
import { useSearchConfig } from '@/contexts';
import { useSearchHistory } from './useSearchHistoryQuery';
import type { SearchSuggestion } from '@/types';

interface UseSearchSuggestionsOptions {
  debounceMs?: number;
  maxSuggestions?: number;
  minChars?: number;
}

export function useSearchSuggestions(options: UseSearchSuggestionsOptions = {}) {
  const searchConfig = useSearchConfig();
  // 默认 500ms 防抖，快速输入时减少请求次数
  const { debounceMs = searchConfig.searchDebounceMs ?? 500, maxSuggestions = searchConfig.suggestionsMaxLimit, minChars = 2 } = options; // API建议最小2字符，避免单字符无效请求
  const { keyword } = useSearchStore();
  const { data: searchHistory = [] } = useSearchHistory(5);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < minChars) {
      setSuggestions([]);
      return;
    }

    // 取消上一次未完成的建议请求
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const response = await searchApi.getSuggestions(query, maxSuggestions, controller.signal);
      if (response.success && response.data) {
        setSuggestions(response.data.slice(0, maxSuggestions));
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      const isAbort =
        (error as Error).name === 'AbortError' ||
        (error as Error).message?.includes('请求超时') ||
        (error as Error).message?.toLowerCase().includes('abort');
      if (!isAbort) {
        console.error('Failed to fetch suggestions:', error);
      }
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [minChars, maxSuggestions]);

  const debouncedFetch = useCallback((query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, debounceMs);
  }, [debounceMs, fetchSuggestions]);

  useEffect(() => {
    if (keyword && keyword.trim().length > 0) {
      setShowSuggestions(true); // 有输入就开启建议（优先显示历史）
      if (keyword.length >= minChars) {
        debouncedFetch(keyword); // 达到最小长度才请求API
      } else {
        setSuggestions([]); // 太短不请求API，只显示历史
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false); // 无输入时关闭
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [keyword, minChars, debouncedFetch]);

  const getHistorySuggestions = useCallback(() => {
    if (!keyword || keyword.length < 1) {
      return searchHistory.slice(0, 5);
    }
    return searchHistory
      .filter(item => item.query.toLowerCase().includes(keyword.toLowerCase()))
      .slice(0, 5);
  }, [keyword, searchHistory]);

  const getAllSuggestions = useCallback((): SearchSuggestionItem[] => {
    const historyItems: SearchSuggestionItem[] = getHistorySuggestions().map(h => ({
      id: `history-${h.id}`,
      keyword: h.query,
      type: 'history' as const,
    }));
    const apiItems: SearchSuggestionItem[] = suggestions
      .filter(s => !historyItems.some(h => h.keyword.toLowerCase() === s.keyword.toLowerCase()))
      .map(s => ({
        id: `suggestion-${s.keyword}`,
        keyword: s.keyword,
        type: 'suggestion' as const,
        count: s.count,
      }));
    return [...historyItems, ...apiItems].slice(0, maxSuggestions);
  }, [getHistorySuggestions, suggestions, maxSuggestions]);

  return {
    suggestions: getAllSuggestions(),
    isLoading,
    showSuggestions,
    setShowSuggestions,
    fetchSuggestions,
    historySuggestions: getHistorySuggestions(),
  };
}

export interface SearchSuggestionItem {
  id: string;
  keyword: string;
  type: 'history' | 'suggestion';
  count?: number;
}
