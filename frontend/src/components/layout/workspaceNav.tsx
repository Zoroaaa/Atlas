import React from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bell,
  Bug,
  Compass,
  Database,
  FileText,
  FolderTree,
  Heart,
  History,
  Languages,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquarePlus,
  Rss,
  Server,
  Settings,
  Tag,
  Trash2,
  TrendingUp,
  Trophy,
  User,
  UserCheck,
  Users,
} from 'lucide-react';

export type WorkspaceId = 'search' | 'community' | 'dashboard' | 'admin';

export interface WorkspaceNavItem {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
  path: string;
}

export interface WorkspaceNavGroup {
  id: string;
  labelKey?: string;
  items: WorkspaceNavItem[];
}

export const WORKSPACE_META: Record<WorkspaceId, { labelKey: string; path: string; icon: React.ReactNode }> = {
  search: { labelKey: 'nav:workspace.search', path: '/main', icon: <Compass className="h-4 w-4" /> },
  community: { labelKey: 'nav:workspace.community', path: '/community', icon: <Users className="h-4 w-4" /> },
  dashboard: { labelKey: 'nav:workspace.dashboard', path: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  admin: { labelKey: 'nav:workspace.admin', path: '/admin-panel', icon: <ShieldIcon /> },
};

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v6c0 4.4 3 8.4 7 9 4-.6 7-4.6 7-9V6l-7-3z" /></svg>;
}

export const communityNavGroups: WorkspaceNavGroup[] = [
  {
    id: 'community',
    labelKey: 'nav:community.groupHeading',
    items: [
      { id: 'browse', labelKey: 'nav:community.items.browse', icon: <Compass className="h-[17px] w-[17px]" />, path: '/community' },
      { id: 'my-posts', labelKey: 'nav:community.items.myPosts', icon: <FileText className="h-[17px] w-[17px]" />, path: '/community/my-shares' },
      { id: 'my-favorites', labelKey: 'nav:community.items.myFavorites', icon: <Heart className="h-[17px] w-[17px]" />, path: '/community/my-favorites' },
      { id: 'tags', labelKey: 'nav:community.items.tags', icon: <Tag className="h-[17px] w-[17px]" />, path: '/community/tags' },
    ],
  },
];

export const dashboardNavGroups: WorkspaceNavGroup[] = [
  {
    id: 'personal',
    labelKey: 'nav:dashboard.groups.personal',
    items: [
      { id: 'overview', labelKey: 'nav:dashboard.items.overview', icon: <LayoutDashboard className="h-[17px] w-[17px]" />, path: '/dashboard' },
      { id: 'stats', labelKey: 'nav:dashboard.items.stats', icon: <BarChart2 className="h-[17px] w-[17px]" />, path: '/dashboard/stats' },
      { id: 'favorites', labelKey: 'nav:dashboard.items.favorites', icon: <Heart className="h-[17px] w-[17px]" />, path: '/dashboard/favorites' },
      { id: 'history', labelKey: 'nav:dashboard.items.history', icon: <History className="h-[17px] w-[17px]" />, path: '/dashboard/history' },
      { id: 'follows', labelKey: 'nav:dashboard.items.follows', icon: <UserCheck className="h-[17px] w-[17px]" />, path: '/dashboard/follows' },
      { id: 'follow-feed', labelKey: 'nav:dashboard.items.followFeed', icon: <Rss className="h-[17px] w-[17px]" />, path: '/dashboard/follow-feed' },
      { id: 'notifications', labelKey: 'nav:dashboard.items.notifications', icon: <Bell className="h-[17px] w-[17px]" />, path: '/dashboard/notifications' },
      { id: 'activities', labelKey: 'nav:dashboard.items.activities', icon: <Activity className="h-[17px] w-[17px]" />, path: '/dashboard/activities' },
    ],
  },
  {
    id: 'resources',
    labelKey: 'nav:dashboard.groups.resources',
    items: [
      { id: 'sources', labelKey: 'nav:dashboard.items.sources', icon: <Database className="h-[17px] w-[17px]" />, path: '/dashboard/sources' },
      { id: 'categories', labelKey: 'nav:dashboard.items.categories', icon: <FolderTree className="h-[17px] w-[17px]" />, path: '/dashboard/categories' },
    ],
  },
  {
    id: 'account',
    labelKey: 'nav:dashboard.groups.account',
    items: [
      { id: 'profile', labelKey: 'nav:userMenu.profile', icon: <User className="h-[17px] w-[17px]" />, path: '/me' },
      { id: 'settings', labelKey: 'nav:userMenu.settings', icon: <Settings className="h-[17px] w-[17px]" />, path: '/settings' },
    ],
  },
];

