import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Github, HelpCircle, LogOut, Settings, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';

const rowClassName =
  'flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-800/60';

export const MePage: React.FC = () => {
  const { t } = useTranslation(['nav']);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="mb-5 text-2xl font-bold text-stone-900 dark:text-stone-100">{t('nav:me.title')}</h1>

      <div className="flex items-center gap-4 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-[#d4a853] to-[#f59e0b] text-xl font-semibold text-white shadow-sm">
          {user?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-stone-900 dark:text-stone-100">{user?.username}</p>
          {user?.email && (
            <p className="truncate text-sm text-stone-500 dark:text-stone-400">{user.email}</p>
          )}
        </div>
        {user?.roleDisplayName && (
          <span className="ml-auto flex-none rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {user.roleDisplayName}
          </span>
        )}
      </div>

      <div className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/70 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
        <Link to="/dashboard/settings" className={rowClassName}>
          <Settings className="h-4 w-4 text-stone-400" />
          <span>{t('nav:me.settings')}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-stone-300 dark:text-stone-600" />
        </Link>

        {isAdmin && (
          <Link to="/admin-panel" className={rowClassName}>
            <Shield className="h-4 w-4 text-red-500" />
            <span>{t('nav:adminPanel.title')}</span>
            <ChevronRight className="ml-auto h-4 w-4 text-stone-300 dark:text-stone-600" />
          </Link>
        )}

        <Link to="/help" className={rowClassName}>
          <HelpCircle className="h-4 w-4 text-stone-400" />
          <span>{t('nav:mobileMore.help')}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-stone-300 dark:text-stone-600" />
        </Link>

        <a
          href="https://github.com/Zoroaaa/codeseek"
          target="_blank"
          rel="noopener noreferrer"
          className={rowClassName}
        >
          <Github className="h-4 w-4 text-stone-400" />
          <span>{t('nav:mobileMore.github')}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-stone-300 dark:text-stone-600" />
        </a>
      </div>

      <button
        onClick={handleLogout}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:bg-stone-900 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        <LogOut className="h-4 w-4" />
        {t('nav:userMenu.logout')}
      </button>
    </div>
  );
};
