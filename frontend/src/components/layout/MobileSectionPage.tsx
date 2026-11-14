/**
 * MobileSectionPage - 手机端「菜单页 + 内容页返回栏」共享组件
 *
 * 手机端不再使用左侧隐藏抽屉：社区 / 个人中心 / 我的入口先进入列表式菜单页，
 * 点击具体功能才进入内容页；内容页左上角返回按钮统一回到对应菜单页。
 * 桌面端（≥lg）仍使用原有侧边栏布局，不渲染这里的任何内容。
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

export interface MobileMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** 应用内路由 */
  to?: string;
  /** 站外链接 */
  href?: string;
  onClick?: () => void;
  badge?: number;
  danger?: boolean;
}

export interface MobileMenuGroup {
  id: string;
  title?: string;
  items: MobileMenuItem[];
}

const rowClassName =
  'flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-800/60';

const MobileMenuRow: React.FC<{ item: MobileMenuItem }> = ({ item }) => {
  const content = (
    <>
      {item.icon && (
        <span
          className={clsx(
            'flex h-5 w-5 flex-none items-center justify-center',
            item.danger ? 'text-red-500' : 'text-stone-400'
          )}
        >
          {item.icon}
        </span>
      )}
      <span className={clsx('min-w-0 flex-1 truncate text-left', item.danger && 'text-red-600 dark:text-red-400')}>
        {item.label}
      </span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="flex-none rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {item.badge}
        </span>
      )}
      {item.href ? (
        <span className="flex-none text-stone-300 dark:text-stone-600" aria-hidden="true">↗</span>
      ) : (
        !item.danger && <ChevronRight className="h-4 w-4 flex-none text-stone-300 dark:text-stone-600" />
      )}
    </>
  );

  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={rowClassName}>
        {content}
      </a>
    );
  }

  if (item.to) {
    return (
      <Link to={item.to} className={rowClassName}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={item.onClick} className={rowClassName}>
      {content}
    </button>
  );
};

export interface MobileMenuPageProps {
  title: string;
  subtitle?: string;
  groups: MobileMenuGroup[];
  footer?: React.ReactNode;
  /** 页面头部已展示同一标题时可关闭，避免重复大标题 */
  showTitle?: boolean;
}

export const MobileMenuPage: React.FC<MobileMenuPageProps> = ({ title, subtitle, groups, footer, showTitle = true }) => (
  <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
    {(showTitle || subtitle) && (
      <div className="mb-5">
        {showTitle && (
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{title}</h1>
        )}
        {subtitle && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
      </div>
    )}

    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.id}>
          {group.title && (
            <h2 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 dark:text-stone-600">
              {group.title}
            </h2>
          )}
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/70 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
            {group.items.map((item) => (
              <MobileMenuRow key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>

    {footer}
  </div>
);

export interface MobileSectionHeaderProps {
  title: string;
  /** 传入时渲染左上角返回按钮，并固定回到该菜单页 */
  backTo?: string;
  /** 右侧操作区（如主题切换） */
  actions?: React.ReactNode;
}

export const MobileSectionHeader: React.FC<MobileSectionHeaderProps> = ({ title, backTo, actions }) => {
  const { t } = useTranslation(['nav']);
  const navigate = useNavigate();

  return (
    <header className="lg:hidden sticky top-0 z-30 glass safe-area-inset-top border-b border-stone-200/60 dark:border-stone-700/60">
      <div className="flex min-h-14 items-center gap-1.5 px-3">
        {backTo ? (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label={t('nav:menu.back')}
            className="inline-flex flex-none items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>{t('nav:menu.back')}</span>
          </button>
        ) : (
          <span className="w-1 flex-none" aria-hidden="true" />
        )}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          {title}
        </h1>
        {actions && <div className="flex flex-none items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
};
