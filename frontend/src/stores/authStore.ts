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
      // 仅持久化 token（不可变凭证），不持久化 user（可变状态）
      // 每次启动从服务端验证 token，避免残留数据导致假登录态
      partialize: (state) => ({
        token: state.token,
      }),
      // 合并时忽略残留的 user 字段，强制为 null，等待 initAuth 从服务端恢复
      merge: (persistedState, currentState) => ({
        ...currentState,
        token: (persistedState as { token?: string | null }).token ?? null,
        user: null,
        isAuthenticated: false,
      }),
    }
  )
);
