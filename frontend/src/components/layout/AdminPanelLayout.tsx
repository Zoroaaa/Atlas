/**
 * AdminPanelLayout - 管理后台
 *
 * 桌面端使用统一 AppShell；管理后台的 18 个入口在全局侧栏内滚动展示，
 * 不再并排出现第二列侧栏。移动端保留菜单页 + 内容页返回栏。
 */
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/stores';
import { useIsDesktop } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { useRouteEnterAnimation } from '@/hooks/useRouteEnterAnimation';
import { AppShell } from './AppShell';
import { MobileMenuPage, MobileSectionHeader } from './MobileSectionPage';
import { adminNavGroups, isNavItemActive } from './workspaceNav';

/** 移动端菜单页里「看板概览」需要独立内容路由，避免点击后又回到菜单页 */
const mobilePathOverrides: Record<string, string> = {
  overview: '/admin-panel/overview',
};

export const AdminPanelLayout: React.FC = () => {
  const { t } = useTranslation(['nav']);
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const mainRef = useRouteEnterAnimation<HTMLElement>();

  const isMenuRoot = location.pathname === '/admin-panel' || location.pathname === '/admin-panel/';

  const navItems = adminNavGroups.flatMap((group) => group.items);
  const currentPageLabel =
    navItems.find((item) => isNavItemActive(item.path, location.pathname))?.labelKey ||
    'nav:adminPanel.title';

  if (isDesktop) {
    return (
      <AppShell>
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0a0a0b]">
      <MobileSectionHeader
        title={isMenuRoot ? t('nav:adminPanel.title') : t(currentPageLabel)}
        backTo={isMenuRoot ? undefined : '/admin-panel'}
        actions={
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            aria-label={t('nav:theme.toggle')}
          >
            {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        }
      />

      <main
        ref={mainRef}
        data-scroll-container
        className="p-4 pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6"
      >
        {isMenuRoot ? (
          <MobileMenuPage
            title={t('nav:adminPanel.title')}
            groups={adminNavGroups.map((group) => ({
              id: group.id,
              title: group.labelKey ? t(group.labelKey) : undefined,
              items: group.items.map((item) => ({
                id: item.id,
                label: t(item.labelKey),
                icon: item.icon,
                to: mobilePathOverrides[item.id] ?? item.path,
              })),
            }))}
            showTitle={false}
          />
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
};
