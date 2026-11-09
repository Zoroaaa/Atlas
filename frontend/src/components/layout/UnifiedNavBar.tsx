/**
 * UnifiedNavBar - 统一导航栏组件
 * 整合 Logo、核心 Tab 切换器、下拉菜单和工具按钮
 * 支持桌面端和移动端响应式布局
 */
import React, { useState, useCallback, memo, useEffect } from 'react';
import { Link, useNavigate, type NavigateFunction } from 'react-router-dom';
import {
  User,
  ChevronDown,
  ShieldAlert,
  Github,
  HelpCircle,
  Moon,
  Sun,
  ShieldCheck,
  Shield,
  Loader2,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore, useThemeStore, useProxyStore } from '@/stores';
import type { SearchTabType } from '@/types/source';
import { DropdownMenu, userMenuItems, Modal, LanguageSwitcher } from '@/components/ui';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SEARCH_TABS, PINNED_TABS } from '@/config/tabs';
import { useTranslation } from 'react-i18next';

/* ── 类型定义 ── */

export interface UnifiedNavBarProps {
  /** 当前激活的 Tab */
  activeTab: SearchTabType;
  /** Tab 切换回调 */
  onTabChange: (tab: SearchTabType) => void;
  /** 是否已认证 */
  isAuthenticated: boolean;
  /** 用户信息 */
  user?: { username?: string; role?: string } | null;
  /** 是否管理员 */
  isAdmin: boolean;
}

/* ── 子组件 ── */

/** Logo + 应用名称 */
const LogoSection: React.FC = memo(() => (
  <Link to="/" className="flex items-center gap-2.5 group">
    <div className="relative w-9 h-9 sm:w-10 sm:h-10">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#d4a853] to-[#f59e0b] opacity-0 group-hover:opacity-20 blur-lg transition-all duration-300" />
      <img
        src="/logo.svg"
        alt="Atlas"
        className="relative w-full h-full rounded-xl shadow-lg object-cover"
      />
    </div>
    <span className="text-lg sm:text-xl font-bold gradient-text display-font hidden sm:block">
      Atlas
    </span>
  </Link>
));

LogoSection.displayName = 'LogoSection';

/** Tab 切换按钮 */
interface TabButtonProps {
  tab: (typeof SEARCH_TABS)[SearchTabType];
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = memo(({ tab, isActive, onClick }) => {
  const { t } = useTranslation(['tabs']);
  const isCommunity = tab.id === 'community';
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      className={clsx(
        'px-3 xl:px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200',
        isCommunity && !isActive && [
          'text-white shadow-md bg-gradient-to-r from-amber-400 via-orange-500 to-red-500',
          'shadow-orange-500/30 animate-pulse-subtle hover:shadow-orange-500/50 hover:scale-105',
        ],
        isActive && !isCommunity
          ? clsx(
              'text-white shadow-md bg-gradient-to-br',
              tab.gradient,
              'shadow-amber-500/25'
            )
          : (!isCommunity && 'font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800'),
        isCommunity && isActive && [
          'text-white shadow-lg bg-gradient-to-r from-amber-400 via-orange-500 to-red-500',
          'shadow-orange-500/40 scale-105',
        ]
      )}
    >
      <span className="tab-icon">{tab.icon}</span>
      <span className="tab-label hidden md:inline ml-1.5">{t(tab.labelKey)}</span>
    </button>
  );
});

TabButton.displayName = 'TabButton';

/** 用户下拉菜单触发器 */
interface UserDropdownProps {
  isAuthenticated: boolean;
  user?: { username?: string; role?: string } | null;
  isAdmin: boolean;
  navigate: NavigateFunction;
  handleLogout: () => void;
}

