import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Tag, SharedSource, Review } from '@/types';

interface CommunityState {
  tags: Tag[];
  sharedSources: SharedSource[];
  reviews: Record<string, Review[]>;
  selectedTag: string | null;
  isLoading: boolean;
  
  setTags: (tags: Tag[]) => void;
  addTag: (tag: Tag) => void;
  updateTag: (id: string, data: Partial<Tag>) => void;
  deleteTag: (id: string) => void;
  setSharedSources: (sources: SharedSource[]) => void;
  addSharedSource: (source: SharedSource) => void;
  updateSharedSource: (id: string, data: Partial<SharedSource>) => void;
  deleteSharedSource: (id: string) => void;
  setReviews: (sourceId: string, reviews: Review[]) => void;
  addReview: (sourceId: string, review: Review) => void;
  setSelectedTag: (tagId: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useCommunityStore = create<CommunityState>()(
  persist(
    (set) => ({
      tags: [],
      sharedSources: [],
      reviews: {},
      selectedTag: null,
      isLoading: false,
      
      setTags: (tags) => set({ tags }),
      
      addTag: (tag) => set((state) => ({
        tags: [...state.tags, tag]
      })),
      
      updateTag: (id, data) => set((state) => ({
        tags: state.tags.map((t) => (t.id === id ? { ...t, ...data } : t))
      })),
      
      deleteTag: (id) => set((state) => ({
        tags: state.tags.filter((t) => t.id !== id)
      })),
      
      setSharedSources: (sharedSources) => set({ sharedSources }),
      
      addSharedSource: (source) => set((state) => ({
        sharedSources: [source, ...state.sharedSources]
      })),
      
      updateSharedSource: (id, data) => set((state) => ({
        sharedSources: state.sharedSources.map((s) =>
          s.id === id ? { ...s, ...data } : s
        )
      })),
      
      deleteSharedSource: (id) => set((state) => ({
        sharedSources: state.sharedSources.filter((s) => s.id !== id)
      })),
      
      setReviews: (sourceId, reviews) => set((state) => ({
        reviews: { ...state.reviews, [sourceId]: reviews }
      })),
      
      addReview: (sourceId, review) => set((state) => ({
        reviews: {
          ...state.reviews,
          [sourceId]: [...(state.reviews[sourceId] || []), review]
        }
      })),
      
      setSelectedTag: (selectedTag) => set({ selectedTag }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'community-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedTag: state.selectedTag,
      }),
    }
  )
);
