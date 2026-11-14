import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, UserSettings } from '@/types';
import { clearAllPersisted } from '@/utils/persistentCache';
import { queryClient } from '@/services/api/queryClient';

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
      isLoading: true,

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
        // 清掉本地收藏/历史/推荐缓存和内存查询缓存，避免共用设备上被下一个人看到
        clearAllPersisted();
        queryClient.clear();
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
      // 持久化 token（不可变凭证）与用户快照：
      // 快照只用于断网时进入收藏/历史等本地缓存页面，联网后 initAuth 会立刻用
      // /auth/me 的结果覆盖；401 时登出并清空全部本地缓存，不会长期停留假登录态
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
      // 恢复时要求 token 与快照同时存在才算登录，避免残缺数据产生假登录态
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { token?: string | null; user?: User | null };
        const token = persisted.token ?? null;
        const user = persisted.user ?? null;
        return {
          ...currentState,
          token,
          user,
          isAuthenticated: !!(token && user),
        };
      },
    }
  )
);
