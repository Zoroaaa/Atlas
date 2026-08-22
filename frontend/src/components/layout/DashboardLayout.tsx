import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Database,
  FolderTree,
  Users,
  Heart,
  History,
  Settings,
  Moon,
  Sun,
  Menu,
  LogOut,
  Search,
  ChevronLeft,
  BarChart2,
  Shield,
  X,
  Activity,
  Globe,
} from 'lucide-react';
import { useAuthStore, useThemeStore } from '@/stores';
import { useFeatureFlags } from '@/contexts';
import { useTranslation } from 'react-i18next';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
  group?: string;
  adminOnly?: boolean;
}

const navGroups = [
  'nav:dashboard.groups.personal',
  'nav:dashboard.groups.resources',
  'nav:dashboard.groups.settings',
  'nav:dashboard.groups.admin',
];

const navItems: NavItem[] = [
  { id: 'overview',   label: 'nav:dashboard.items.overview',    icon: <LayoutDashboard className="w-[18px] h-[18px]" />, path: '/dashboard',            group: 'nav:dashboard.groups.personal' },
  { id: 'stats',      label: 'nav:dashboard.items.stats',      icon: <BarChart2 className="w-[18px] h-[18px]" />,       path: '/dashboard/stats',      group: 'nav:dashboard.groups.personal' },
  { id: 'favorites',  label: 'nav:dashboard.items.favorites',  icon: <Heart className="w-[18px] h-[18px]" />,           path: '/dashboard/favorites',  group: 'nav:dashboard.groups.personal' },
  { id: 'history',    label: 'nav:dashboard.items.history',    icon: <History className="w-[18px] h-[18px]" />,         path: '/dashboard/history',    group: 'nav:dashboard.groups.personal' },
  { id: 'activities', label: 'nav:dashboard.items.activities', icon: <Activity className="w-[18px] h-[18px]" />,        path: '/dashboard/activities', group: 'nav:dashboard.groups.personal' },
  { id: 'sources',    label: 'nav:dashboard.items.sources',    icon: <Database className="w-[18px] h-[18px]" />,        path: '/dashboard/sources',    group: 'nav:dashboard.groups.resources' },
  { id: 'settings',   label: 'nav:dashboard.items.settings',   icon: <Settings className="w-[18px] h-[18px]" />,        path: '/dashboard/settings',   group: 'nav:dashboard.groups.settings' },
  { id: 'categories', label: 'nav:dashboard.items.categories', icon: <FolderTree className="w-[18px] h-[18px]" />,      path: '/dashboard/categories', group: 'nav:dashboard.groups.admin', adminOnly: true },
];