const UserDropdown: React.FC<UserDropdownProps> = memo(
  ({ isAuthenticated, user, isAdmin, navigate, handleLogout }) => {
    const { t } = useTranslation(['nav']);
    return (
      <DropdownMenu
        trigger={
          <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200">
            {isAuthenticated ? (
              <>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-semibold bg-gradient-to-br from-[#d4a853] to-[#f59e0b] shadow-sm">
                  {user?.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="hidden sm:inline text-sm font-medium">{user?.username}</span>
                <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
              </>
            ) : (
              <>
                <User className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">{t('nav:userMenu.login')}</span>
              </>
            )}
          </button>
        }
        items={
          isAuthenticated
            ? userMenuItems(t, navigate, handleLogout, { isAdmin })
            : [
                { id: 'login', label: t('nav:userMenu.login'), icon: <User className="w-4 h-4" />, onClick: () => navigate('/login') },
                { id: 'register', label: t('nav:userMenu.register'), icon: <User className="w-4 h-4" />, onClick: () => navigate('/register') },
              ]
        }
        triggerMode="click"
        align="right"
        showArrow={false}
      />
    );
  }
);

UserDropdown.displayName = 'UserDropdown';

/** 工具按钮行 */
interface ToolButtonsProps {
  setIsHelpModalOpen: (open: boolean) => void;
}

const ToolButtons: React.FC<ToolButtonsProps> = memo(({ setIsHelpModalOpen }) => {
  const { t } = useTranslation(['nav']);
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { isEnabled: isProxyEnabled, status: proxyStatus, isLoading: isProxyLoading, toggleProxy, initializeProxy } = useProxyStore();

  useEffect(() => {
    initializeProxy();
  }, [initializeProxy]);

  const getProxyButtonClass = () => {
    if (isProxyEnabled) return 'proxy-toggle-btn enabled';
    if (proxyStatus === 'error') return 'proxy-toggle-btn error';
    return 'proxy-toggle-btn disabled';
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* 代理切换 */}
      <button
        onClick={toggleProxy}
        disabled={isProxyLoading}
        className={getProxyButtonClass()}
        title={isProxyEnabled ? t('nav:proxy.enableTitle') : t('nav:proxy.disableTitle')}
      >
        {isProxyLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isProxyEnabled ? (
          <ShieldCheck className="w-4 h-4" />
        ) : proxyStatus === 'error' ? (
          <ShieldAlert className="w-4 h-4" />
        ) : (
          <Shield className="w-4 h-4" />
        )}
      </button>

      {/* 主题切换 */}
      <button onClick={toggleTheme} className="theme-toggle-btn" aria-label={t('nav:theme.toggle')} title={t('nav:theme.toggleTitle')}>
        {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {/* 分隔线 */}
      <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />

      {/* 帮助按钮 */}
      <button
        onClick={() => setIsHelpModalOpen(true)}
        className="p-2 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
        title={t('nav:help.buttonTitle')}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {/* GitHub 链接 */}
      <a
        href="https://github.com/Zoroaaa/Atlas"
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
        title={t('nav:github.title')}
      >
        <Github className="w-4 h-4" />
      </a>
    </div>
  );
});

ToolButtons.displayName = 'ToolButtons';

/* ── 主组件 ── */

export const UnifiedNavBar: React.FC<UnifiedNavBarProps> = memo(({
  activeTab,
  onTabChange,
  isAuthenticated,
  user,
  isAdmin,
}) => {
  const { t } = useTranslation(['nav', 'tabs']);
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { isEnabled: isProxyEnabled, status: proxyStatus, isLoading: isProxyLoading, toggleProxy } = useProxyStore();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isProxyConfirmOpen, setIsProxyConfirmOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const getProxyButtonClass = () => {
    if (isProxyEnabled) return 'proxy-toggle-btn enabled';
    if (proxyStatus === 'error') return 'proxy-toggle-btn error';
    return 'proxy-toggle-btn disabled';
  };

  // 处理登出
  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  // 处理 Tab 切换
  const handleTabChange = useCallback(
    (tabKey: string) => {
      onTabChange(tabKey as SearchTabType);
    },
    [onTabChange]
  );

  // 移动端“更多”抽屉：Esc 关闭并锁定背景滚动
  useEffect(() => {
    if (!isMoreOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMoreOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMoreOpen]);

  return (
    <>
      {/* ── 桌面端/平板端导航栏 ── */}
      <header className="sticky top-0 z-40 glass">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 min-w-0">

            {/* 左侧区域：Logo + Tab 切换器 */}
            <div className="flex items-center gap-4 lg:gap-6 min-w-0 flex-shrink">
              <LogoSection />

              {/* Tab 切换器 - 桌面端显示，登录后可见 */}
              {isAuthenticated && (
              <div className="hidden md:flex items-center gap-1">
                <nav role="tablist" className="flex items-center gap-1">
                  {PINNED_TABS.map((tab) => (
                    <TabButton
                      key={tab.id}
                      tab={tab as (typeof SEARCH_TABS)[SearchTabType]}
                      isActive={activeTab === tab.id}
                      onClick={() => handleTabChange(tab.id)}
                    />
                  ))}
                </nav>

                {/* 独立"源站"入口：不属于 tablist，避免成为第六个 tab */}
                <div className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" />
                <button
                  onClick={() => handleTabChange('sources')}
                  title={t('tabs:sources.label')}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all duration-200',
                    activeTab === 'sources'
                      ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
                  )}
                >
                  <span>{SEARCH_TABS.sources.icon}</span>
                  <span>{t('tabs:sources.short')}</span>
                </button>
              </div>
              )}
            </div>

            {/* 右侧区域：用户 + 功能按钮 */}
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              {/* 功能工具组 - 登录后可见，移动端精简显示 */}
              {isAuthenticated && (
              <div className="flex items-center gap-0.5">
                {/* 代理切换 - 移动端仅显示图标 */}
                <button
                  onClick={() => {
                    if (isProxyEnabled) {
                      // 已开启时直接关闭，无需确认
                      toggleProxy();
                    } else {
                      // 未开启时显示确认弹窗
                      setIsProxyConfirmOpen(true);
                    }
                  }}
                  disabled={isProxyLoading}
                  className={clsx(getProxyButtonClass(), 'sm:p-2 p-1.5')}
                  title={isProxyEnabled ? t('nav:proxy.enableTitle') : t('nav:proxy.disableTitle')}
                >
                  {isProxyLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isProxyEnabled ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : proxyStatus === 'error' ? (
                    <ShieldAlert className="w-4 h-4" />
                  ) : (
                    <Shield className="w-4 h-4" />
                  )}
                </button>

                {/* 通知 */}
                <NotificationBell />

                {/* 主题切换 - 移动端收进“更多”抽屉 */}
                <button onClick={toggleTheme} className="theme-toggle-btn hidden sm:flex sm:p-2" aria-label={t('nav:theme.toggle')} title={t('nav:theme.toggle')}>
                  {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                {/* 更多 - 仅移动端 */}
                <button
                  onClick={() => setIsMoreOpen(true)}
                  className="md:hidden p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-all duration-200"
                  aria-label={t('nav:mobileMore.open')}
                  title={t('nav:mobileMore.open')}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
              )}

              {/* 分隔线 - 仅桌面端、登录后显示 */}
              {isAuthenticated && (
              <div className="hidden sm:block w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />
              )}

              {/* 以下按钮移动端隐藏，避免溢出 */}
              <div className="hidden sm:flex items-center gap-0.5">
                {/* 语言切换 */}
                <LanguageSwitcher />

                {/* 帮助按钮 */}
                <button
                  onClick={() => setIsHelpModalOpen(true)}
                  className="p-2 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
                  title={t('nav:help.buttonTitle')}
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                {/* GitHub 链接 */}
                <a
                  href="https://github.com/Zoroaaa/codeseek"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
                  title={t('nav:github.title')}
                >
                  <Github className="w-4 h-4" />
                </a>
              </div>

              {/* 用户菜单 - 移动端紧凑显示；管理员看板入口在菜单内按权限注入 */}
              <UserDropdown
                isAuthenticated={isAuthenticated}
                user={user}
                isAdmin={isAdmin}
                navigate={navigate}
                handleLogout={handleLogout}
              />
            </div>
          </div>
        </div>

        {/* ── 移动端搜索分类：底部栏改为站点导航后，分类切换就近收进页头 ── */}
        {isAuthenticated && (
          <div
            className="md:hidden border-t border-stone-200/60 dark:border-stone-700/60"
            role="navigation"
            aria-label={t('nav:mobileNav.searchTabs')}
          >
            <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 no-scrollbar">
              {PINNED_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    aria-pressed={isActive}
                    className={clsx(
                      'flex flex-none items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200',
                      isActive
                        ? clsx('bg-gradient-to-br text-white shadow-sm', tab.gradient)
                        : 'bg-stone-100/80 text-stone-600 hover:bg-stone-200/80 dark:bg-stone-800/70 dark:text-stone-300 dark:hover:bg-stone-700/70'
                    )}
                  >
                    <span className="text-sm leading-none">{tab.icon}</span>
                    <span>{t(tab.shortLabelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* ── 移动端“更多”底部抽屉 ── */}
      {isAuthenticated && isMoreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60]"
          role="dialog"
          aria-modal="true"
          aria-label={t('nav:mobileMore.title')}
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-stone-200 bg-white shadow-2xl safe-area-inset-bottom dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800">
              <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">
                {t('nav:mobileMore.title')}
              </span>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                aria-label={t('nav:mobileMore.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2">
              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  handleTabChange('sources');
                }}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
                  activeTab === 'sources'
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                    : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800'
                )}
              >
                <span className="text-lg leading-none">{SEARCH_TABS.sources.icon}</span>
                <span>{t('nav:mobileMore.sources')}</span>
                {activeTab === 'sources' ? (
                  <span className="ml-auto rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-800/50 dark:text-teal-300">
                    {t('nav:mobileMore.active')}
                  </span>
                ) : null}
              </button>
              <button
                onClick={toggleTheme}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                <span>{t('nav:mobileMore.theme')}</span>
                <span className="ml-auto text-xs text-stone-400 dark:text-stone-500">
                  {resolvedTheme === 'dark'
                    ? t('nav:mobileMore.themeDark')
                    : t('nav:mobileMore.themeLight')}
                </span>
              </button>
              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  setIsHelpModalOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <HelpCircle className="h-4 w-4" />
                <span>{t('nav:mobileMore.help')}</span>
              </button>
              <a
                href="https://github.com/Zoroaaa/codeseek"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMoreOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <Github className="h-4 w-4" />
                <span>{t('nav:mobileMore.github')}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── 帮助入口：简短提示 + 前往帮助中心 ── */}
      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title={t('nav:help.modalTitle')}
        size="md"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/80 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
            <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              {t('nav:help.hint')}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsHelpModalOpen(false)}
              className="flex-1 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {t('nav:help.close')}
            </button>
            <button
              onClick={() => {
                setIsHelpModalOpen(false);
                navigate('/help');
              }}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-500/25 transition-all hover:from-amber-600 hover:to-orange-600"
            >
              {t('nav:help.openCenter')}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── 代理确认弹窗 ── */}
      <Modal
        isOpen={isProxyConfirmOpen}
        onClose={() => setIsProxyConfirmOpen(false)}
        title={t('nav:proxyConfirm.title')}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/30">
            <ShieldCheck className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-stone-700 dark:text-stone-300 font-medium">
                {t('nav:proxyConfirm.description')}
              </p>
              <ul className="text-xs text-stone-600 dark:text-stone-400 space-y-1 ml-4 list-disc">
                <li>{t('nav:proxyConfirm.items.jav')}</li>
                <li>{t('nav:proxyConfirm.items.anime')}</li>
                <li>{t('nav:proxyConfirm.items.movie')}</li>
                <li>{t('nav:proxyConfirm.items.manga')}</li>
                <li>{t('nav:proxyConfirm.items.favorites')}</li>
              </ul>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/30">
            <p className="text-xs text-violet-700 dark:text-violet-300">
              <span dangerouslySetInnerHTML={{ __html: t('nav:proxyConfirm.keyLabel') }} />
              <code className="ml-2 px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-800/50 font-mono">pp520</code>
            </p>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 text-center">
            {t('nav:proxyConfirm.purpose')}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setIsProxyConfirmOpen(false)}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
            >
              {t('nav:proxyConfirm.cancel')}
            </button>
            <button
              onClick={() => {
                setIsProxyConfirmOpen(false);
                toggleProxy();
              }}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-md shadow-amber-500/25 transition-all"
            >
              {t('nav:proxyConfirm.confirm')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
});

UnifiedNavBar.displayName = 'UnifiedNavBar';

export default UnifiedNavBar;
