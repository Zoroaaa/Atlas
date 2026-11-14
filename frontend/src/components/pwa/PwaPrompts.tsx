import React from 'react';
import { InstallBanner } from './InstallBanner';
import { UpdatePrompt } from './UpdatePrompt';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useAppUpdateStore, selectShouldPrompt } from '@/stores';
import { isAppShell } from '@/utils/appShell';

/**
 * PWA 全局提示：更新确认 + 安装横幅。
 * 更新提示优先，避免两个固定定位的横幅在移动端互相遮挡。
 */
export const PwaPrompts: React.FC = () => {
  const { status, applyUpdate, dismissUpdate } = useServiceWorkerUpdate();
  const { mode, install, dismiss } = useInstallPrompt();
  const appUpdateAvailable = useAppUpdateStore(selectShouldPrompt);

  // APK 更新优先；两者同时出现时避免底部横幅叠在一起
  if (appUpdateAvailable) return null;

  if (status !== 'idle') {
    return <UpdatePrompt status={status} onConfirm={applyUpdate} onDismiss={dismissUpdate} />;
  }

  // 原生壳内安装 PWA 没有意义，只在浏览器展示
  if (mode !== 'none' && !isAppShell()) {
    return <InstallBanner mode={mode} onInstall={() => void install()} onDismiss={dismiss} />;
  }

  return null;
};