export const DashboardLayout: React.FC = () => {
  const { t } = useTranslation(['nav']);
  const { user, logout } = useAuthStore();
  const { resolvedTheme, toggleTheme, sidebarCollapsed, toggleSidebar } = useThemeStore();
  const { communityEnabled } = useFeatureFlags();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    if (path === '/admin') return location.pathname.startsWith('/admin');
    return location.pathname.startsWith(path);
  };

  const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);
  const filteredNavGroups = navGroups.filter(group => {
    const groupItems = filteredNavItems.filter(i => i.group === group);
    return groupItems.length > 0;
  });

  const currentPageLabel = filteredNavItems.find((item) => isActive(item.path))?.label || 'nav:userMenu.dashboard';

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  /* ── Sidebar content renderer ── */
  const SidebarContent: React.FC<{ mobile?: boolean }> = ({ mobile = false }) => (
    <>
      {/* Logo */}
      <div className={clsx(
        'flex items-center h-16 px-4 border-b border-stone-200/70 dark:border-stone-800',
        !mobile && sidebarCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {(!sidebarCollapsed || mobile) ? (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center shadow-md">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-base gradient-text display-font">{t('nav:userMenu.dashboard')}</span>
              <p className="text-[10px] text-stone-500 dark:text-stone-400">Dashboard</p>
            </div>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center shadow-md">
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
        )}
        {mobile ? (
          <button onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:text-stone-300 dark:hover:bg-stone-800 transition-all">
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={toggleSidebar}
            className={clsx(
              'p-2 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100',
              'dark:hover:text-stone-300 dark:hover:bg-stone-800 transition-all',
              sidebarCollapsed && 'mx-auto'
            )}>
            {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2.5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {filteredNavGroups.map((group) => {
          const groupItems = filteredNavItems.filter(i => i.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className="mb-5">
              {(!sidebarCollapsed || mobile) && (
                <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 dark:text-stone-600">
                  {t(group)}
                </p>
              )}
              <ul className="space-y-0.5">
                {groupItems.map((item) => {
                  const active = isActive(item.path);
                  if (mobile) {
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => handleNavClick(item.path)}
                          className={clsx('sidebar-nav-item w-full', active && 'active')}
                        >
                          <span className={clsx('flex-shrink-0', active ? 'text-amber-700 dark:text-amber-400' : 'text-stone-400')}>
                            {item.icon}
                          </span>
                          <span className="font-medium text-sm">{t(item.label)}</span>
                          {item.badge && (
                            <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={item.id}>
                      <Link to={item.path} title={sidebarCollapsed ? t(item.label) : undefined}
                        className={clsx('sidebar-nav-item group', active && 'active')}>
                        <span className={clsx('flex-shrink-0', active ? 'text-amber-700 dark:text-amber-400' : 'text-stone-400')}>
                          {item.icon}
                        </span>
                        {!sidebarCollapsed && (
                          <>
                            <span className="font-medium text-sm">{t(item.label)}</span>
                            {item.badge && (
                              <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                        {/* Tooltip for collapsed state */}
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
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-stone-200/70 dark:border-stone-800">
        <div className={clsx('flex items-center gap-3', (!sidebarCollapsed || mobile) ? '' : 'justify-center')}>
          <div className="user-avatar flex-shrink-0 text-sm">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          {(!sidebarCollapsed || mobile) && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate tracking-tight">
                  {user?.username}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  {user?.roleDisplayName || user?.email}
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
    </>
  );

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0a0a0b] flex">

      {/* ── Desktop Sidebar ── */}
      <aside className={clsx(
        'dashboard-sidebar hidden lg:flex',
        sidebarCollapsed ? 'w-20' : 'w-64'
      )}>
        <SidebarContent />
      </aside>

      {/* ── Mobile Overlay ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile Sidebar ── */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-72 lg:hidden flex flex-col',
        'bg-white dark:bg-[#111113] border-r border-stone-200/80 dark:border-stone-800',
        'transform transition-transform duration-300 ease-out',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent mobile />
      </aside>

      {/* ── Main Content ── */}
      <div
        className={clsx(
          'flex-1 flex flex-col transition-all duration-300 min-w-0',
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        )}
      >

        {/* Header */}
        <header className="dashboard-header">
          <div className="flex items-center justify-between h-full px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-all"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-base sm:text-lg font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                {t(currentPageLabel)}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/main"
                className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold rounded-xl text-white btn-gradient transition-all">
                <Search className="w-4 h-4" />
                {t('nav:backHome')}
              </Link>
              <Link to="/dashboard"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 transition-all">
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden lg:inline">{t('nav:userMenu.dashboard')}</span>
              </Link>
              {communityEnabled && (
                <Link to="/community"
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all border border-stone-200 dark:border-stone-700">
                  <Users className="w-4 h-4" />
                  <span className="hidden lg:inline">{t('nav:userMenu.community')}</span>
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin-panel"
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all border border-stone-200 dark:border-stone-700">
                  <Shield className="w-4 h-4" />
                  <span className="hidden lg:inline">{t('nav:adminPanel.title')}</span>
                </Link>
              )}

              <Link to="/main" className="mobile-header-btn md:hidden" title={t('nav:search')}>
                <Search className="w-5 h-5" />
              </Link>
              <Link to="/dashboard" className="mobile-header-btn md:hidden" title={t('nav:userMenu.dashboard')}>
                <LayoutDashboard className="w-5 h-5" />
              </Link>
              {communityEnabled && (
                <Link to="/community" className="mobile-header-btn md:hidden" title={t('nav:userMenu.community')}>
                  <Globe className="w-5 h-5" />
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin-panel" className="mobile-header-btn md:hidden text-red-500 hover:text-red-600" title={t('nav:adminPanel.title')}>
                  <Shield className="w-5 h-5" />
                </Link>
              )}

              <button onClick={toggleTheme} className="theme-toggle-btn">
                {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </header>

        <main className="dashboard-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
