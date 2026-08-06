/**
 * Google OAuth 回调处理页
 * 后端回调后重定向到此页面，通过 URL query 参数接收 token 和用户信息
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chrome } from 'lucide-react';
import { useAuthStore } from '@/stores';
import { useNotification } from '@/hooks';

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: 'Google 登录未配置，请联系管理员',
  google_cancelled: '已取消 Google 授权',
  google_invalid_params: 'OAuth 参数异常，请重试',
  google_state_mismatch: '安全校验失败，请重新发起登录',
  google_token_failed: '获取 Google 授权失败，请重试',
  google_email_not_verified: 'Google 邮箱未验证，无法登录',
  google_db_error: '用户数据处理失败，请重试',
  google_server_error: '服务器内部错误，请稍后重试',
  account_disabled: '该账号已被禁用',
};

export const GoogleCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser, setToken, persistToken } = useAuthStore();
  const notification = useNotification();
  const processed = useRef(false);
  const hasHydrated = useAuthStore.persist.hasHydrated();

  useEffect(() => {
    if (processed.current) return;
    if (!hasHydrated) return;
    processed.current = true;

    const token = searchParams.get('token');
    const userRaw = searchParams.get('user');
    const errorCode = searchParams.get('error');

    if (errorCode) {
      const msg = ERROR_MESSAGES[errorCode] || `Google 登录失败 (${errorCode})`;
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
  }, [hasHydrated, navigate, notification, persistToken, searchParams, setToken, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-[#0a0a0b]">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center animate-pulse shadow-md">
          <Chrome className="w-8 h-8 text-blue-500" />
        </div>
        <p className="text-stone-600 dark:text-stone-400 text-sm font-medium">
          正在处理 Google 登录…
        </p>
      </div>
    </div>
  );
};
