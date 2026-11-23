/**
 * 主动登出：先通知服务端注销会话，再清理本地登录态并跳转。
 *
 * 与 `useAuthStore.logout` 的区别：store 的 logout 只清本地，用于 401、初始化失败等
 * 「会话已不可用」场景；用户主动点退出必须走这里，否则 token 在过期前仍然有效。
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/services/api';

export function useLogout() {
  const navigate = useNavigate();

  return useCallback(
    async (redirectTo = '/') => {
      try {
        await authApi.logout();
      } catch {
        // authApi.logout 的 finally 已清本地态；网络失败不阻断退出
      }
      navigate(redirectTo);
    },
    [navigate],
  );
}
