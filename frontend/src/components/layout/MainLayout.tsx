/**
 * MainLayout - 主布局
 * 视觉优化：玻璃态导航栏，精美页脚，保持全部功能逻辑不变
 */
import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { User, Moon, Sun, Menu, X } from 'lucide-react';
import { useAuthStore, useThemeStore, useUIStore } from '@/stores';
import { Button } from '@/components/ui';

export const MainLayout: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { isSidebarOpen, setSidebarOpen } = useUIStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo + Nav */}
            <div className="flex items-center gap-8">
              <a
                href={window.location.pathname}
                className="flex items-center gap-2.5 group cursor-pointer"
                title="刷新页面"
              >
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#d4a853] to-[#f59e0b] opacity-0 group-hover:opacity-20 blur-lg transition-all" />
                  <img
                    src="/logo.svg"
                    alt="Atlas"
                    className="relative w-full h-full rounded-xl shadow-md object-cover"
                  />
                </div>
                <span className="text-xl font-bold gradient-text display-font hidden sm:block">
                  Atlas
                </span>
              </a>

              <nav className="hidden md:flex items-center gap-1">
                {isAuthenticated ? (
                  <>
                    <NavLink to="/main">主页</NavLink>
                    <NavLink to="/dashboard">控制台</NavLink>
                  </>
                ) : (
                  <NavLink to="/">首页</NavLink>
                )}
              </nav>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-all duration-200 active:scale-95"
                aria-label="切换主题"
              >
                {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {isAuthenticated ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/main')}
                  leftIcon={<User className="w-4 h-4" />}
                >
                  {user?.username}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>登录</Button>
                  <Button variant="primary" size="sm" onClick={() => navigate('/register')}>注册</Button>
                </div>
              )}

              <button
                onClick={() => setSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 rounded-xl text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-all duration-200"
              >
                {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-stone-200/60 dark:border-stone-800/60 bg-white/50 dark:bg-stone-900/40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.svg"
                alt="Atlas"
                className="w-8 h-8 rounded-xl shadow-md object-cover"
              />
              <span className="font-semibold text-stone-700 dark:text-stone-300 tracking-tight">
                Atlas
              </span>
            </div>
            <p className="text-sm text-stone-400 dark:text-stone-500">
              © {new Date().getFullYear()} Atlas. 保留所有权利.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

interface NavLinkProps {
  to: string;
  children: React.ReactNode;
}

const NavLink: React.FC<NavLinkProps> = ({ to, children }) => {
  return (
    <Link
      to={to}
      className={clsx(
        'px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200',
        'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80',
        'dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800'
      )}
    >
      {children}
    </Link>
  );
};
