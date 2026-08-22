/**
 * GitHub OAuth 回调处理页
 * 后端回调后重定向到此页面，通过 URL query 参数接收 token 和用户信息
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useNotification } from '@/hooks';

const ERROR_MESSAGE_KEYS: Record<string, string> = {
  github_not_configured: 'auth:callback.github.notConfigured',
  github_cancelled: 'auth:callback.github.cancelled',
  github_invalid_params: 'auth:callback.invalidParams',
  github_state_mismatch: 'auth:callback.stateMismatch',
  github_token_failed: 'auth:callback.github.tokenFailed',
  github_db_error: 'auth:callback.dbError',
  github_server_error: 'auth:callback.serverError',
  account_disabled: 'auth:callback.accountDisabled',
};

export const GitHubCallbackPage: React.FC = () => {
  const { t } = useTranslation(['auth']);
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
      const msg = t(ERROR_MESSAGE_KEYS[errorCode] || 'auth:callback.github.failedWithCode', { code: errorCode });
      notification.error(t('auth:callback.loginFailedTitle'), msg);
      navigate('/login', { replace: true });
      return;
    }

    if (!token || !userRaw) {
      notification.error(t('auth:callback.loginFailedTitle'), t('auth:callback.missingParams'));
      navigate('/login', { replace: true });
      return;
    }

    try {
      const user = JSON.parse(decodeURIComponent(userRaw));
      setToken(token);
      persistToken(token);
      setUser(user);
      notification.success(t('auth:callback.loginSuccessTitle'), t('auth:callback.welcomeBack', { username: user.username }));
      navigate('/main', { replace: true });
    } catch {
      notification.error(t('auth:callback.loginFailedTitle'), t('auth:callback.parseFailed'));
      navigate('/login', { replace: true });
    }
  }, [hasHydrated, navigate, notification, persistToken, searchParams, setToken, setUser, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-[#0a0a0b]">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-stone-900 dark:bg-stone-800 flex items-center justify-center animate-pulse">
          <Github className="w-8 h-8 text-white" />
        </div>
        <p className="text-stone-600 dark:text-stone-400 text-sm font-medium">
          {t('auth:callback.github.processing')}
        </p>
      </div>
    </div>
  );
};
