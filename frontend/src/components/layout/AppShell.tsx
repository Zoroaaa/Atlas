/**
 * AppShell - 桌面端全局外壳（≥lg）。
 * 侧栏用「手风琴分组」承载全部导航，同一时间只展开一个分组，默认展开与当前路由匹配的分组。
 * 断点策略：<lg 直接返回 children，由 UnifiedNavBar + MobileTabBar 承担导航。
 * 约束：个人中心与后台分组从 workspaceNav 派生；搜索/发现使用本地配置。
 *       新增个人中心/后台菜单只改 workspaceNav，不要在本文件另存列表。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  BookOpen,
  BookText,
  ChevronDown,
  Clapperboard,
  Download,
  Film,
  Github,
  Globe,
  Heart,
  HelpCircle,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tags,
  Trophy,
  Tv,
  User,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useProxyStore, useSourceStore, useThemeStore } from '@/stores';
import { useFeatureFlags } from '@/contexts';
import { useFollows, useIsDesktop, useUnreadCount } from '@/hooks';
import type { SearchTabType } from '@/types/source';
import { SEARCH_TABS, PINNED_TABS } from '@/config/tabs';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { DropdownMenu, LanguageSwitcher, Modal } from '@/components/ui';
import { UserAccountMenu } from './UserAccountMenu';
import { adminNavGroups, dashboardNavGroups, isNavItemActive } from './workspaceNav';

interface AppShellProps {
  onSearchTabChange?: (tab: SearchTabType) => void;
  children: React.ReactNode;
}

type GroupId = 'search' | 'discover' | 'mine' | 'community' | 'admin';

interface SideNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  to?: string;
  onClick?: () => void;
  /** 组内小分类标题，仅在该分类第一项上声明 */
  sectionLabel?: string;
}

interface SideNavGroup {
  id: GroupId;
  label: string;
  icon: React.ReactNode;
  items: SideNavItem[];
}

const DOWNLOAD_URL = 'https://github.com/Zoroaaa/Atlas/releases';

const SEARCH_TAB_ICONS: Record<string, React.ReactNode> = {
  jav: <Clapperboard className="h-[16px] w-[16px]" />,
  anime: <Tv className="h-[16px] w-[16px]" />,
  movie: <Film className="h-[16px] w-[16px]" />,
  manga: <BookOpen className="h-[16px] w-[16px]" />,
  novel: <BookText className="h-[16px] w-[16px]" />,
};

const DISCOVER_ITEMS = [
  { id: 'recommend', labelKey: 'home:mobileHome.discoverPage.sections.recommend', icon: <Sparkles className="h-[16px] w-[16px]" /> },
  { id: 'rankings', labelKey: 'home:mobileHome.discoverPage.sections.rankings', icon: <Trophy className="h-[16px] w-[16px]" /> },
  { id: 'top250', labelKey: 'home:mobileHome.discoverPage.sections.top250', icon: <Trophy className="h-[16px] w-[16px]" /> },
  { id: 'genres', labelKey: 'home:mobileHome.discoverPage.sections.genres', icon: <Tags className="h-[16px] w-[16px]" /> },
  { id: 'actresses', labelKey: 'home:mobileHome.discoverPage.sections.actresses', icon: <Users className="h-[16px] w-[16px]" /> },
] as const;

/** 把当前路径归入侧栏分组，决定手风琴默认展开项。 */
const groupForPath = (pathname: string): GroupId => {
  if (pathname.startsWith('/discover')) return 'discover';
  if (pathname.startsWith('/dashboard') || pathname === '/me' || pathname.startsWith('/settings')) return 'mine';
  if (pathname.startsWith('/community')) return 'community';
  if (pathname.startsWith('/admin-panel')) return 'admin';
  return 'search';
};

interface SideItemProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: number;
  collapsed: boolean;
  onClick?: () => void;
  to?: string;
}

