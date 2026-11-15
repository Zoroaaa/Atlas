import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import i18next from '@/i18n';
import { useAuthStore, useThemeStore, useUIStore } from '@/stores';
import { closeOAuthBrowser, hapticTap, hideSplashScreen, isNativeApp, syncStatusBar } from '@/utils/nativeShell';
import { parseOAuthDeepLink } from '@/utils/oauthDeepLink';
import { handleBackPress } from '@/utils/backStack';

/**
 * 原生壳层初始化：状态栏跟随主题、启动屏交接、Android 返回键分层处理。
 * 浏览器环境直接返回 null，不产生任何副作用。
 */
export const NativeShell: React.FC = () => {
  const { resolvedTheme } = useThemeStore();
  const navigate = useNavigate();
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);
  const persistToken = useAuthStore((s) => s.persistToken);
  const initialized = useRef(false);

  useEffect(() => {
    void syncStatusBar(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  // OAuth 深链回跳：系统浏览器授权完成后通过 atlas:// 打开 App，在这里落登录态
  useEffect(() => {
    if (!isNativeApp()) return;

    let disposed = false;
    let removeListener: (() => void) | undefined;
    let handledUrl: string | undefined;

    const handleOAuthUrl = (url: string) => {
      if (url === handledUrl) return;
      handledUrl = url;

      const payload = parseOAuthDeepLink(url);
      if (!payload) return;

      void closeOAuthBrowser();

      if (payload.error || !payload.token || !payload.user) {
        useUIStore.getState().addToast({
          type: 'error',
          title: i18next.t('auth:callback.loginFailedTitle'),
          message: payload.error
            ? i18next.t('auth:callback.failedWithCode', { code: payload.error })
            : i18next.t('auth:callback.missingParams'),
          duration: 4000,
        });
        navigate('/login', { replace: true });
        return;
      }

      setToken(payload.token);
      void persistToken(payload.token);
      setUser(payload.user);
      useUIStore.getState().addToast({
        type: 'success',
        title: i18next.t('auth:callback.loginSuccessTitle'),
        message: i18next.t('auth:callback.welcomeBack', { username: payload.user.username }),
      });
      navigate('/main', { replace: true });
    };

    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appUrlOpen', ({ url }) => handleOAuthUrl(url));
        if (disposed) {
          void listener.remove();
          return;
        }
        removeListener = () => void listener.remove();

        // 冷启动经深链打开时不会触发 appUrlOpen，需要读取启动地址
        const launchUrl = await App.getLaunchUrl();
        if (launchUrl?.url) handleOAuthUrl(launchUrl.url);
      } catch {
        // 壳层或插件不可用时忽略
      }
    })();

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [navigate, persistToken, setToken, setUser]);

  useEffect(() => {
    if (!isNativeApp() || initialized.current) return;
    initialized.current = true;

    let disposed = false;
    let removeListener: (() => void) | undefined;
    let lastBackAt = 0;

    void (async () => {
      // 等 React 首帧绘制完成再交接原生启动屏，避免出现白/黑闪
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.setTimeout(() => void hideSplashScreen(), 80);
        });
      });

      let App: typeof import('@capacitor/app')['App'];
      try {
        ({ App } = await import('@capacitor/app'));
      } catch {
        return;
      }

      const listener = await App.addListener('backButton', ({ canGoBack }) => {
        if (handleBackPress()) return;

        // React Router 会把历史栈下标写进 history.state.idx，优先按它判断
        const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (historyIndex > 0 || canGoBack) {
          window.history.back();
          return;
        }

        const now = Date.now();
        if (now - lastBackAt < 2000) {
          void App.exitApp();
          return;
        }

        lastBackAt = now;
        void hapticTap('light');
        useUIStore.getState().addToast({
          type: 'info',
          title: i18next.t('nav:appShell.exitHint'),
          duration: 1800,
          showProgress: false,
        });
      });

      if (disposed) {
        void listener.remove();
        return;
      }
      removeListener = () => void listener.remove();
    })();

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);

  return null;
};
