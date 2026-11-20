import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { OverviewManager } from './OverviewManager';
import { SourceManager } from './SourceManager';
import { FavoritesManager, HistoryManager } from './FavoritesHistoryManager';
import { StatsManager } from './StatsManager';
import { FollowsManager } from './FollowsManager';
import { FollowFeedManager } from './FollowFeedManager';
import { NotificationsManager } from './NotificationsManager';

export const DashboardPage: React.FC = () => {
  const location = useLocation();
  const path = location.pathname;

  if (path === '/dashboard' || path === '/dashboard/' || path.startsWith('/dashboard/overview')) {
    return <OverviewManager />;
  }
  
  if (path.startsWith('/dashboard/stats')) {
    return <StatsManager />;
  }
  
  if (path.startsWith('/dashboard/sources')) {
    return <SourceManager />;
  }
  
  // 旧的分类管理入口已并入个人源站页；管理员系统分类在 /admin-panel/sources
  if (path.startsWith('/dashboard/categories')) {
    return <Navigate to="/dashboard/sources" replace />;
  }
  
  if (path.startsWith('/dashboard/favorites')) {
    return <FavoritesManager />;
  }
  
  if (path.startsWith('/dashboard/history')) {
    return <HistoryManager />;
  }
  
  if (path.startsWith('/dashboard/follow-feed')) {
    return <FollowFeedManager />;
  }

  if (path.startsWith('/dashboard/follows')) {
    return <FollowsManager />;
  }

  if (path.startsWith('/dashboard/notifications')) {
    return <NotificationsManager />;
  }

  return <OverviewManager />;
};
