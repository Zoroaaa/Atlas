/**
 * AccountLayout - 个人资料 / 系统设置
 *
 * 桌面端纳入统一 AppShell（个人中心工作区），侧栏高亮「个人资料 / 账号设置」；
 * 移动端保持独立页面，设置页由返回栏回到「我的」。
 */
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIsDesktop } from '@/hooks';
import { AppShell } from './AppShell';
import { MobileSectionHeader } from './MobileSectionPage';

export const AccountLayout: React.FC = () => {
  const { t } = useTranslation(['nav']);
  const location = useLocation();
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  }

  const isSettings = location.pathname.startsWith('/settings');

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0a0a0b]">
      {isSettings ? (
        <MobileSectionHeader title={t('nav:userMenu.settings')} backTo="/me" />
      ) : null}
      <main className="pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  );
};
