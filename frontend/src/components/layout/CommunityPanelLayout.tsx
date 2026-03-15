import React, { useState } from 'react';
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
  Share2,
  Tag,
  Star,
  Bell,
  TrendingUp,
  X,
  LayoutDashboard,
  Shield,
  Globe,
} from 'lucide-react';
import { useAuthStore, useThemeStore } from '@/stores';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'browse', label: '浏览社区', icon: <Share2 className="w-[18px] h-[18px]" />, path: '/community' },
  { id: 'my-shares', label: '我的分享', icon: <Star className="w-[18px] h-[18px]" />, path: '/community/my-shares' },
  { id: 'my-favorites', label: '我的收藏', icon: <Star className="w-[18px] h-[18px]" />, path: '/community/my-favorites' },
  { id: 'tags', label: '标签管理', icon: <Tag className="w-[18px] h-[18px]" />, path: '/community/tags' },
  { id: 'trending', label: '热门推荐', icon: <TrendingUp className="w-[18px] h-[18px]" />, path: '/community/trending' },
  { id: 'reports', label: '消息通知', icon: <Bell className="w-[18px] h-[18px]" />, path: '/community/reports' },
];

export const CommunityPanelLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { resolvedTheme, toggleTheme, sidebarCollapsed, toggleSidebar } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/community') return location.pathname === '/community';
    return location.pathname.startsWith(path);
  };

  const currentPageLabel = navItems.find((item) => isActive(item.path))?.label || '社区';

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const SidebarContent: React.FC<{ mobile?: boolean }> = ({ mobile = false }) => (
    <>
      <div className={clsx(
        'flex items-center h-16 px-4 border-b border-slate-200/70 dark:border-slate-800',
        !mobile && sidebarCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {(!sidebarCollapsed || mobile) ? (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-base gradient-text display-font">社区中心</span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Community</p>
            </div>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <Users className="w-4 h-4 text-white" />
          </div>
        )}
        {mobile ? (
          <button onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-all">
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={toggleSidebar}
            className={clsx(
              'p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100',
              'dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-all',
              sidebarCollapsed && 'mx-auto'
            )}>
            {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        )}
      </div>

      <nav className="flex-1 py-4 px-2.5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <div className="mb-5">
          {(!sidebarCollapsed || mobile) && (
            <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-600">
              社区功能
            </p>
          )}
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const active = isActive(item.path);
              if (mobile) {
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => handleNavClick(item.path)}
                      className={clsx('sidebar-nav-item w-full', active && 'active')}
                    >
                      <span className={clsx('flex-shrink-0', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                        {item.icon}
                      </span>
                      <span className="font-medium text-sm">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <Link 
                    to={item.path} 
                    title={sidebarCollapsed ? item.label : undefined}
                    className={clsx('sidebar-nav-item group', active && 'active', active && 'bg-emerald-50 dark:bg-emerald-900/20')}
                  >
                    <span className={clsx('flex-shrink-0', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className={clsx('font-medium text-sm', active && 'text-emerald-700 dark:text-emerald-300')}>{item.label}</span>
                        {item.badge && (
                          <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                    {sidebarCollapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                        {item.label}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="p-3 border-t border-slate-200/70 dark:border-slate-800">
        <div className={clsx('flex items-center gap-3', (!sidebarCollapsed || mobile) ? '' : 'justify-center')}>
          <div className="user-avatar flex-shrink-0 text-sm bg-gradient-to-br from-emerald-500 to-teal-600">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          {(!sidebarCollapsed || mobile) && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate tracking-tight">
                  {user?.username}
                </p>
                <p className="text-xs text-emerald-500 dark:text-emerald-400 font-medium">
                  社区成员
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                title="退出登录"
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      <aside className={clsx(
        'hidden lg:flex flex-col fixed inset-y-0 left-0 z-30',
        'bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800',
        'transition-all duration-300 ease-out',
        sidebarCollapsed ? 'w-20' : 'w-64'
      )}>
        <SidebarContent />
      </aside>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-72 lg:hidden flex flex-col',
        'bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800',
        'transform transition-transform duration-300 ease-out',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent mobile />
      </aside>

      <div className={clsx(
        'flex-1 flex flex-col transition-all duration-300 min-w-0',
        sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
      )}>
        <header className="sticky top-0 z-20 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-center justify-between h-full px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-all"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
                {currentPageLabel}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/main"
                className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all">
                <Search className="w-4 h-4" />
                返回首页
              </Link>
              <Link to="/dashboard"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-700">
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden lg:inline">控制台</span>
              </Link>
              <Link to="/community"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 transition-all">
                <Globe className="w-4 h-4" />
                <span className="hidden lg:inline">社区</span>
              </Link>
              {isAdmin && (
                <Link to="/admin-panel"
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-700">
                  <Shield className="w-4 h-4" />
                  <span className="hidden lg:inline">管理看板</span>
                </Link>
              )}

              <Link to="/main" className="mobile-header-btn md:hidden" title="搜索">
                <Search className="w-5 h-5" />
              </Link>
              <Link to="/dashboard" className="mobile-header-btn md:hidden" title="控制台">
                <LayoutDashboard className="w-5 h-5" />
              </Link>
              <Link to="/community" className="mobile-header-btn md:hidden" title="社区">
                <Globe className="w-5 h-5" />
              </Link>
              {isAdmin && (
                <Link to="/admin-panel" className="mobile-header-btn md:hidden text-red-500 hover:text-red-600" title="管理看板">
                  <Shield className="w-5 h-5" />
                </Link>
              )}

              <button onClick={toggleTheme} className="theme-toggle-btn">
                {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
