import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchStore } from '@/stores';
import { searchApi } from '@/services/api';
import { useValidationRules, useSearchConfig } from '@/contexts';

interface UseSearchSuggestionsOptions {
  debounceMs?: number;
  maxSuggestions?: number;
  minChars?: number;
}

export function useSearchSuggestions(options: UseSearchSuggestionsOptions = {}) {
  const validationRules = useValidationRules();
  const searchConfig = useSearchConfig();
  const { debounceMs = searchConfig.searchDebounceMs, maxSuggestions = searchConfig.suggestionsMaxLimit, minChars = validationRules.SEARCH_KEYWORD_MIN_LENGTH } = options;
  const { suggestions, setSuggestions, searchHistory, keyword } = useSearchStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < minChars) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await searchApi.getSuggestions(query);
      if (response.success && response.data) {
        setSuggestions(response.data.slice(0, maxSuggestions));
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [minChars, maxSuggestions, setSuggestions]);

  const debouncedFetch = useCallback((query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, debounceMs);
  }, [debounceMs, fetchSuggestions]);

  useEffect(() => {
    if (keyword && keyword.length >= minChars) {
      debouncedFetch(keyword);
    } else {
      setSuggestions([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [keyword, minChars, debouncedFetch, setSuggestions]);

  const getHistorySuggestions = useCallback(() => {
    if (!keyword || keyword.length < 1) {
      return searchHistory.slice(0, 5);
    }
    return searchHistory
      .filter(item => item.query.toLowerCase().includes(keyword.toLowerCase()))
      .slice(0, 5);
  }, [keyword, searchHistory]);

  const getAllSuggestions = useCallback(() => {
    const historySuggestions = getHistorySuggestions();
    const apiSuggestions = suggestions.filter(
      s => !historySuggestions.some(h => h.query.toLowerCase() === s.keyword.toLowerCase())
    );
    return [...historySuggestions, ...apiSuggestions].slice(0, maxSuggestions);
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

export interface SearchSuggestion {
  id: string;
  keyword: string;
  type: 'history' | 'suggestion';
  count?: number;
}
