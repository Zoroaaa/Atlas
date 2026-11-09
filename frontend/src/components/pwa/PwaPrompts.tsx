import React from 'react';
import { InstallBanner } from './InstallBanner';
import { UpdatePrompt } from './UpdatePrompt';
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

/**
 * PWA 全局提示：更新确认 + 安装横幅。
 * 更新提示优先，避免两个固定定位的横幅在移动端互相遮挡。
 */
export const PwaPrompts: React.FC = () => {
  const { status, applyUpdate, dismissUpdate } = useServiceWorkerUpdate();
  const { mode, install, dismiss } = useInstallPrompt();

  if (status !== 'idle') {
    return <UpdatePrompt status={status} onConfirm={applyUpdate} onDismiss={dismissUpdate} />;
  }

  if (mode !== 'none') {
    return <InstallBanner mode={mode} onInstall={() => void install()} onDismiss={dismiss} />;
  }

  return null;
};
