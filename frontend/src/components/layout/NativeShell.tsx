import React, { useEffect, useRef } from 'react';
import i18next from '@/i18n';
import { useThemeStore, useUIStore } from '@/stores';
import { hapticTap, hideSplashScreen, isNativeApp, syncStatusBar } from '@/utils/nativeShell';
import { handleBackPress } from '@/utils/backStack';

/**
 * 原生壳层初始化：状态栏跟随主题、启动屏交接、Android 返回键分层处理。
 * 浏览器环境直接返回 null，不产生任何副作用。
 */
export const NativeShell: React.FC = () => {
  const { resolvedTheme } = useThemeStore();
  const initialized = useRef(false);

  useEffect(() => {
    void syncStatusBar(resolvedTheme === 'dark');
  }, [resolvedTheme]);

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
