/**
 * MobileTabBar - 移动端底部主导航
 * 高亮完全由当前路由推导，不使用本地 state，刷新/直链/前进后退均保持一致。
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, LayoutDashboard, User } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useFeatureFlags } from '@/contexts';

interface MobileTab {
  id: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}

export const MobileTabBar: React.FC = () => {
  const { t } = useTranslation(['nav']);
  const { isAuthenticated } = useAuthStore();
  const { communityEnabled } = useFeatureFlags();
  const { pathname } = useLocation();

  if (!isAuthenticated) return null;

  const tabs: MobileTab[] = [
    {
      id: 'home',
      to: '/main',
      icon: Home,
      label: t('nav:mobileNav.home'),
      active: pathname === '/main' || pathname === '/',
    },
    // 社区关闭时与路由守卫保持一致，不出现无效入口
    ...(communityEnabled !== false
      ? [{
          id: 'community',
          to: '/community',
          icon: Users,
          label: t('nav:mobileNav.community'),
          active: pathname.startsWith('/community'),
        }]
      : []),
    {
      id: 'dashboard',
      to: '/dashboard',
      icon: LayoutDashboard,
      label: t('nav:mobileNav.dashboard'),
      active: pathname.startsWith('/dashboard'),
    },
    {
      id: 'me',
      to: '/me',
      icon: User,
      label: t('nav:mobileNav.me'),
      // 管理后台入口挂在「我的」页，进入后仍保持「我的」高亮
      active: pathname.startsWith('/me') || pathname.startsWith('/admin-panel'),
    },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass safe-area-inset-bottom safe-area-inset-x border-t border-stone-200/60 dark:border-stone-700/60"
      aria-label={t('nav:mobileNav.ariaLabel')}
    >
      <div className="flex h-14 items-stretch">
        {tabs.map(({ id, to, icon: Icon, label, active }) => (
          <Link
            key={id}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200',
              active
                ? 'text-[#d4a853]'
                : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
            )}
          >
            <Icon className={clsx('h-5 w-5', active ? 'stroke-[2.2]' : 'stroke-[1.8]')} />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
};
