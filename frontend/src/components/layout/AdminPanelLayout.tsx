import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Users,
  Shield,
  BarChart2,
  Settings,
  Moon,
  Sun,
  Menu,
  LogOut,
  Search,
  ChevronLeft,
  Activity,
  Server,
  AlertTriangle,
  TrendingUp,
  X,
  Globe,
  Trash2,
  MessageSquarePlus,
  Megaphone,
} from 'lucide-react';
import { useAuthStore, useThemeStore } from '@/stores';
import { useFeatureFlags } from '@/contexts';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'overview', label: '看板概览', icon: <LayoutDashboard className="w-[18px] h-[18px]" />, path: '/admin-panel' },
  { id: 'users', label: '用户管理', icon: <Users className="w-[18px] h-[18px]" />, path: '/admin-panel/users' },
  { id: 'sessions', label: '会话管理', icon: <Server className="w-[18px] h-[18px]" />, path: '/admin-panel/sessions' },
  { id: 'actions', label: '行为日志', icon: <Activity className="w-[18px] h-[18px]" />, path: '/admin-panel/actions' },
  { id: 'analytics', label: '数据分析', icon: <BarChart2 className="w-[18px] h-[18px]" />, path: '/admin-panel/analytics' },
  { id: 'trends', label: '趋势报表', icon: <TrendingUp className="w-[18px] h-[18px]" />, path: '/admin-panel/trends' },
  { id: 'reports', label: '举报处理', icon: <AlertTriangle className="w-[18px] h-[18px]" />, path: '/admin-panel/reports' },
  { id: 'roles', label: '角色管理', icon: <Shield className="w-[18px] h-[18px]" />, path: '/admin-panel/roles' },
  { id: 'config', label: '系统配置', icon: <Settings className="w-[18px] h-[18px]" />, path: '/admin-panel/config' },
  { id: 'cleanup', label: '数据清理', icon: <Trash2 className="w-[18px] h-[18px]" />, path: '/admin-panel/cleanup' },
  { id: 'feedback', label: '用户反馈', icon: <MessageSquarePlus className="w-[18px] h-[18px]" />, path: '/admin-panel/feedback' },
  { id: 'announcements', label: '网站公告', icon: <Megaphone className="w-[18px] h-[18px]" />, path: '/admin-panel/announcements' },
];

export const AdminPanelLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { resolvedTheme, toggleTheme, sidebarCollapsed, toggleSidebar } = useThemeStore();
  const { communityEnabled } = useFeatureFlags();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/admin-panel') return location.pathname === '/admin-panel';
    return location.pathname.startsWith(path);
  };

  const currentPageLabel = navItems.find((item) => isActive(item.path))?.label || '管理看板';

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const SidebarContent: React.FC<{ mobile?: boolean }> = ({ mobile = false }) => (
    <>
      <div className={clsx(
        'flex items-center h-16 px-4 border-b border-stone-200/70 dark:border-stone-800',
        !mobile && sidebarCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {(!sidebarCollapsed || mobile) ? (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-base gradient-text display-font">管理看板</span>
              <p className="text-[10px] text-stone-500 dark:text-stone-400">Admin Panel</p>
            </div>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md">
            <Shield className="w-4 h-4 text-white" />
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

      <nav className="flex-1 py-4 px-2.5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <div className="mb-5">
          {(!sidebarCollapsed || mobile) && (
            <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 dark:text-stone-600">
              管理功能
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
                      <span className={clsx('flex-shrink-0', active ? 'text-rose-600 dark:text-rose-400' : 'text-stone-400')}>
                        {item.icon}
                      </span>
                      <span className="font-medium text-sm">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 rounded-full">
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
                    className={clsx('sidebar-nav-item group', active && 'active', active && 'bg-rose-50 dark:bg-rose-900/20')}
                      >
                    <span className={clsx('flex-shrink-0', active ? 'text-rose-600 dark:text-rose-400' : 'text-stone-400')}>
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span className={clsx('font-medium text-sm', active && 'text-rose-700 dark:text-rose-300')}>{item.label}</span>
                        {item.badge && (
                          <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                    {sidebarCollapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
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

      <div className="p-3 border-t border-stone-200/70 dark:border-stone-800">
        <div className={clsx('flex items-center gap-3', (!sidebarCollapsed || mobile) ? '' : 'justify-center')}>
          <div className="user-avatar flex-shrink-0 text-sm bg-gradient-to-br from-rose-500 to-pink-600">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          {(!sidebarCollapsed || mobile) && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate tracking-tight">
                  {user?.username}
                </p>
                <p className="text-xs text-rose-500 dark:text-rose-400 font-medium">
                  {user?.role === 'super_admin' ? '超级管理员' : '管理员'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
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
    <div className="min-h-screen bg-stone-50 dark:bg-[#0a0a0b] flex">
      <aside className={clsx(
        'hidden lg:flex flex-col fixed inset-y-0 left-0 z-30',
        'bg-white dark:bg-[#111113] border-r border-stone-200/80 dark:border-stone-800',
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
        'bg-white dark:bg-[#111113] border-r border-stone-200/80 dark:border-stone-800',
        'transform transition-transform duration-300 ease-out',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent mobile />
      </aside>

      <div className={clsx(
        'flex-1 flex flex-col transition-all duration-300 min-w-0',
        sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
      )}>
        <header className="sticky top-0 z-20 h-16 bg-white/80 dark:bg-[#111113]/80 backdrop-blur-xl border-b border-stone-200/70 dark:border-stone-800">
          <div className="flex items-center justify-between h-full px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-all"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-base sm:text-lg font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                {currentPageLabel}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/main"
                className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 transition-all">
                <Search className="w-4 h-4" />
                返回首页
              </Link>
              <Link to="/dashboard"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all border border-stone-200 dark:border-stone-700">
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden lg:inline">控制台</span>
              </Link>
              {communityEnabled && (
                <Link to="/community"
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all border border-stone-200 dark:border-stone-700">
                  <Globe className="w-4 h-4" />
                  <span className="hidden lg:inline">社区</span>
                </Link>
              )}
              <Link to="/admin-panel"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 transition-all">
                <Shield className="w-4 h-4" />
                <span className="hidden lg:inline">管理看板</span>
              </Link>

              <Link to="/main" className="mobile-header-btn md:hidden" title="搜索">
                <Search className="w-5 h-5" />
              </Link>
              <Link to="/dashboard" className="mobile-header-btn md:hidden" title="控制台">
                <LayoutDashboard className="w-5 h-5" />
              </Link>
              {communityEnabled && (
                <Link to="/community" className="mobile-header-btn md:hidden" title="社区">
                  <Globe className="w-5 h-5" />
                </Link>
              )}
              <Link to="/admin-panel" className="mobile-header-btn md:hidden text-rose-500 hover:text-rose-600" title="管理看板">
                <Shield className="w-5 h-5" />
              </Link>

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
