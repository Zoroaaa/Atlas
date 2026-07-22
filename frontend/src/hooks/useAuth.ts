import { useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores';
import { authApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import type { User } from '@/types';

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<boolean>;
  sendVerificationCode: (email: string, type: string) => Promise<boolean>;
  deleteAccount: (password: string, verificationCode: string, confirmText: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const toast = useToast();
  const { user, token, setUser, setToken, logout: logoutStore, restoreToken, initialize, persistToken } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      initialize();
      await restoreToken();
      setIsInitializing(false);
    };
    initAuth();
  }, [initialize, restoreToken]);

  const refreshUser = useCallback(async () => {
    if (!token) return;

    try {
      const response = await authApi.getCurrentUser();
      if (response.success && response.data) {
        setUser(response.data);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
      logoutStore();
    }
  }, [token, setUser, logoutStore]);

  const login = useCallback(async (identifier: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authApi.login({ identifier, password });
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.token);
        persistToken(response.data.token);
        toast.success('登录成功', `欢迎回来，${response.data.user.username}`);
        return true;
      }
      toast.error('登录失败', response.message || '登录失败');
      return false;
    } catch (error) {
      const { message = '登录失败，请稍后重试' } = error instanceof Error ? error : { message: '登录失败，请稍后重试' };
      toast.error('登录失败', message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setToken, persistToken, toast]);

  const register = useCallback(async (username: string, email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authApi.register({ username, email, password });
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.token);
        persistToken(response.data.token);
        toast.success('注册成功', '欢迎加入 Atlas');
        return true;
      }
      toast.error('注册失败', response.message || '注册失败');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '注册失败，请稍后重试';
      toast.error('注册失败', message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setToken, persistToken, toast]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logoutStore();
      toast.success('已退出登录');
    }
  }, [logoutStore, toast]);

  const updateProfile = useCallback(async (data: Partial<User>): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authApi.getCurrentUser();
      if (response.success && response.data) {
        setUser({ ...response.data, ...data });
        toast.success('更新成功');
        return true;
      }
      toast.error('更新失败');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新失败';
      toast.error('更新失败', message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setUser, toast]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authApi.changePassword({ currentPassword, newPassword });
      if (response.success) {
        toast.success('密码已更新', '请使用新密码登录');
        return true;
      }
      toast.error('修改失败', response.message || '修改失败');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '修改失败';
      toast.error('修改失败', message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const requestPasswordReset = useCallback(async (email: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authApi.forgotPassword({ email });
      if (response.success) {
        toast.success('邮件已发送', '请检查您的邮箱');
        return true;
      }
      toast.error('发送失败', '发送验证码失败');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败';
      toast.error('发送失败', message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authApi.resetPassword({ email, verificationCode: code, newPassword });
      if (response.success) {
        toast.success('密码已重置', '请使用新密码登录');
        return true;
      }
      toast.error('重置失败', response.message || '重置失败');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '重置失败';
      toast.error('重置失败', message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const sendVerificationCode = useCallback(async (email: string, type: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authApi.smartSendCode({ 
        email, 
        verificationType: type as 'registration' | 'password_reset' | 'email_change_old' | 'email_change_new' | 'account_delete'
      });
      if (response.success) {
        toast.success('验证码已发送', '请检查您的邮箱');
        return true;
      }
      toast.error('发送失败', '发送验证码失败');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败';
      toast.error('发送失败', message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const deleteAccount = useCallback(async (password: string, verificationCode: string, confirmText: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authApi.deleteAccount({ password, verificationCode, confirmText });
      if (response.success) {
        logoutStore();
        toast.success('账户已删除');
        return true;
      }
      toast.error('删除失败', response.message || '删除失败');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      toast.error('删除失败', message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [logoutStore, toast]);

  const [refreshUserCalled, setRefreshUserCalled] = useState(false);

  // 当 token 存在但 user 为空时，自动刷新用户信息
  // 防循环：用 refreshUserCalled 标记避免接口返回空数据时无限重试
  useEffect(() => {
    if (!isInitializing && token && !user && !refreshUserCalled) {
      setRefreshUserCalled(true);
      refreshUser();
    }
    // 用户主动登出或 token 失效后，允许下次登录时再次自动刷新
    if (!token || isInitializing) {
      setRefreshUserCalled(false);
    }
  }, [token, user, refreshUser, isInitializing, refreshUserCalled]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading: isLoading || isInitializing,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    requestPasswordReset,
    resetPassword,
    sendVerificationCode,
    deleteAccount,
    refreshUser,
  };
}
