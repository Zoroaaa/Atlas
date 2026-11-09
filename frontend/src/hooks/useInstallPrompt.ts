/**
 * useInstallPrompt — 自定义 PWA 安装横幅。
 *
 * - 监听 beforeinstallprompt，捕获后阻止浏览器默认迷你横幅，由站内横幅承接
 * - 点击横幅调用原生 prompt()，用户接受或关闭横幅后不再展示（localStorage 记忆）
 * - iOS Safari 没有该事件，退化为「分享 → 添加到主屏幕」的手动指引
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type InstallBannerMode = 'none' | 'prompt' | 'ios';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'pwa:install-banner-dismissed';
const INSTALLED_STORAGE_KEY = 'pwa:installed';

const readFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const writeFlag = (key: string): void => {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // 隐私模式下不可写，忽略（仅失去跨会话记忆）
  }
};

export const isStandaloneDisplay = (): boolean => {
  if (typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
};

/** iOS Safari 才支持「添加到主屏幕」，其它 iOS 浏览器不给出误导性指引 */
const isIosSafari = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
};

export interface InstallPromptState {
  mode: InstallBannerMode;
  install: () => Promise<void>;
  dismiss: () => void;
}

export const useInstallPrompt = (): InstallPromptState => {
  const [mode, setMode] = useState<InstallBannerMode>('none');
  const promptEventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (isStandaloneDisplay() || readFlag(INSTALLED_STORAGE_KEY)) return;
    dismissedRef.current = readFlag(DISMISS_STORAGE_KEY);
    if (dismissedRef.current) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      // 阻止浏览器自带的迷你安装横幅，改由站内横幅展示
      event.preventDefault();
      promptEventRef.current = event as BeforeInstallPromptEvent;
      if (!dismissedRef.current) setMode('prompt');
    };

    const handleInstalled = () => {
      promptEventRef.current = null;
      writeFlag(INSTALLED_STORAGE_KEY);
      setMode('none');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    if (isIosSafari()) setMode('ios');

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const promptEvent = promptEventRef.current;
    if (!promptEvent) return;

    promptEventRef.current = null;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);

    if (choice?.outcome === 'accepted') {
      writeFlag(INSTALLED_STORAGE_KEY);
    }
    // 无论接受还是取消原生弹窗，本次会话都不再打扰
    setMode('none');
  }, []);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    writeFlag(DISMISS_STORAGE_KEY);
    setMode('none');
  }, []);

  return { mode, install, dismiss };
};
