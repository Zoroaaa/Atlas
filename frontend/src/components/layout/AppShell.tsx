/**
 * AppShell - 桌面端全局外壳
 *
 * 侧栏用「手风琴分组」承载全部导航：搜索 / 发现 / 我的 / 社区 / 管理看板。
 * 同一时间只展开一个分组，默认展开与当前路由匹配的分组；所有页面都在本壳层
 * 内容区渲染，不再切换第二套侧栏。移动端（<lg）直接返回 children。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Bell,
  BookOpen,
  BookText,
  ChevronDown,
  Clapperboard,
  Clock,
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
  Rss,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tags,
  Trophy,
  Tv,
  User,
  UserCheck,
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
import { isNavItemActive } from './workspaceNav';

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
        items: [
          { id: 'overview', label: t('nav:dashboard.items.overview'), icon: <LayoutIcon />, active: isNavItemActive('/dashboard', pathname), to: '/dashboard', sectionLabel: t('nav:dashboard.sections.overview') },
          { id: 'stats', label: t('nav:dashboard.items.stats'), icon: <BarChartIcon />, active: isNavItemActive('/dashboard/stats', pathname), to: '/dashboard/stats' },
          { id: 'follow-feed', label: t('nav:workspace.followFeed'), icon: <Rss className="h-[16px] w-[16px]" />, active: isNavItemActive('/dashboard/follow-feed', pathname), badge: follows?.unread ?? 0, to: '/dashboard/follow-feed', sectionLabel: t('nav:dashboard.sections.library') },
          { id: 'follows', label: t('nav:workspace.follows'), icon: <UserCheck className="h-[16px] w-[16px]" />, active: isNavItemActive('/dashboard/follows', pathname), to: '/dashboard/follows' },
          { id: 'favorites', label: t('search:favorites.title'), icon: <Heart className="h-[16px] w-[16px]" />, active: isNavItemActive('/dashboard/favorites', pathname), to: '/dashboard/favorites' },
          { id: 'history', label: t('search:history.title'), icon: <Clock className="h-[16px] w-[16px]" />, active: isNavItemActive('/dashboard/history', pathname), to: '/dashboard/history' },
          { id: 'notifications', label: t('nav:workspace.notifications'), icon: <Bell className="h-[16px] w-[16px]" />, active: isNavItemActive('/dashboard/notifications', pathname), badge: unreadNotifications, to: '/dashboard/notifications', sectionLabel: t('nav:dashboard.sections.messages') },
          { id: 'activities', label: t('nav:dashboard.items.activities'), icon: <ActivityIcon />, active: isNavItemActive('/dashboard/activities', pathname), to: '/dashboard/activities' },
          { id: 'sources', label: t('nav:dashboard.items.sources'), icon: <DatabaseIcon />, active: isNavItemActive('/dashboard/sources', pathname), to: '/dashboard/sources', sectionLabel: t('nav:dashboard.groups.resources') },
          ...(isAdmin ? [{ id: 'categories', label: t('nav:dashboard.items.categories'), icon: <FolderTreeIcon />, active: isNavItemActive('/dashboard/categories', pathname), to: '/dashboard/categories' }] : []),
          { id: 'profile', label: t('nav:userMenu.profile'), icon: <User className="h-[16px] w-[16px]" />, active: pathname === '/me', to: '/me', sectionLabel: t('nav:dashboard.groups.account') },
          { id: 'settings', label: t('nav:userMenu.settings'), icon: <SettingsIcon />, active: pathname === '/settings', to: '/settings' },
        ],
      },
    ];

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
      list.push({
        id: 'admin',
        label: t('nav:adminPanel.title'),
        icon: <Shield className="h-[16px] w-[16px]" />,
        items: [
          { id: 'overview', label: t('nav:adminPanel.items.overview'), icon: <LayoutIcon />, active: isNavItemActive('/admin-panel', pathname), to: '/admin-panel', sectionLabel: t('nav:adminSections.overview') },
          { id: 'users', label: t('nav:adminPanel.items.users'), icon: <Users className="h-[16px] w-[16px]" />, active: isNavItemActive('/admin-panel/users', pathname), to: '/admin-panel/users', sectionLabel: t('nav:adminSections.users') },
          { id: 'sessions', label: t('nav:adminPanel.items.sessions'), icon: <ServerIcon />, active: isNavItemActive('/admin-panel/sessions', pathname), to: '/admin-panel/sessions' },
          { id: 'roles', label: t('nav:adminPanel.items.roles'), icon: <Shield className="h-[16px] w-[16px]" />, active: isNavItemActive('/admin-panel/roles', pathname), to: '/admin-panel/roles' },
          { id: 'reports', label: t('nav:adminPanel.items.reports'), icon: <AlertIcon />, active: isNavItemActive('/admin-panel/reports', pathname), to: '/admin-panel/reports', sectionLabel: t('nav:adminSections.content') },
          { id: 'feedback', label: t('nav:adminPanel.items.feedback'), icon: <FeedbackIcon />, active: isNavItemActive('/admin-panel/feedback', pathname), to: '/admin-panel/feedback' },
          { id: 'announcements', label: t('nav:adminPanel.items.announcements'), icon: <MegaphoneIcon />, active: isNavItemActive('/admin-panel/announcements', pathname), to: '/admin-panel/announcements' },
          { id: 'aliases', label: t('nav:adminPanel.items.aliases'), icon: <LanguagesIcon />, active: isNavItemActive('/admin-panel/aliases', pathname), to: '/admin-panel/aliases' },
          { id: 'analytics', label: t('nav:adminPanel.items.analytics'), icon: <BarChartIcon />, active: isNavItemActive('/admin-panel/analytics', pathname), to: '/admin-panel/analytics', sectionLabel: t('nav:adminSections.data') },
          { id: 'trends', label: t('nav:adminPanel.items.trends'), icon: <TrendingIcon />, active: isNavItemActive('/admin-panel/trends', pathname), to: '/admin-panel/trends' },
          { id: 'activity-ranking', label: t('nav:adminPanel.items.activityRanking'), icon: <Trophy className="h-[16px] w-[16px]" />, active: isNavItemActive('/admin-panel/activity-ranking', pathname), to: '/admin-panel/activity-ranking' },
          { id: 'data-storage', label: t('nav:adminPanel.items.dataStorage'), icon: <DatabaseIcon />, active: isNavItemActive('/admin-panel/data-storage', pathname), to: '/admin-panel/data-storage' },
          { id: 'rankings-archive', label: t('nav:adminPanel.items.rankingsArchive'), icon: <Trophy className="h-[16px] w-[16px]" />, active: isNavItemActive('/admin-panel/rankings-archive', pathname), to: '/admin-panel/rankings-archive' },
          { id: 'cleanup', label: t('nav:adminPanel.items.cleanup'), icon: <TrashIcon />, active: isNavItemActive('/admin-panel/cleanup', pathname), to: '/admin-panel/cleanup' },
          { id: 'actions', label: t('nav:adminPanel.items.actions'), icon: <ActivityIcon />, active: isNavItemActive('/admin-panel/actions', pathname), to: '/admin-panel/actions', sectionLabel: t('nav:adminSections.system') },
          { id: 'email-logs', label: t('nav:adminPanel.items.emailLogs'), icon: <MailIcon />, active: isNavItemActive('/admin-panel/email-logs', pathname), to: '/admin-panel/email-logs' },
          { id: 'observability', label: t('nav:adminPanel.items.observability'), icon: <BugIcon />, active: isNavItemActive('/admin-panel/observability', pathname), to: '/admin-panel/observability' },
          { id: 'config', label: t('nav:adminPanel.items.config'), icon: <SettingsIcon />, active: isNavItemActive('/admin-panel/config', pathname), to: '/admin-panel/config' },
        ],
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
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
}
function LayoutIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>;
}
function ServerIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>;
}
function ActivityIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>;
}
function MailIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
}
function BarChartIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
}
function BugIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="7" width="8" height="12" rx="4" /><path d="M12 3v4M4 9h4M16 9h4M4 15h4M16 15h4M5 21l3-3M19 21l-3-3" /></svg>;
}
function TrendingIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
}
function FolderTreeIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>;
}
function DatabaseIcon() {  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
}
function LanguagesIcon() {  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h8M8 5c0 4-2 7-5 9M6 9c1 2 3 4 6 5" /><path d="m13 20 4-10 4 10M15 16h4" /></svg>;
}
function AlertIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4 2 21h20L12 4z" /><path d="M12 10v4M12 18h.01" /></svg>;
}
function TrashIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg>;
}
function FeedbackIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9z" /><path d="M8 9h8M8 13h5" /></svg>;
}
function MegaphoneIcon() {
  return <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15 8a4 4 0 0 1 0 8" /></svg>;
}
