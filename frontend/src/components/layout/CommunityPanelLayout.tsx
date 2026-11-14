import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Users,
  Moon,
  Sun,
  Menu,
  LogOut,
  Search,
  ChevronLeft,
  Compass,
  FileText,
  Heart,
  Tag,
  LayoutDashboard,
  Shield,
  Globe,
} from 'lucide-react';
import { useAuthStore, useThemeStore } from '@/stores';
import { useIsDesktop } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useRouteEnterAnimation } from '@/hooks/useRouteEnterAnimation';
import { MobileMenuPage, MobileSectionHeader } from './MobileSectionPage';
import { UserAccountMenu } from './UserAccountMenu';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

/** 桌面端社区侧边栏：发现仍落在 /community */
const communityNavItems: NavItem[] = [
  { id: 'browse', label: 'nav:community.items.browse', icon: <Compass className="w-[18px] h-[18px]" />, path: '/community' },
  { id: 'my-posts', label: 'nav:community.items.myPosts', icon: <FileText className="w-[18px] h-[18px]" />, path: '/community/my-shares' },
  { id: 'my-favorites', label: 'nav:community.items.myFavorites', icon: <Heart className="w-[18px] h-[18px]" />, path: '/community/my-favorites' },
  { id: 'tags', label: 'nav:community.items.tags', icon: <Tag className="w-[18px] h-[18px]" />, path: '/community/tags' },
];

/** 移动端菜单页中「发现」需要独立内容路由，避免点击后又回到菜单页 */
const mobilePathOverrides: Record<string, string> = {
  browse: '/community/browse',
};

export const CommunityPanelLayout: React.FC = () => {
  const { t } = useTranslation(['nav']);
  const { user, logout } = useAuthStore();
  const { resolvedTheme, toggleTheme, sidebarCollapsed, toggleSidebar } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const mainRef = useRouteEnterAnimation<HTMLElement>();

  const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
  const isMenuRoot = location.pathname === '/community' || location.pathname === '/community/';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/community') {
      return location.pathname === '/community' || location.pathname.startsWith('/community/browse');
    }
    return location.pathname.startsWith(path);
  };

  const currentPageLabel =
    communityNavItems.find((item) => isActive(item.path))?.label ||
    (location.pathname.startsWith('/community/browse') ? 'nav:community.items.browse' : 'nav:userMenu.community');

  const mobileMenuItems = communityNavItems.map((item) => ({
    id: item.id,
    label: t(item.label),
    icon: item.icon,
    to: mobilePathOverrides[item.id] ?? item.path,
  }));

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0a0a0b] flex">
      {/* ── 桌面端侧边栏：移动端不再渲染抽屉 ── */}
      {isDesktop && <aside
        className={clsx(
          'flex flex-col fixed inset-y-0 left-0 z-30',
          'bg-white dark:bg-[#111113] border-r border-stone-200/80 dark:border-stone-800',
          'transition-all duration-300 ease-out',
          sidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <div
          className={clsx(
            'flex items-center h-16 px-4 border-b border-stone-200/70 dark:border-stone-800',
            sidebarCollapsed ? 'justify-center' : 'justify-between'
          )}
        >
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="font-bold text-base gradient-text display-font">{t('nav:community.title')}</span>
                <p className="text-[10px] text-stone-500 dark:text-stone-400">Community</p>
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md">
              <Users className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className={clsx(
              'p-2 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100',
              'dark:hover:text-stone-300 dark:hover:bg-stone-800 transition-all',
              sidebarCollapsed && 'mx-auto'
            )}
          >
            {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 py-4 px-2.5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <div className="mb-5">
            {!sidebarCollapsed && (
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 dark:text-stone-600">
                {t('nav:community.groupHeading')}
              </p>
            )}
            <ul className="space-y-0.5">
              {communityNavItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <li key={item.id}>
                    <Link
                      to={item.path}
                      title={sidebarCollapsed ? t(item.label) : undefined}
                      className={clsx('sidebar-nav-item group', active && 'active', active && 'bg-teal-50 dark:bg-teal-900/20')}
                    >
                      <span className={clsx('flex-shrink-0', active ? 'text-teal-600 dark:text-teal-400' : 'text-stone-400')}>
                        {item.icon}
                      </span>
                      {!sidebarCollapsed && (
                        <>
                          <span className={clsx('font-medium text-sm', active && 'text-teal-700 dark:text-teal-300')}>{t(item.label)}</span>
                          {item.badge && (
                            <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400 rounded-full">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {sidebarCollapsed && (
                        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                          {t(item.label)}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="p-3 border-t border-stone-200/70 dark:border-stone-800">
          <div className={clsx('flex items-center gap-3', sidebarCollapsed ? 'justify-center' : '')}>
            <div className="user-avatar flex-shrink-0 text-sm bg-gradient-to-br from-teal-500 to-cyan-600">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate tracking-tight">
                    {user?.username}
                  </p>
                  <p className="text-xs text-teal-500 dark:text-teal-400 font-medium">
                    {t('nav:community.roleMember')}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  title={t('nav:userMenu.logout')}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>}

      <div className={clsx('flex-1 flex flex-col transition-all duration-300 min-w-0', sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64')}>
        {/* 桌面端 Header */}
        {isDesktop && <header className="sticky top-0 z-20 h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] bg-white/80 dark:bg-[#111113]/80 backdrop-blur-xl border-b border-stone-200/70 dark:border-stone-800">
          <div className="flex items-center justify-between h-full px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <h1 className="text-base sm:text-lg font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                {t(currentPageLabel)}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/main"
                className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 transition-all"
              >
                <Search className="w-4 h-4" />
                {t('nav:backHome')}
              </Link>
              <Link
                to="/dashboard"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all border border-stone-200 dark:border-stone-700"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden lg:inline">{t('nav:userMenu.dashboard')}</span>
              </Link>
              <Link
                to="/community"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 transition-all"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden lg:inline">{t('nav:userMenu.community')}</span>
              </Link>
              {isAdmin && (
                <Link
                  to="/admin-panel"
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all border border-stone-200 dark:border-stone-700"
                >
                  <Shield className="w-4 h-4" />
                  <span className="hidden lg:inline">{t('nav:adminPanel.title')}</span>
                </Link>
              )}

              <NotificationBell />
              <button onClick={toggleTheme} className="theme-toggle-btn">
                {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <UserAccountMenu isAuthenticated={Boolean(user)} user={user} isAdmin={isAdmin} />
            </div>
          </div>
        </header>}

        {/* 手机端 Header：菜单页显示标题，内容页显示返回按钮 */}
        {!isDesktop && <MobileSectionHeader
          title={isMenuRoot ? t('nav:mobileNav.community') : t(currentPageLabel)}
          backTo={isMenuRoot ? undefined : '/community'}
          actions={
            <>
              <NotificationBell />
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                aria-label={t('nav:theme.toggle')}
              >
                {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </>
          }
        />}

        <main
          ref={mainRef}
          data-scroll-container
          className="flex-1 p-4 pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:p-8 overflow-auto"
        >
          {!isDesktop && isMenuRoot ? (
            <MobileMenuPage title={t('nav:mobileNav.community')} groups={[{ id: 'community', items: mobileMenuItems }]} showTitle={false} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
};
