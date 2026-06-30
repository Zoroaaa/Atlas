import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SearchState {
  keyword: string;
  currentPage: number;
  pageSize: number;
  showHistory: boolean;
  showSuggestions: boolean;

  setKeyword: (keyword: string) => void;
  setCurrentPage: (page: number) => void;
  setShowHistory: (show: boolean) => void;
  setShowSuggestions: (show: boolean) => void;
  resetSearch: () => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set, _get) => ({
      keyword: '',
      currentPage: 1,
      pageSize: 20,
      showHistory: false,
      showSuggestions: false,

      setKeyword: (keyword) => set({ keyword }),
      setCurrentPage: (currentPage) => set({ currentPage }),
      setShowHistory: (showHistory) => set({ showHistory }),
      setShowSuggestions: (showSuggestions) => set({ showSuggestions }),

      resetSearch: () => set({
        keyword: '',
        currentPage: 1,
        showHistory: false,
        showSuggestions: false,
      }),
    }),
    {
      name: 'search-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: () => ({}),
    }
  )
);
