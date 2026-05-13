import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, UserSettings } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  updateUserSettings: (settings: Partial<UserSettings>) => void;
  persistToken: (token: string) => Promise<void>;
  restoreToken: () => Promise<string | null>;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true, // 初始状态为加载中，等待初始化完成

      setUser: (user) => {
        set({ 
          user, 
          isAuthenticated: !!user,
          isLoading: false 
        });
      },
      
      setToken: (token) => {
        set({ token });
      },
      
      setLoading: (isLoading) => set({ isLoading }),
      
      updateUserSettings: (settings) => set((state) => ({
        user: state.user 
          ? { ...state.user, settings: { ...state.user.settings, ...settings } }
          : null
      })),

      // 登录时直接存 token（persist 会同步写 localStorage）
      persistToken: async (token) => {
        set({ token });
      },

      // token 已在 persist 恢复时同步写入，这里直接返回
      restoreToken: async () => {
        const { token } = get();
        return token;
      },
      
      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false
        });
      },

      initialize: () => {
        set({ isLoading: false });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token, // 直接持久化明文 token
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
