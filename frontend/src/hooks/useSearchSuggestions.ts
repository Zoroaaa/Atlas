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
  source?: string;
}

/** JAV 番号格式：字母(2-8位) + 可选横杠 + 数字(2-6位)，如 URVRSP-589 / URVRSP589 */
const JAV_CODE_RE = /^[A-Za-z]{2,8}-?\d{2,6}$/;

/** 去掉横杠，使 WAAA-624 与 WAAA624 成为同一个 key */
function compactJavCode(value: string): string {
  return value.trim().toUpperCase().replace(/-/g, '');
}

function isJavCode(value: string): boolean {
  return JAV_CODE_RE.test(value.trim());
}

/** 同一番号同时给出带横杠和不带横杠两种写法 */
function expandJavCodeVariants(code: string): string[] {
  const m = compactJavCode(code).match(/^([A-Z]+)(\d+)$/);
  return m ? [`${m[1]}-${m[2]}`, `${m[1]}${m[2]}`] : [code.trim()];
}

export function useSearchSuggestions(options: UseSearchSuggestionsOptions = {}) {
  const searchConfig = useSearchConfig();
  // 默认 500ms 防抖，快速输入时减少请求次数
  const { debounceMs = searchConfig.searchDebounceMs ?? 500, maxSuggestions = searchConfig.suggestionsMaxLimit, minChars = 2, source } = options; // API建议最小2字符，避免单字符无效请求
  const { keyword } = useSearchStore();
  const { data: searchHistory = [] } = useSearchHistory(5);
  const isJavSource = source === 'jav_sources';
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
      const response = await searchApi.getSuggestions(query, maxSuggestions, controller.signal, source);
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
  }, [minChars, maxSuggestions, source]);

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
    const lowerKeyword = keyword.trim().toLowerCase();
    const compactKeyword = compactJavCode(keyword);
    return searchHistory
      .filter(item => {
        // JAV 番号：忽略横杠参与匹配（WAAA-624 与 WAAA624 等价）
        if (isJavSource && isJavCode(item.query)) {
          return compactJavCode(item.query).includes(compactKeyword);
        }
        return item.query.toLowerCase().includes(lowerKeyword);
      })
      .slice(0, 5);
  }, [keyword, searchHistory, isJavSource]);

  const getAllSuggestions = useCallback((): SearchSuggestionItem[] => {
    const result: SearchSuggestionItem[] = [];
    const seen = new Set<string>();
    const normalizeKey = (value: string) =>
      isJavSource && isJavCode(value) ? `jav:${compactJavCode(value)}` : value.trim().toLowerCase();
    const expand = (value: string) =>
      isJavSource && isJavCode(value) ? expandJavCodeVariants(value) : [value.trim()];

    // 历史优先，其次 API 建议；同番号的两种写法去重后展示
    for (const h of getHistorySuggestions()) {
      for (const keyword of expand(h.query)) {
        const key = normalizeKey(keyword);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ id: `history-${h.id}-${keyword}`, keyword, type: 'history' as const });
      }
    }
    for (const s of suggestions) {
      for (const keyword of expand(s.keyword)) {
        const key = normalizeKey(keyword);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ id: `suggestion-${keyword}`, keyword, type: 'suggestion' as const, count: s.count });
      }
    }
    return result.slice(0, maxSuggestions);
  }, [getHistorySuggestions, suggestions, maxSuggestions, isJavSource]);

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
