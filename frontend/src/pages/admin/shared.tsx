import React from 'react';
import { LucideIcon } from 'lucide-react';
import i18next from '@/i18n';
import { useLanguageStore } from '@/stores';
import { formatRelativeTime as formatRelativeTimeBase } from '@/utils/relativeTime';
import { Pagination as WorkbenchPagination } from '@/components/workbench';

/** 格式化时间戳为本地化日期字符串,跟随当前界面语言切换 locale */
export const formatDate = (timestamp: number | null | undefined) => {
  if (!timestamp) return '-';
  const language = useLanguageStore.getState().language;
  return new Date(timestamp).toLocaleString(language);
};

/** 格式化相对时间,复用统一的相对时间实现 */
export const formatRelativeTime = (timestamp: number) =>
  formatRelativeTimeBase(timestamp, useLanguageStore.getState().language);

/** 操作类型 -> i18n key 映射。消费端调用 t(actionLabels[actionType] || actionType) 解析。 */
export const actionLabels: Record<string, string> = {
  login: 'admin:actions.login',
  login_failed: 'admin:actions.login_failed',
  logout: 'admin:actions.logout',
  search: 'admin:actions.search',
  add_favorite: 'admin:actions.add_favorite',
  remove_favorite: 'admin:actions.remove_favorite',
  sync_favorites: 'admin:actions.sync_favorites',
  update_settings: 'admin:actions.update_settings',
  change_password: 'admin:actions.change_password',
  change_email: 'admin:actions.change_email',
  delete_account: 'admin:actions.delete_account',
  clear_search_history: 'admin:actions.clear_search_history',
  share_source: 'admin:actions.share_source',
  review_source: 'admin:actions.review_source',
  report_source: 'admin:actions.report_source',
  admin_update_user_status: 'admin:actions.admin_update_user_status',
  admin_update_user_role: 'admin:actions.admin_update_user_role',
  admin_update_user_permissions: 'admin:actions.admin_update_user_permissions',
  admin_terminate_session: 'admin:actions.admin_terminate_session',
  admin_cleanup: 'admin:actions.admin_cleanup',
  admin_handle_report: 'admin:actions.admin_handle_report',
};

/** 解析操作类型为当前语言的标签文案。非组件环境调用,使用 i18next.t。 */
export const resolveActionLabel = (actionType: string): string => {
  const key = actionLabels[actionType];
  return key ? i18next.t(key) : actionType;
};

export const actionColors: Record<string, string> = {
  login: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  login_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  logout: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400',
  search: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  add_favorite: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  share_source: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  admin_update_user_status: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  admin_update_user_role: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
};

/** 管理后台分页：复用统一分页组件（bar 模式），保留 onPageChange 旧签名以免改动调用点。 */
export const Pagination: React.FC<{ page: number; totalPages: number; onPageChange: (p: number) => void }> = ({ page, totalPages, onPageChange }) => (
  <WorkbenchPagination variant="bar" page={page} totalPages={totalPages} onChange={onPageChange} />
);

export const TableWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
    <div className="overflow-x-auto">{children}</div>
  </div>
);

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  subLabel?: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal' | 'pink';
}

const colorClasses: Record<string, { bg: string; iconBg: string }> = {
  blue: { bg: 'bg-amber-50 dark:bg-amber-900/20', iconBg: 'bg-gradient-to-br from-[#d4a853] to-[#f59e0b]' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20', iconBg: 'bg-gradient-to-br from-green-500 to-green-600' },
  purple: { bg: 'bg-rose-50 dark:bg-rose-900/20', iconBg: 'bg-gradient-to-br from-rose-500 to-rose-600' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', iconBg: 'bg-gradient-to-br from-orange-500 to-orange-600' },
  red: { bg: 'bg-red-50 dark:bg-red-900/20', iconBg: 'bg-gradient-to-br from-red-500 to-red-600' },
  teal: { bg: 'bg-teal-50 dark:bg-teal-900/20', iconBg: 'bg-gradient-to-br from-teal-500 to-teal-600' },
  pink: { bg: 'bg-pink-50 dark:bg-pink-900/20', iconBg: 'bg-gradient-to-br from-pink-500 to-pink-600' },
};

export const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, subLabel, color }) => {
  const colors = colorClasses[color] || colorClasses.blue;
  return (
    <div className={`${colors.bg} rounded-xl p-4 border border-surface-200 dark:border-surface-700`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-surface-500 dark:text-surface-400 truncate">{label}</div>
          <div className="text-xl font-bold text-surface-900 dark:text-surface-100">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {subLabel && <div className="text-xs text-surface-400">{subLabel}</div>}
        </div>
      </div>
    </div>
  );
};

export const StatsGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
    {children}
  </div>
);
