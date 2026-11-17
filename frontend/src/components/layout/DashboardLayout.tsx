/**
 * DashboardLayout - 个人中心
 *
 * 桌面端交给统一 AppShell（左侧全局栏 + 顶栏），本文件只保留移动端菜单页；
 * 侧栏数据统一来自 workspaceNav，避免与全局导航各维护一份。
 */
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuthStore, useThemeStore } from '@/stores';
import { useIsDesktop, useUnreadCount } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { useRouteEnterAnimation } from '@/hooks/useRouteEnterAnimation';
import { AppShell } from './AppShell';
import { MobileMenuPage, MobileSectionHeader, type MobileMenuGroup } from './MobileSectionPage';
import { dashboardNavGroups, isNavItemActive } from './workspaceNav';

/** 移动端菜单页里「概览」需要独立内容路由，避免点击后又回到菜单页 */
const mobilePathOverrides: Record<string, string> = {
  overview: '/dashboard/overview',
};

export const DashboardLayout: React.FC = () => {
  const { t } = useTranslation(['nav']);
  const { user } = useAuthStore();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const mainRef = useRouteEnterAnimation<HTMLElement>();
  const { data: unreadNotifications = 0 } = useUnreadCount();

  const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
  const isMenuRoot = location.pathname === '/dashboard' || location.pathname === '/dashboard/';
  // 从首页入口进入时回首页；从个人中心菜单页进入时仍回菜单页
  const originPath = (location.state as { from?: string } | null)?.from;

  const mobileGroups = dashboardNavGroups;

  const navItems = mobileGroups
    .flatMap((group) => group.items)
    .filter((item) => item.id !== 'categories' || isAdmin);

  const currentPageLabel =
    navItems.find((item) => isNavItemActive(item.path, location.pathname))?.labelKey ||
    'nav:userMenu.dashboard';

  const mobileMenuGroups: MobileMenuGroup[] = mobileGroups
    .map((group) => ({
      id: group.id,
      title: group.labelKey ? t(group.labelKey) : undefined,
      items: group.items
        .filter((item) => item.id !== 'categories' || isAdmin)
        .map((item) => ({
          id: item.id,
          label: t(item.labelKey),
          icon: item.icon,
          to: mobilePathOverrides[item.id] ?? item.path,
          badge: item.id === 'notifications' && unreadNotifications > 0 ? unreadNotifications : undefined,
        })),
    }))
    .filter((group) => group.items.length > 0);

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
        title={isMenuRoot ? t('nav:mobileNav.dashboard') : t(currentPageLabel)}
        backTo={isMenuRoot ? undefined : (originPath ?? '/dashboard')}
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

      <main ref={mainRef} data-scroll-container className="dashboard-main pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {isMenuRoot ? (
          <MobileMenuPage title={t('nav:mobileNav.dashboard')} groups={mobileMenuGroups} showTitle={false} />
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
};
