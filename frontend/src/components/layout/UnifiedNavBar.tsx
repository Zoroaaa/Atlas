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
import { DropdownMenu, userMenuItems, adminMenuItems, communityMenuItems, Modal } from '@/components/ui';
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
  /** 社区功能是否启用 */
  communityEnabled?: boolean;
}

/* ── 子组件 ── */

/** Logo + 应用名称 */
const LogoSection: React.FC = memo(() => (
  <Link to="/" className="flex items-center gap-2.5 group">
    <div className="relative w-9 h-9 sm:w-10 sm:h-10">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 opacity-0 group-hover:opacity-20 blur-lg transition-all duration-300" />
      <img
        src="/logo.png"
        alt="磁力快搜"
        className="relative w-full h-full rounded-xl shadow-lg object-cover"
      />
    </div>
    <span className="text-lg sm:text-xl font-bold gradient-text display-font hidden sm:block">
      磁力快搜
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
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      className={clsx(
        'px-3 xl:px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200',
        isActive
          ? clsx(
              'text-white shadow-md bg-gradient-to-br',
              tab.gradient,
              'shadow-blue-500/25'
            )
          : 'font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
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

const MobileTab: React.FC<MobileTabProps> = memo(({ tab, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={clsx(
      'flex flex-col items-center justify-center py-2 px-3 min-w-[60px] transition-all duration-200',
      isActive
        ? 'text-blue-600 dark:text-blue-400 scale-105'
        : 'text-slate-500 dark:text-slate-400'
    )}
    style={isActive ? { animation: 'bounceGentle 0.3s ease' } : undefined}
  >
    <span className="text-xl">{tab.icon}</span>
    <span className="text-[10px] xs:text-xs mt-0.5 font-medium">
      {tab.label.replace('搜索', '')}
    </span>
  </button>
));

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
        <button className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200">
          {isAuthenticated ? (
            <>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-semibold bg-gradient-to-br from-blue-500 to-violet-600 shadow-sm">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="hidden sm:inline text-sm font-medium">{user?.username}</span>
              <ChevronDown className="w-4 h-4" />
            </>
          ) : (
            <>
              <User className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">登录</span>
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

/** 管理员下拉菜单 */
interface AdminDropdownProps {
  navigate: NavigateFunction;
}

const AdminDropdown: React.FC<AdminDropdownProps> = memo(({ navigate }) => (
  <DropdownMenu
    trigger={
      <button
        className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-all duration-200 active:scale-95"
        title="管理"
      >
        <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
    }
    items={adminMenuItems(navigate)}
    triggerMode="click"
    align="right"
  />
));

AdminDropdown.displayName = 'AdminDropdown';

/** 社区下拉菜单 */
interface CommunityDropdownProps {
  navigate: NavigateFunction;
}

const CommunityDropdown: React.FC<CommunityDropdownProps> = memo(({ navigate }) => (
  <DropdownMenu
    trigger={
      <button
        className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-all duration-200 active:scale-95"
        title="社区"
      >
        <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
    }
    items={communityMenuItems(navigate)}
    triggerMode="click"
    align="right"
  />
));

CommunityDropdown.displayName = 'CommunityDropdown';

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
    <div className="flex items-center gap-1">
      {/* 帮助按钮 */}
      <button
        onClick={() => setIsHelpModalOpen(true)}
        className="help-btn"
        title="使用说明"
      >
        <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* 代理切换 */}
      <button
        onClick={toggleProxy}
        disabled={isProxyLoading}
        className={getProxyButtonClass()}
        title={isProxyEnabled ? '代理已启用 - 点击关闭' : '代理已关闭 - 点击启用'}
      >
        {isProxyLoading ? (
          <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
        ) : isProxyEnabled ? (
          <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : proxyStatus === 'error' ? (
          <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : (
          <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
        )}
      </button>

      {/* GitHub 链接 */}
      <a
        href="https://github.com/Zoroaaa/codeseek"
        target="_blank"
        rel="noopener noreferrer"
        className="github-link-btn"
        title="GitHub"
      >
        <Github className="w-4 h-4 sm:w-5 sm:h-5" />
      </a>

      {/* 主题切换 */}
      <button onClick={toggleTheme} className="theme-toggle-btn" aria-label="切换主题">
        {resolvedTheme === 'dark' ? (
          <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : (
          <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
        )}
      </button>
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
  communityEnabled = false,
}) => {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* 左侧区域：Logo + Tab 切换器 */}
            <div className="flex items-center gap-4 lg:gap-6">
              <LogoSection />

              {/* Tab 切换器 - 桌面端显示 */}
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
            </div>

            {/* 右侧区域：用户菜单 + 管理员菜单 + 社区菜单 + 工具按钮 */}
            <div className="flex items-center gap-1 sm:gap-2">
              <UserDropdown
                isAuthenticated={isAuthenticated}
                user={user}
                navigate={navigate}
                handleLogout={handleLogout}
              />

              {isAdmin && <AdminDropdown navigate={navigate} />}

              {communityEnabled && <CommunityDropdown navigate={navigate} />}

              <ToolButtons setIsHelpModalOpen={setIsHelpModalOpen} />

              {/* 移动端菜单按钮（可选：用于展开更多选项） */}
              <button
                className="md:hidden p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-all duration-200"
                onClick={() => {
                  // 可以在这里添加移动端侧边栏或更多选项的逻辑
                }}
                aria-label="更多选项"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── 移动端底部导航栏 ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass safe-area-inset-bottom"
        role="navigation"
        aria-label="主导航"
      >
        <div className="flex items-center justify-around py-2 px-2">
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

      {/* ── 帮助模态框 ── */}
      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title="使用说明"
        size="lg"
      >
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-3">
          <p><strong>磁力快搜</strong>是一个高效的磁力搜索工具，帮助您快速找到所需资源。</p>
          <h3 className="font-semibold text-base mt-4">主要功能：</h3>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li><strong>JAV番号搜索</strong>：搜索日本成人视频番号和相关资源</li>
            <li><strong>动漫搜索</strong>：搜索动漫、番剧、漫画等ACG资源</li>
            <li><strong>影视搜索</strong>：搜索电影、电视剧、综艺等影视资源</li>
            <li><strong>搜索源访问</strong>：快速访问各类浏览型资源站点</li>
          </ul>
          <h3 className="font-semibold text-base mt-4">使用技巧：</h3>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>使用顶部 Tab 切换不同类型的搜索</li>
            <li>点击代理按钮可以开启/关闭网络代理</li>
            <li>登录后可以收藏喜欢的资源和查看历史记录</li>
            <li>使用主题按钮可以切换深色/浅色模式</li>
          </ul>
        </div>
      </Modal>
    </>
  );
});

UnifiedNavBar.displayName = 'UnifiedNavBar';

export default UnifiedNavBar;
