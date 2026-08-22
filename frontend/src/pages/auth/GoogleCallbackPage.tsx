/**
 * Google OAuth 回调处理页
 * 后端回调后重定向到此页面，通过 URL query 参数接收 token 和用户信息
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chrome } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useNotification } from '@/hooks';

const ERROR_MESSAGE_KEYS: Record<string, string> = {
  google_not_configured: 'auth:callback.google.notConfigured',
  google_cancelled: 'auth:callback.google.cancelled',
  google_invalid_params: 'auth:callback.invalidParams',
  google_state_mismatch: 'auth:callback.stateMismatch',
  google_token_failed: 'auth:callback.google.tokenFailed',
  google_email_not_verified: 'auth:callback.google.emailNotVerified',
  google_db_error: 'auth:callback.dbError',
  google_server_error: 'auth:callback.serverError',
  account_disabled: 'auth:callback.accountDisabled',
};

export const GoogleCallbackPage: React.FC = () => {
  const { t } = useTranslation(['auth']);
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
      const msg = t(ERROR_MESSAGE_KEYS[errorCode] || 'auth:callback.google.failedWithCode', { code: errorCode });
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
        <div className="w-16 h-16 mx-auto rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center animate-pulse shadow-md">
          <Chrome className="w-8 h-8 text-blue-500" />
        </div>
        <p className="text-stone-600 dark:text-stone-400 text-sm font-medium">
          {t('auth:callback.google.processing')}
        </p>
      </div>
    </div>
  );
};