export const adminNavGroups: WorkspaceNavGroup[] = [
  {
    id: 'admin',
    labelKey: 'nav:adminPanel.groupHeading',
    items: [
      { id: 'overview', labelKey: 'nav:adminPanel.items.overview', icon: <LayoutDashboard className="h-[17px] w-[17px]" />, path: '/admin-panel' },
      { id: 'users', labelKey: 'nav:adminPanel.items.users', icon: <Users className="h-[17px] w-[17px]" />, path: '/admin-panel/users' },
      { id: 'sessions', labelKey: 'nav:adminPanel.items.sessions', icon: <Server className="h-[17px] w-[17px]" />, path: '/admin-panel/sessions' },
      { id: 'actions', labelKey: 'nav:adminPanel.items.actions', icon: <Activity className="h-[17px] w-[17px]" />, path: '/admin-panel/actions' },
      { id: 'email-logs', labelKey: 'nav:adminPanel.items.emailLogs', icon: <Mail className="h-[17px] w-[17px]" />, path: '/admin-panel/email-logs' },
      { id: 'analytics', labelKey: 'nav:adminPanel.items.analytics', icon: <BarChart2 className="h-[17px] w-[17px]" />, path: '/admin-panel/analytics' },
      { id: 'observability', labelKey: 'nav:adminPanel.items.observability', icon: <Bug className="h-[17px] w-[17px]" />, path: '/admin-panel/observability' },
      { id: 'trends', labelKey: 'nav:adminPanel.items.trends', icon: <TrendingUp className="h-[17px] w-[17px]" />, path: '/admin-panel/trends' },
      { id: 'activity-ranking', labelKey: 'nav:adminPanel.items.activityRanking', icon: <Trophy className="h-[17px] w-[17px]" />, path: '/admin-panel/activity-ranking' },
      { id: 'data-storage', labelKey: 'nav:adminPanel.items.dataStorage', icon: <Database className="h-[17px] w-[17px]" />, path: '/admin-panel/data-storage' },
      { id: 'rankings-archive', labelKey: 'nav:adminPanel.items.rankingsArchive', icon: <Trophy className="h-[17px] w-[17px]" />, path: '/admin-panel/rankings-archive' },
      { id: 'aliases', labelKey: 'nav:adminPanel.items.aliases', icon: <Languages className="h-[17px] w-[17px]" />, path: '/admin-panel/aliases' },
      { id: 'reports', labelKey: 'nav:adminPanel.items.reports', icon: <AlertTriangle className="h-[17px] w-[17px]" />, path: '/admin-panel/reports' },
      { id: 'roles', labelKey: 'nav:adminPanel.items.roles', icon: <ShieldIcon />, path: '/admin-panel/roles' },
      { id: 'config', labelKey: 'nav:adminPanel.items.config', icon: <SettingsIcon />, path: '/admin-panel/config' },
      { id: 'cleanup', labelKey: 'nav:adminPanel.items.cleanup', icon: <Trash2 className="h-[17px] w-[17px]" />, path: '/admin-panel/cleanup' },
      { id: 'feedback', labelKey: 'nav:adminPanel.items.feedback', icon: <MessageSquarePlus className="h-[17px] w-[17px]" />, path: '/admin-panel/feedback' },
      { id: 'announcements', labelKey: 'nav:adminPanel.items.announcements', icon: <Megaphone className="h-[17px] w-[17px]" />, path: '/admin-panel/announcements' },
    ],
  },
];

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
}

/** 各工作区侧栏项的 active 判断：首页同时匹配默认子路由。 */
export const isNavItemActive = (path: string, pathname: string): boolean => {
  if (path === '/main') return pathname === '/main';
  if (path === '/community') return pathname === '/community' || pathname.startsWith('/community/browse');
  if (path === '/admin-panel') return pathname === '/admin-panel' || pathname.startsWith('/admin-panel/overview');
  if (path === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/overview');
  return pathname === path || pathname.startsWith(`${path}/`);
};

export const navGroupsForWorkspace = (workspace: WorkspaceId): WorkspaceNavGroup[] => {
  switch (workspace) {
    case 'community': return communityNavGroups;
    case 'dashboard': return dashboardNavGroups;
    case 'admin': return adminNavGroups;
    default: return [];
  }
};
