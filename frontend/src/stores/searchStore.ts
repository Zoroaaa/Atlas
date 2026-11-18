/**
 * 搜索工作台 UI 状态：关键词、分页与浮层开关，刷新页面即重置。
 */

import { create } from 'zustand';

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

/** 搜索页临时状态；搜索结果本身由 react-query 管理，不放进这里。 */
export const useSearchStore = create<SearchState>((set) => ({
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
}));
