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
  FolderOpen,
  FolderTree,
  Heart,
  History,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  ListChecks,
  Mail,
  Megaphone,
  MessageSquarePlus,
  Rss,
  Server,
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

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v6c0 4.4 3 8.4 7 9 4-.6 7-4.6 7-9V6l-7-3z" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
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
    id: 'overview',
    labelKey: 'nav:dashboard.sections.overview',
    items: [
      { id: 'overview', labelKey: 'nav:dashboard.items.overview', icon: <LayoutDashboard className="h-[17px] w-[17px]" />, path: '/dashboard' },
      { id: 'stats', labelKey: 'nav:dashboard.items.stats', icon: <BarChart2 className="h-[17px] w-[17px]" />, path: '/dashboard/stats' },
    ],
  },
  {
    id: 'library',
    labelKey: 'nav:dashboard.sections.library',
    items: [
      { id: 'follow-feed', labelKey: 'nav:dashboard.items.followFeed', icon: <Rss className="h-[17px] w-[17px]" />, path: '/dashboard/follow-feed' },
      { id: 'follows', labelKey: 'nav:dashboard.items.follows', icon: <UserCheck className="h-[17px] w-[17px]" />, path: '/dashboard/follows' },
      { id: 'favorites', labelKey: 'nav:dashboard.items.favorites', icon: <Heart className="h-[17px] w-[17px]" />, path: '/dashboard/favorites' },
      { id: 'history', labelKey: 'nav:dashboard.items.history', icon: <History className="h-[17px] w-[17px]" />, path: '/dashboard/history' },
    ],
  },
  {
    id: 'messages',
    labelKey: 'nav:dashboard.sections.messages',
    items: [
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
      { id: 'settings', labelKey: 'nav:userMenu.settings', icon: <SettingsIcon />, path: '/settings' },
    ],
  },
];

export const adminNavGroups: WorkspaceNavGroup[] = [
  {
    id: 'overview',
    labelKey: 'nav:adminSections.overview',
    items: [
      { id: 'overview', labelKey: 'nav:adminPanel.items.overview', icon: <LayoutDashboard className="h-[17px] w-[17px]" />, path: '/admin-panel' },
    ],
  },
  {
    id: 'users',
    labelKey: 'nav:adminSections.users',
    items: [
      { id: 'users', labelKey: 'nav:adminPanel.items.users', icon: <Users className="h-[17px] w-[17px]" />, path: '/admin-panel/users' },
      { id: 'sessions', labelKey: 'nav:adminPanel.items.sessions', icon: <Server className="h-[17px] w-[17px]" />, path: '/admin-panel/sessions' },
      { id: 'roles', labelKey: 'nav:adminPanel.items.roles', icon: <ShieldIcon />, path: '/admin-panel/roles' },
    ],
  },
  {
    id: 'content',
    labelKey: 'nav:adminSections.content',
    items: [
      { id: 'reports', labelKey: 'nav:adminPanel.items.reports', icon: <AlertTriangle className="h-[17px] w-[17px]" />, path: '/admin-panel/reports' },
      { id: 'feedback', labelKey: 'nav:adminPanel.items.feedback', icon: <MessageSquarePlus className="h-[17px] w-[17px]" />, path: '/admin-panel/feedback' },
      { id: 'announcements', labelKey: 'nav:adminPanel.items.announcements', icon: <Megaphone className="h-[17px] w-[17px]" />, path: '/admin-panel/announcements' },
      { id: 'aliases', labelKey: 'nav:adminPanel.items.aliases', icon: <Languages className="h-[17px] w-[17px]" />, path: '/admin-panel/aliases' },
    ],
  },
  {
    id: 'data',
    labelKey: 'nav:adminSections.data',
    items: [
      { id: 'analytics', labelKey: 'nav:adminPanel.items.analytics', icon: <BarChart2 className="h-[17px] w-[17px]" />, path: '/admin-panel/analytics' },
      { id: 'trends', labelKey: 'nav:adminPanel.items.trends', icon: <TrendingUp className="h-[17px] w-[17px]" />, path: '/admin-panel/trends' },
      { id: 'activity-ranking', labelKey: 'nav:adminPanel.items.activityRanking', icon: <Trophy className="h-[17px] w-[17px]" />, path: '/admin-panel/activity-ranking' },
      { id: 'rankings-archive', labelKey: 'nav:adminPanel.items.rankingsArchive', icon: <Trophy className="h-[17px] w-[17px]" />, path: '/admin-panel/rankings-archive' },
      { id: 'cleanup', labelKey: 'nav:adminPanel.items.cleanup', icon: <Trash2 className="h-[17px] w-[17px]" />, path: '/admin-panel/cleanup' },
    ],
  },
  {
    id: 'storage',
    labelKey: 'nav:adminSections.storage',
    items: [
      { id: 'storage-overview', labelKey: 'nav:adminPanel.items.dataStorageOverview', icon: <Database className="h-[17px] w-[17px]" />, path: '/admin-panel/data-storage' },
      { id: 'storage-detail', labelKey: 'nav:adminPanel.items.dataStorageDetail', icon: <ListChecks className="h-[17px] w-[17px]" />, path: '/admin-panel/data-storage/detail' },
      { id: 'storage-covers', labelKey: 'nav:adminPanel.items.dataStorageCovers', icon: <ImageIcon className="h-[17px] w-[17px]" />, path: '/admin-panel/data-storage/covers' },
      { id: 'storage-records', labelKey: 'nav:adminPanel.items.dataStorageRecords', icon: <FolderOpen className="h-[17px] w-[17px]" />, path: '/admin-panel/data-storage/records' },
    ],
  },
  {
    id: 'system',
    labelKey: 'nav:adminSections.system',
    items: [
      { id: 'actions', labelKey: 'nav:adminPanel.items.actions', icon: <Activity className="h-[17px] w-[17px]" />, path: '/admin-panel/actions' },
      { id: 'email-logs', labelKey: 'nav:adminPanel.items.emailLogs', icon: <Mail className="h-[17px] w-[17px]" />, path: '/admin-panel/email-logs' },
      { id: 'observability', labelKey: 'nav:adminPanel.items.observability', icon: <Bug className="h-[17px] w-[17px]" />, path: '/admin-panel/observability' },
      { id: 'config', labelKey: 'nav:adminPanel.items.config', icon: <SettingsIcon />, path: '/admin-panel/config' },
    ],
  },
];

/** 各工作区侧栏项的 active 判断：首页同时匹配默认子路由。 */
export const isNavItemActive = (path: string, pathname: string): boolean => {
  if (path === '/main') return pathname === '/main';
  if (path === '/community') return pathname === '/community' || pathname.startsWith('/community/browse');
  if (path === '/admin-panel') return pathname === '/admin-panel' || pathname.startsWith('/admin-panel/overview');
  // 数据存储的统计概览是索引页，不能被 /data-storage/detail 等子页抢占
  if (path === '/admin-panel/data-storage') return pathname.replace(/\/+$/, '') === path;
  if (path === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/overview');
  return pathname === path || pathname.startsWith(`${path}/`);
};
