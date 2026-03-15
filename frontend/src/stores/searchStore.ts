import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SearchHistoryItem, FavoriteItem, SearchResult, SearchSuggestion } from '@/types';
import { MAX_LOCAL_SEARCH_HISTORY } from '@/constants';

interface SearchState {
  keyword: string;
  results: SearchResult[];
  isSearching: boolean;
  currentPage: number;
  pageSize: number;
  totalResults: number;
  hasMore: boolean;
  searchHistory: SearchHistoryItem[];
  favorites: FavoriteItem[];
  suggestions: SearchSuggestion[];
  showHistory: boolean;
  showSuggestions: boolean;
  
  setKeyword: (keyword: string) => void;
  setResults: (results: SearchResult[]) => void;
  appendResults: (results: SearchResult[]) => void;
  setSearching: (searching: boolean) => void;
  setCurrentPage: (page: number) => void;
  setTotalResults: (total: number) => void;
  setHasMore: (hasMore: boolean) => void;
  setSearchHistory: (history: SearchHistoryItem[]) => void;
  addToHistory: (item: SearchHistoryItem) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
  setFavorites: (favorites: FavoriteItem[]) => void;
  addToFavorites: (item: FavoriteItem) => void;
  removeFromFavorites: (id: string) => void;
  setSuggestions: (suggestions: SearchSuggestion[]) => void;
  setShowHistory: (show: boolean) => void;
  setShowSuggestions: (show: boolean) => void;
  resetSearch: () => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set, _get) => ({
      keyword: '',
      results: [],
      isSearching: false,
      currentPage: 1,
      pageSize: 20,
      totalResults: 0,
      hasMore: false,
      searchHistory: [],
      favorites: [],
      suggestions: [],
      showHistory: false,
      showSuggestions: false,
      
      setKeyword: (keyword) => set({ keyword }),
      setResults: (results) => set({ results }),
      appendResults: (newResults) => set((state) => ({
        results: [...state.results, ...newResults]
      })),
      setSearching: (isSearching) => set({ isSearching }),
      setCurrentPage: (currentPage) => set({ currentPage }),
      setTotalResults: (totalResults) => set({ totalResults }),
      setHasMore: (hasMore) => set({ hasMore }),
      setSearchHistory: (searchHistory) => set({ searchHistory }),
      
      addToHistory: (item) => set((state) => ({
        searchHistory: [item, ...state.searchHistory].slice(0, MAX_LOCAL_SEARCH_HISTORY)
      })),
      
      clearHistory: () => set({ searchHistory: [] }),
      
      removeFromHistory: (id) => set((state) => ({
        searchHistory: state.searchHistory.filter((h) => h.id !== id)
      })),
      
      setFavorites: (favorites) => set({ favorites }),
      
      addToFavorites: (item) => set((state) => ({
        favorites: [item, ...state.favorites]
      })),
      
      removeFromFavorites: (id) => set((state) => ({
        favorites: state.favorites.filter((f) => f.id !== id)
      })),
      
      setSuggestions: (suggestions) => set({ suggestions }),
      setShowHistory: (showHistory) => set({ showHistory }),
      setShowSuggestions: (showSuggestions) => set({ showSuggestions }),
      
      resetSearch: () => set({
        keyword: '',
        results: [],
        currentPage: 1,
        totalResults: 0,
        hasMore: false,
        showHistory: false,
        showSuggestions: false,
      }),
    }),
    {
      name: 'search-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        searchHistory: state.searchHistory,
        favorites: state.favorites,
      }),
    }
  )
);
