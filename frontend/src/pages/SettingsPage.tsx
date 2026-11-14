import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsManager } from './dashboard/SettingsManager';

/**
 * 系统设置独立页：只由桌面端头像下拉的「设置」或手机端「我的」菜单进入。
 * 个人中心不再包含设置入口。
 */
export const SettingsPage: React.FC = () => {
  const { t } = useTranslation(['nav']);
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <button
        type="button"
        onClick={() => navigate('/me')}
        className="mb-4 inline-flex items-center gap-0.5 rounded-lg py-1.5 pr-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 lg:hidden dark:text-stone-300 dark:hover:text-stone-100"
        aria-label={t('nav:menu.back')}
      >
        <ChevronLeft className="h-5 w-5" />
        <span>{t('nav:menu.back')}</span>
      </button>
      <SettingsManager />
    </div>
  );
};