/** 侧栏叶子项：有 to 时渲染为路由链接，否则为点击项。 */
const SideItem: React.FC<SideItemProps> = ({ label, icon, active, badge, collapsed, onClick, to }) => {
  const className = clsx(
    'group relative flex h-[32px] w-full items-center gap-2.5 rounded-lg pl-7 pr-2 text-[12.5px] font-medium transition-colors',
    active
      ? 'bg-gradient-to-r from-[#d4a853] to-[#f59e0b] text-white shadow-[0_6px_16px_-10px_rgba(245,158,11,.9)]'
      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100'
  );

  const content = (
    <>
      <span className={clsx('flex-none', active ? 'text-white' : 'text-stone-400 dark:text-stone-500')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge !== undefined && badge > 0 ? (
        <span className="flex h-4 min-w-4 flex-none items-center justify-center rounded-md bg-rose-500 px-1 text-[9px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} title={collapsed ? label : undefined} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} title={collapsed ? label : undefined} className={className}>
      {content}
    </button>
  );
};

/** 全局桌面壳层：左侧手风琴侧栏 + 顶栏，children 为页面内容区。 */
export const AppShell: React.FC<AppShellProps> = ({ onSearchTabChange, children }) => {
  const { t } = useTranslation(['nav', 'tabs', 'home', 'search']);
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { activeTab, setActiveTab } = useSourceStore();
  const { sidebarCollapsed, toggleSidebar } = useThemeStore();
  const { isEnabled: proxyEnabled, status: proxyStatus, isLoading: proxyLoading, toggleProxy, initializeProxy } = useProxyStore();
  const { communityEnabled } = useFeatureFlags();
  const { data: follows } = useFollows();
  const { data: unreadNotifications = 0 } = useUnreadCount();
  const [openGroup, setOpenGroup] = useState<GroupId | null>(() => groupForPath(location.pathname));
  const [proxyConfirmOpen, setProxyConfirmOpen] = useState(false);
  const lastPathRef = useRef(location.pathname);

  const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
  const collapsed = sidebarCollapsed;
  const pathname = location.pathname;

  useEffect(() => { initializeProxy(); }, [initializeProxy]);

  // 路由切到另一个大类时，自动展开对应分组（手风琴始终只开一个）
  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    const group = groupForPath(pathname);
    setOpenGroup((current) => (current === group ? current : group));
  }, [pathname]);

  // ── 侧栏分组数据 ─────────────────────────────
  const groups: SideNavGroup[] = useMemo(() => {
    const list: SideNavGroup[] = [
      {
        id: 'search',
        label: t('nav:workspace.groups.search'),
        icon: <CompassIcon />,
        items: [
          ...PINNED_TABS.map((tab) => ({
            id: tab.id,
            label: t(tab.shortLabelKey),
            icon: SEARCH_TAB_ICONS[tab.id],
            active: pathname === '/main' && activeTab === tab.id,
            onClick: () => handleSearchTab(tab.id as SearchTabType),
          })),
          {
            id: 'sources',
            label: t('tabs:sources.short'),
            icon: <Globe className="h-[16px] w-[16px]" />,
            active: pathname === '/main' && activeTab === 'sources',
            onClick: () => handleSearchTab('sources'),
          },
        ],
      },
      {
        id: 'discover',
        label: t('nav:workspace.groups.discover'),
        icon: <Sparkles className="h-[16px] w-[16px]" />,
        items: DISCOVER_ITEMS.map((item) => ({
          id: item.id,
          label: t(item.labelKey),
          icon: item.icon,
          active: pathname === `/discover/${item.id}`,
          to: `/discover/${item.id}`,
        })),
      },
      {
        id: 'mine',
        label: t('nav:workspace.groups.mine'),
        icon: <User className="h-[16px] w-[16px]" />,
        // 与移动端个人中心共用 workspaceNav；新增入口只改那一处，避免桌面端漏项
        items: dashboardNavGroups.flatMap((group) =>
          group.items.map((item, index) => ({
            id: item.id,
            label: t(item.labelKey),
            icon: <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>,
            active: isNavItemActive(item.path, pathname),
            to: item.path,
            badge: item.id === 'follow-feed'
              ? (follows?.unread || undefined)
              : item.id === 'notifications'
                ? (unreadNotifications || undefined)
                : undefined,
            sectionLabel: index === 0 && group.labelKey ? t(group.labelKey) : undefined,
          }))
        ),
      },
    ];

    // 社区与后台分组按开关/角色动态挂载，避免无权限入口出现在侧栏
    if (communityEnabled !== false) {
      list.push({
        id: 'community',
        label: t('nav:workspace.community'),
        icon: <Users className="h-[16px] w-[16px]" />,
        items: [
          { id: 'browse', label: t('nav:community.items.browse'), icon: <CompassIcon />, active: pathname === '/community' || pathname.startsWith('/community/browse'), to: '/community' },
          { id: 'my-posts', label: t('nav:community.items.myPosts'), icon: <FileTextIcon />, active: pathname.startsWith('/community/my-shares'), to: '/community/my-shares' },
          { id: 'my-favorites', label: t('nav:community.items.myFavorites'), icon: <Heart className="h-[16px] w-[16px]" />, active: pathname.startsWith('/community/my-favorites'), to: '/community/my-favorites' },
          { id: 'tags', label: t('nav:community.items.tags'), icon: <Tags className="h-[16px] w-[16px]" />, active: pathname.startsWith('/community/tags'), to: '/community/tags' },
        ],
      });
    }

    if (isAdmin) {
      // 管理后台导航从 workspaceNav 派生，不再本地硬编码：
      // 两处各存一份时，加菜单漏改一处会让桌面端看不到入口（已实际发生过）
      list.push({
        id: 'admin',
        label: t('nav:adminPanel.title'),
        icon: <Shield className="h-[16px] w-[16px]" />,
        items: adminNavGroups.flatMap((group) =>
          group.items.map((item, index) => ({
            id: item.id,
            label: t(item.labelKey),
            // 桌面侧栏统一 16px；workspaceNav 里的图标按 17px 定义（移动端菜单用）
            icon: <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>,
            active: isNavItemActive(item.path, pathname),
            to: item.path,
            // 分组标题只挂在首项，与原硬编码的 sectionLabel 行为一致
            sectionLabel: index === 0 && group.labelKey ? t(group.labelKey) : undefined,
          }))
        ),
      });
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pathname, follows?.unread, unreadNotifications, isAdmin, communityEnabled, t]);

  const currentItem = useMemo(() => {
    // 路由项优先：/discover、/dashboard 等按 pathname 匹配，避免被搜索分类的 activeTab 抢占
    const routeItem = groups.flatMap((group) => group.items).find((item) => item.to && item.active);
    if (routeItem) return routeItem;
    if (pathname === '/main') {
      return groups.find((group) => group.id === 'search')?.items.find((item) => item.active);
    }
    return undefined;
  }, [groups, pathname]);
  const currentGroup = useMemo(
    () => groups.find((group) => group.items.some((item) => item === currentItem)),
    [groups, currentItem]
  );

  const handleSearchTab = (tab: SearchTabType) => {
    if (onSearchTabChange) {
      onSearchTabChange(tab);
      return;
    }
    setActiveTab(tab);
    navigate(`/main?tab=${tab}`);
  };

  // 断点：<lg 不渲染侧栏与顶栏，导航交给 UnifiedNavBar / MobileTabBar
  if (!isDesktop) return <>{children}</>;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-[#0a0a0b] dark:text-stone-100">
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-stone-200/80 bg-[#fbfaf8] transition-[width] duration-300 ease-out dark:border-stone-800/80 dark:bg-[#0d0d0f]',
          collapsed ? 'w-[72px]' : 'w-[232px]'
        )}
      >
        <div className={clsx('flex h-16 flex-none items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
          <Link to="/main" className="flex min-w-0 items-center gap-2.5" title={t('nav:brand.home')}>
            <span className="relative grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-[10px] bg-gradient-to-br from-[#f6e4b8] via-[#d4a853] to-[#b45309] shadow-[0_4px_12px_-4px_rgba(180,83,9,.55)]">
              <img src="/logo.svg" alt="" className="h-full w-full object-cover" />
            </span>
            {!collapsed && <span className="display-font truncate text-[17px] font-bold tracking-tight">Atlas</span>}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={t('nav:workspace.collapse')}
              className="ml-auto grid h-7 w-7 flex-none place-items-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={t('nav:workspace.expand')}
            className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-lg border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors hover:text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:hover:text-stone-200"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" style={{ scrollbarWidth: 'thin' }}>
          {groups.map((group) => {
            const open = !collapsed && openGroup === group.id;
            const groupActive = group.items.some((item) => item.active);

            // 折叠态只保留分组图标：点击图标会先展开侧栏，再打开对应分组
            if (collapsed) {
              return (
                <button
                  key={group.id}
                  type="button"
                  title={group.label}
                  onClick={() => { toggleSidebar(); setOpenGroup(group.id); }}
                  className={clsx(
                    'mb-1 flex h-9 w-full items-center justify-center rounded-lg transition-colors',
                    groupActive
                      ? 'bg-gradient-to-r from-[#d4a853] to-[#f59e0b] text-white'
                      : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
                  )}
                >
                  {group.icon}
                </button>
              );
            }

            return (
              <div key={group.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => setOpenGroup((current) => (current === group.id ? null : group.id))}
                  aria-expanded={open}
                  className={clsx(
                    'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors',
                    groupActive
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100'
                  )}
                >
                  <span className={clsx('flex-none', groupActive ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500')}>
                    {group.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
                  <ChevronDown className={clsx('h-3.5 w-3.5 flex-none text-stone-400 transition-transform', open && 'rotate-180')} />
                </button>

                {open ? (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => (
                      <React.Fragment key={item.id}>
                        {item.sectionLabel ? (
                          <div className="px-7 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400 dark:text-stone-600">
                            {item.sectionLabel}
                          </div>
                        ) : null}
                        <SideItem
                          label={item.label}
                          icon={item.icon}
                          active={item.active}
                          badge={item.badge}
                          collapsed={collapsed}
                          to={item.to}
                          onClick={item.onClick}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="flex-none border-t border-stone-200/70 px-2.5 py-2 dark:border-stone-800/70">
          <div className={clsx('flex items-center gap-2 px-1 pt-1', collapsed && 'justify-center')}>
            <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-gradient-to-br from-[#d4a853] to-[#f59e0b] text-[11px] font-semibold text-white">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{user?.username}</span>
                <button
                  type="button"
                  onClick={() => { logout(); navigate('/'); }}
                  title={t('nav:userMenu.logout')}
                  className="grid h-7 w-7 flex-none place-items-center rounded-lg text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      <div className={clsx('flex min-h-screen flex-col transition-[padding] duration-300 ease-out', collapsed ? 'pl-[72px]' : 'pl-[232px]')}>
        <header className="sticky top-0 z-40 flex h-16 flex-none items-center gap-2 border-b border-stone-200/70 bg-stone-50/80 px-6 backdrop-blur-xl safe-area-inset-top dark:border-stone-800/70 dark:bg-[#0a0a0b]/80">
          {currentGroup ? (
            <button
              type="button"
              onClick={() => setOpenGroup(currentGroup.id)}
              className="hidden rounded-lg px-1.5 py-1 text-[12px] font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 sm:inline-flex dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            >
              {currentGroup.label}
            </button>
          ) : null}
          {currentGroup && currentItem ? <span className="hidden text-stone-300 sm:inline dark:text-stone-700">/</span> : null}
          <h1 className="display-font min-w-0 truncate text-[15px] font-bold tracking-tight">
            {currentItem?.label ?? t(SEARCH_TABS[activeTab].labelKey)}
          </h1>

          <div className="ml-auto flex flex-none items-center gap-1">
            <NotificationBell />

            <button
              type="button"
              onClick={() => {
                if (proxyEnabled) toggleProxy();
                else setProxyConfirmOpen(true);
              }}
              disabled={proxyLoading}
              aria-label={t('nav:proxy.enableTitle')}
              title={proxyEnabled ? t('nav:proxy.enableTitle') : t('nav:proxy.disableTitle')}
              className={clsx(
                'grid h-[34px] w-[34px] place-items-center rounded-lg transition-colors',
                proxyEnabled
                  ? 'text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/20'
                  : proxyStatus === 'error'
                    ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
              )}
            >
              {proxyEnabled ? <ShieldCheck className="h-4 w-4" /> : proxyStatus === 'error' ? <ShieldAlert className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
            </button>

            <a
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('nav:downloadApp')}
              title={t('nav:downloadApp')}
              className="grid h-[34px] w-[34px] place-items-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            >
              <Download className="h-4 w-4" />
            </a>

            <LanguageSwitcher triggerClassName="grid h-[34px] w-[34px] place-items-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100" />

            <DropdownMenu
              trigger={
                <button
                  type="button"
                  aria-label={t('nav:mobileMore.open')}
                  className="grid h-[34px] w-[34px] place-items-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
              items={[
                { id: 'help', label: t('nav:mobileMore.help'), icon: <HelpCircle className="h-4 w-4" />, onClick: () => navigate('/help') },
                { id: 'github', label: t('nav:mobileMore.github'), icon: <Github className="h-4 w-4" />, onClick: () => window.open('https://github.com/Zoroaaa/Atlas', '_blank', 'noopener,noreferrer') },
              ]}
              triggerMode="click"
              align="right"
              showArrow={false}
            />

            <UserAccountMenu isAuthenticated={Boolean(user)} user={user} isAdmin={isAdmin} />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <Modal
        isOpen={proxyConfirmOpen}
        onClose={() => setProxyConfirmOpen(false)}
        title={t('nav:proxyConfirm.title')}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 dark:border-amber-800/30 dark:from-amber-900/20 dark:to-orange-900/20">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{t('nav:proxyConfirm.description')}</p>
              <ul className="ml-4 list-disc space-y-1 text-xs text-stone-600 dark:text-stone-400">
                <li>{t('nav:proxyConfirm.items.jav')}</li>
                <li>{t('nav:proxyConfirm.items.anime')}</li>
                <li>{t('nav:proxyConfirm.items.movie')}</li>
                <li>{t('nav:proxyConfirm.items.manga')}</li>
                <li>{t('nav:proxyConfirm.items.favorites')}</li>
              </ul>
            </div>
          </div>
          <p className="text-center text-xs text-stone-500 dark:text-stone-400">{t('nav:proxyConfirm.purpose')}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setProxyConfirmOpen(false)}
              className="flex-1 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {t('nav:proxyConfirm.cancel')}
            </button>
            <button
              type="button"
              onClick={() => { setProxyConfirmOpen(false); toggleProxy(); }}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-500/25 transition-all hover:from-amber-600 hover:to-orange-600"
            >
              {t('nav:proxyConfirm.confirm')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

function CompassIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2z" /></svg>;
}
function FileTextIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>;
}
