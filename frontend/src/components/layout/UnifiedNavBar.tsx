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
import type { SearchTabType } from '@/stores/sourceStore';
import { DropdownMenu, userMenuItems, Modal } from '@/components/ui';
import { SEARCH_TABS } from '@/config/tabs';

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
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 opacity-0 group-hover:opacity-20 blur-lg transition-all duration-300" />
      <img
        src="/logo.png"
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
              'shadow-blue-500/25'
            )
          : (!isCommunity && 'font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'),
        isCommunity && isActive && [
          'text-white shadow-lg bg-gradient-to-r from-amber-400 via-orange-500 to-red-500',
          'shadow-orange-500/40 scale-105',
        ]
      )}
    >
      <span className="tab-icon">{tab.icon}</span>
      <span className="tab-label hidden md:inline ml-1.5">{tab.label}</span>
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
            ? 'text-blue-600 dark:text-blue-400 scale-105'
            : 'text-slate-500 dark:text-slate-400'
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
        {tab.label.replace('搜索', '').replace('访问', '')}
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
  ({ isAuthenticated, user, navigate, handleLogout }) => (
    <DropdownMenu
      trigger={
        <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200">
          {isAuthenticated ? (
            <>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-semibold bg-gradient-to-br from-blue-500 to-violet-600 shadow-sm">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="hidden sm:inline text-sm font-medium">{user?.username}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </>
          ) : (
            <>
              <User className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">登录</span>
            </>
          )}
        </button>
      }
      items={
        isAuthenticated
          ? userMenuItems(navigate, handleLogout, user?.username)
          : [
              { id: 'login', label: '登录', icon: <User className="w-4 h-4" />, onClick: () => navigate('/login') },
              { id: 'register', label: '注册', icon: <User className="w-4 h-4" />, onClick: () => navigate('/register') },
            ]
      }
      triggerMode="click"
      align="right"
      showArrow={false}
    />
  )
);

UserDropdown.displayName = 'UserDropdown';

/** 管理员入口 */
const AdminLink: React.FC = memo(() => (
  <Link
    to="/admin-panel"
    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
    title="管理后台"
  >
    <ShieldAlert className="w-4 h-4" />
  </Link>
));

AdminLink.displayName = 'AdminLink';

/** 社区入口 */
const CommunityLink: React.FC = memo(() => (
  <Link
    to="/community"
    className="p-2 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all duration-200"
    title="社区"
  >
    <Globe className="w-4 h-4" />
  </Link>
));

CommunityLink.displayName = 'CommunityLink';

/** 工具按钮行 */
interface ToolButtonsProps {
  setIsHelpModalOpen: (open: boolean) => void;
}

const ToolButtons: React.FC<ToolButtonsProps> = memo(({ setIsHelpModalOpen }) => {
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
        title={isProxyEnabled ? '代理已启用 - 点击关闭' : '代理已关闭 - 点击启用'}
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
      <button onClick={toggleTheme} className="theme-toggle-btn" aria-label="切换主题" title="切换深色/浅色模式">
        {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {/* 分隔线 */}
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

      {/* 帮助按钮 */}
      <button
        onClick={() => setIsHelpModalOpen(true)}
        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
        title="使用说明"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {/* GitHub 链接 */}
      <a
        href="https://github.com/Zoroaaa/codeseek"
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
        title="GitHub"
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
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { isEnabled: isProxyEnabled, status: proxyStatus, isLoading: isProxyLoading, toggleProxy } = useProxyStore();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

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
                {Object.entries(SEARCH_TABS).map(([key, tab]) => (
                  <TabButton
                    key={key}
                    tab={tab}
                    isActive={activeTab === key}
                    onClick={() => handleTabChange(key)}
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
                  onClick={toggleProxy}
                  disabled={isProxyLoading}
                  className={clsx(getProxyButtonClass(), 'sm:p-2 p-1.5')}
                  title={isProxyEnabled ? '代理已启用' : '代理已关闭'}
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
                <button onClick={toggleTheme} className="theme-toggle-btn sm:p-2 p-1.5" aria-label="切换主题" title="切换主题">
                  {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
              )}

              {/* 分隔线 - 仅桌面端、登录后显示 */}
              {isAuthenticated && (
              <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
              )}

              {/* 以下按钮移动端隐藏，避免溢出 */}
              <div className="hidden sm:flex items-center gap-0.5">
                {/* 帮助按钮 */}
                <button
                  onClick={() => setIsHelpModalOpen(true)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
                  title="使用说明"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                {/* GitHub 链接 */}
                <a
                  href="https://github.com/Zoroaaa/codeseek"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
                  title="GitHub"
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass safe-area-inset-bottom border-t border-slate-200/60 dark:border-slate-700/60"
        role="navigation"
        aria-label="主导航"
      >
        <div className="flex items-stretch justify-between h-14 max-w-lg mx-auto">
          {Object.entries(SEARCH_TABS).map(([key, tab]) => (
            <MobileTab
              key={key}
              tab={tab}
              isActive={activeTab === key}
              onClick={() => handleTabChange(key)}
            />
          ))}
        </div>
      </nav>
      )}

      {/* ── 帮助模态框 ── */}
      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title="使用说明"
        size="lg"
      >
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-4">
          <p><strong>Atlas</strong>是一站式聚合搜索引擎，覆盖 JAV / 动漫 / 影视，支持多源聚合搜索。</p>

          <div>
            <h3 className="font-semibold text-base mb-2">如何使用</h3>
            <ol className="list-decimal list-inside space-y-1.5 ml-2">
              <li>使用顶部导航切换搜索类型（JAV / 动漫 / 影视 / 搜索源）</li>
              <li>在搜索框输入关键词或番号，按回车或点击搜索</li>
              <li>使用分类标签筛选特定类型的资源</li>
              <li>点击结果卡片上的按钮访问资源或收藏</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">快捷操作</h3>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li><strong>代理开关</strong>：访问受限资源时开启网络代理</li>
              <li><strong>收藏功能</strong>：登录后可收藏资源，多端同步</li>
              <li><strong>搜索历史</strong>：自动记录搜索记录，一键回搜</li>
              <li><strong>JAV排行</strong>：JAV Tab 下展示热门番号排行</li>
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs">
            提示：输入 JAV 畗号格式（如 SONE-520）会自动触发详情提取
          </div>
        </div>
      </Modal>
    </>
  );
});

UnifiedNavBar.displayName = 'UnifiedNavBar';

export default UnifiedNavBar;
