/**
 * GitHub OAuth 回调处理页
 * 后端回调后重定向到此页面，通过 URL query 参数接收 token 和用户信息
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Github } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { useNotification } from '@/hooks';

const ERROR_MESSAGES: Record<string, string> = {
  github_not_configured: 'GitHub 登录未配置，请联系管理员',
  github_cancelled: '已取消 GitHub 授权',
  github_invalid_params: 'OAuth 参数异常，请重试',
  github_state_mismatch: '安全校验失败，请重新发起登录',
  github_token_failed: '获取 GitHub 授权失败，请重试',
  github_db_error: '用户数据处理失败，请重试',
  github_server_error: '服务器内部错误，请稍后重试',
  account_disabled: '该账号已被禁用',
};

export const GitHubCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser, setToken, persistToken } = useAuthStore();
  const notification = useNotification();
  const processed = useRef(false);
  // 等待 zustand persist 从 localStorage 恢复完成，避免 hydration 覆盖新 token
  const hasHydrated = useAuthStore.persist.hasHydrated();

  useEffect(() => {
    // 严格模式下 useEffect 会执行两次，用 ref 防止重复处理
    if (processed.current) return;

    // persist 尚未 hydrate 完成，等下一轮 effect
    if (!hasHydrated) return;
    processed.current = true;

    const token = searchParams.get('token');
    const userRaw = searchParams.get('user');
    const errorCode = searchParams.get('error');

    if (errorCode) {
      const msg = ERROR_MESSAGES[errorCode] || `GitHub 登录失败 (${errorCode})`;
      notification.error('登录失败', msg);
      navigate('/login', { replace: true });
      return;
    }

    if (!token || !userRaw) {
      notification.error('登录失败', '回调参数缺失，请重试');
      navigate('/login', { replace: true });
      return;
    }

    try {
      const user = JSON.parse(decodeURIComponent(userRaw));
      setToken(token);
      persistToken(token);
      setUser(user);
      notification.success('登录成功', `欢迎回来，${user.username}！`);
      navigate('/main', { replace: true });
    } catch {
      notification.error('登录失败', '用户数据解析失败，请重试');
      navigate('/login', { replace: true });
    }
  }, [hasHydrated]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center animate-pulse">
          <Github className="w-8 h-8 text-white" />
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
          正在处理 GitHub 登录…
        </p>
      </div>
    </div>
  );
};
