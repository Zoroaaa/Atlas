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
  Globe,
  Github,
  HelpCircle,
  Moon,
  Sun,
  ShieldCheck,
  Shield,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore, useThemeStore, useProxyStore } from '@/stores';
import type { SearchTabType } from '@/types/source';
import { DropdownMenu, userMenuItems, Modal, LanguageSwitcher } from '@/components/ui';
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

/** 移动端底部导航 Tab 按钮 */
interface MobileTabProps {
  tab: (typeof SEARCH_TABS)[SearchTabType];
  isActive: boolean;
  onClick: () => void;
}

const MobileTab: React.FC<MobileTabProps> = memo(({ tab, isActive, onClick }) => {
  const { t } = useTranslation(['tabs']);
  const isCommunity = tab.id === 'community';
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-center justify-center py-1.5 px-2 flex-1 transition-all duration-200',
        isCommunity
          ? [
              isActive
                ? 'text-orange-500 scale-105'
                : 'text-orange-400 scale-100',
              'relative',
            ]
          : isActive
            ? 'text-amber-700 dark:text-amber-400 scale-105'
            : 'text-stone-500 dark:text-stone-400'
      )}
      style={isActive ? { animation: 'bounceGentle 0.3s ease' } : undefined}
    >
      {isCommunity && (
        <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
      )}
      <span className={clsx(
        'text-lg sm:text-xl',
        isCommunity && 'drop-shadow-sm'
      )}>{tab.icon}</span>
      <span className="text-[10px] xs:text-xs mt-0.5 font-medium leading-tight">
        {t(tab.shortLabelKey)}
      </span>
    </button>
  );
});

MobileTab.displayName = 'MobileTab';

/** 用户下拉菜单触发器 */
interface UserDropdownProps {
  isAuthenticated: boolean;
  user?: { username?: string; role?: string } | null;
  navigate: NavigateFunction;
  handleLogout: () => void;
}

const UserDropdown: React.FC<UserDropdownProps> = memo(
  ({ isAuthenticated, user, navigate, handleLogout }) => {
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
            ? userMenuItems(t, navigate, handleLogout, user?.username)
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

/** 管理员入口 */
const AdminLink: React.FC = memo(() => {
  const { t } = useTranslation(['nav']);
  return (
    <Link
      to="/admin-panel"
      className="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
      title={t('nav:adminLink.title')}
    >
      <ShieldAlert className="w-4 h-4" />
    </Link>
  );
});

AdminLink.displayName = 'AdminLink';

/** 社区入口 */
const CommunityLink: React.FC = memo(() => {
  const { t } = useTranslation(['nav']);
  return (
    <Link
      to="/community"
      className="p-2 rounded-lg text-stone-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all duration-200"
      title={t('nav:communityLink.title')}
    >
      <Globe className="w-4 h-4" />
    </Link>
  );
});

CommunityLink.displayName = 'CommunityLink';

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
  const { t } = useTranslation(['nav']);
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { isEnabled: isProxyEnabled, status: proxyStatus, isLoading: isProxyLoading, toggleProxy } = useProxyStore();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isProxyConfirmOpen, setIsProxyConfirmOpen] = useState(false);

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

  return (
    <>
      {/* ── 桌面端/平板端导航栏 ── */}
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 min-w-0">

            {/* 左侧区域：Logo + Tab 切换器 */}
            <div className="flex items-center gap-4 lg:gap-6 min-w-0 flex-shrink">
              <LogoSection />

              {/* Tab 切换器 - 桌面端显示，登录后可见 */}
              {isAuthenticated && (
              <nav role="tablist" className="hidden md:flex items-center gap-1">
                {PINNED_TABS.map((tab) => (
                  <TabButton
                    key={tab.id}
                    tab={tab as (typeof SEARCH_TABS)[SearchTabType]}
                    isActive={activeTab === tab.id}
                    onClick={() => handleTabChange(tab.id)}
                  />
                ))}
              </nav>
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

                {/* 主题切换 */}
                <button onClick={toggleTheme} className="theme-toggle-btn sm:p-2 p-1.5" aria-label={t('nav:theme.toggle')} title={t('nav:theme.toggle')}>
                  {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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

              {/* 管理员入口 - 登录后可见，移动端隐藏 */}
              {isAuthenticated && (
              <div className="hidden sm:flex items-center gap-0.5">
                {isAdmin && (
                  <AdminLink />
                )}
              </div>
              )}

              {/* 用户菜单 - 移动端紧凑显示 */}
              <UserDropdown
                isAuthenticated={isAuthenticated}
                user={user}
                navigate={navigate}
                handleLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── 移动端底部导航栏 - 登录后可见 ── */}
      {isAuthenticated && (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass safe-area-inset-bottom border-t border-stone-200/60 dark:border-stone-700/60"
        role="navigation"
        aria-label={t('nav:mobileNav.ariaLabel')}
      >
        <div className="flex items-stretch justify-between h-14 max-w-lg mx-auto">
          {PINNED_TABS.map((tab) => (
            <MobileTab
              key={tab.id}
              tab={tab as (typeof SEARCH_TABS)[SearchTabType]}
              isActive={activeTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
            />
          ))}
        </div>
      </nav>
      )}

      {/* ── 帮助模态框 ── */}
      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title={t('nav:help.modalTitle')}
        size="lg"
      >
        <div className="text-sm text-stone-600 dark:text-stone-300 space-y-4">
          <p dangerouslySetInnerHTML={{ __html: t('nav:help.intro') }} />

          <div>
            <h3 className="font-semibold text-base mb-2">{t('nav:help.howToUseTitle')}</h3>
            <ol className="list-decimal list-inside space-y-1.5 ml-2">
              <li>{t('nav:help.howToUse1')}</li>
              <li>{t('nav:help.howToUse2')}</li>
              <li>{t('nav:help.howToUse3')}</li>
              <li>{t('nav:help.howToUse4')}</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">{t('nav:help.shortcutsTitle')}</h3>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li dangerouslySetInnerHTML={{ __html: t('nav:help.proxyShortcut') }} />
              <li dangerouslySetInnerHTML={{ __html: t('nav:help.favoriteShortcut') }} />
              <li dangerouslySetInnerHTML={{ __html: t('nav:help.historyShortcut') }} />
              <li dangerouslySetInnerHTML={{ __html: t('nav:help.javRankingShortcut') }} />
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs">
            {t('nav:help.tip')}
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
