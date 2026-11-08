import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SearchTabType } from '@/types';

interface SourceState {
  activeTab: SearchTabType;
  setActiveTab: (tab: SearchTabType) => void;
}

export const useSourceStore = create<SourceState>()(
  persist(
    (set) => ({
      activeTab: 'jav',
      setActiveTab: (activeTab) => set({ activeTab }),
    }),
    {
      name: 'source-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
      }),
    }
  )
);
