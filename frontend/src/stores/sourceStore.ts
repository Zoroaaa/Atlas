import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MajorCategory, Category, SearchSource, UserSourceConfig, SourceCheckResult, SearchTabType } from '@/types';

// Tab 类型与 MajorCategory 的映射关系
const getMajorCategoryIdByTab = (tab: string): string | null => {
  const mapping: Record<string, string | null> = {
    jav: 'jav_sources',
    anime: 'anime_sources',
    movie: 'movie_sources',
    manga: 'manga_sources',
    sources: null,
    community: null,
  };
  return mapping[tab] ?? null;
};

interface SourceState {
  majorCategories: MajorCategory[];
  categories: Category[];
  sources: SearchSource[];
  userConfigs: UserSourceConfig[];
  selectedMajorCategory: string | null;
  selectedCategory: string | null;
  selectedSources: string[];
  activeTab: SearchTabType;
  checkResults: Map<string, SourceCheckResult>;
  isLoading: boolean;
  
  setMajorCategories: (categories: MajorCategory[]) => void;
  setCategories: (categories: Category[]) => void;
  setSources: (sources: SearchSource[]) => void;
  setUserConfigs: (configs: UserSourceConfig[]) => void;
  setSelectedMajorCategory: (id: string | null) => void;
  setSelectedCategory: (id: string | null) => void;
  setSelectedSources: (ids: string[]) => void;
  setActiveTab: (tab: SearchTabType) => void;
  toggleSourceSelection: (id: string) => void;
  selectAllSources: () => void;
  clearSourceSelection: () => void;
  updateCheckResult: (sourceId: string, result: SourceCheckResult) => void;
  setLoading: (loading: boolean) => void;
  addMajorCategory: (category: MajorCategory) => void;
  updateMajorCategory: (id: string, data: Partial<MajorCategory>) => void;
  deleteMajorCategory: (id: string) => void;
  addCategory: (category: Category) => void;
  updateCategory: (id: string, data: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  addSource: (source: SearchSource) => void;
  updateSource: (id: string, data: Partial<SearchSource>) => void;
  deleteSource: (id: string) => void;
  updateUserConfig: (sourceId: string, config: Partial<UserSourceConfig>) => void;
}

export const useSourceStore = create<SourceState>()(
  persist(
    (set, get) => ({
      majorCategories: [],
      categories: [],
      sources: [],
      userConfigs: [],
      selectedMajorCategory: null,
      selectedCategory: null,
      selectedSources: [],
      activeTab: 'jav',
      checkResults: new Map(),
      isLoading: false,
      
      setMajorCategories: (majorCategories) => set({ majorCategories }),
      setCategories: (categories) => set({ categories }),
      setSources: (sources) => set({ sources }),
      setUserConfigs: (userConfigs) => set({ userConfigs }),
      setSelectedMajorCategory: (selectedMajorCategory) => set({ 
        selectedMajorCategory,
        selectedCategory: null,
        selectedSources: []
      }),
      setSelectedCategory: (selectedCategory) => set({ 
        selectedCategory,
        selectedSources: []
      }),
      setSelectedSources: (selectedSources) => set({ selectedSources }),
      
      setActiveTab: (activeTab) => set({ 
        activeTab,
        // 切换Tab时自动更新selectedMajorCategory，并清空子级选择
        selectedMajorCategory: getMajorCategoryIdByTab(activeTab),
        selectedCategory: null,
        selectedSources: []
      }),
      
      toggleSourceSelection: (id) => set((state) => ({
        selectedSources: state.selectedSources.includes(id)
          ? state.selectedSources.filter((s) => s !== id)
          : [...state.selectedSources, id]
      })),
      
      selectAllSources: () => {
        const { sources, selectedCategory } = get();
        const filteredSources = selectedCategory
          ? sources.filter((s) => s.categoryId === selectedCategory)
          : sources;
        set({ selectedSources: filteredSources.map((s) => s.id) });
      },
      
      clearSourceSelection: () => set({ selectedSources: [] }),
      
      updateCheckResult: (sourceId, result) => {
        const { checkResults } = get();
        const newResults = new Map(checkResults);
        newResults.set(sourceId, result);
        set({ checkResults: newResults });
      },
      
      setLoading: (isLoading) => set({ isLoading }),
      
      addMajorCategory: (category) => set((state) => ({
        majorCategories: [...state.majorCategories, category]
      })),
      
      updateMajorCategory: (id, data) => set((state) => ({
        majorCategories: state.majorCategories.map((c) =>
          c.id === id ? { ...c, ...data } : c
        )
      })),
      
      deleteMajorCategory: (id) => set((state) => ({
        majorCategories: state.majorCategories.filter((c) => c.id !== id)
      })),
      
      addCategory: (category) => set((state) => ({
        categories: [...state.categories, category]
      })),
      
      updateCategory: (id, data) => set((state) => ({
        categories: state.categories.map((c) =>
          c.id === id ? { ...c, ...data } : c
        )
      })),
      
      deleteCategory: (id) => set((state) => ({
        categories: state.categories.filter((c) => c.id !== id)
      })),
      
      addSource: (source) => set((state) => ({
        sources: [...state.sources, source]
      })),
      
      updateSource: (id, data) => set((state) => ({
        sources: state.sources.map((s) =>
          s.id === id ? { ...s, ...data } : s
        )
      })),
      
      deleteSource: (id) => set((state) => ({
        sources: state.sources.filter((s) => s.id !== id)
      })),
      
      updateUserConfig: (sourceId, config) => set((state) => ({
        userConfigs: state.userConfigs.map((c) =>
          c.sourceId === sourceId ? { ...c, ...config } : c
        )
      })),
    }),
    {
      name: 'source-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedMajorCategory: state.selectedMajorCategory,
        selectedCategory: state.selectedCategory,
        selectedSources: state.selectedSources,
        activeTab: state.activeTab,
      }),
    }
  )
);
