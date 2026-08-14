import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { UsersTab } from './UsersTab';
import { SessionsTab } from './SessionsTab';
import { ActionsTab } from './ActionsTab';
import { AnalyticsTab } from './AnalyticsTab';
import { TrendsTab } from './TrendsTab';
import { ReportsTab } from './ReportsTab';
import { RolesTab } from './RolesTab';
import { CleanupTab } from './CleanupTab';
import { ConfigTab } from './ConfigTab';
import { FeedbackTab } from './FeedbackTab';
import { AnnouncementTab } from './AnnouncementTab';
import { ObservabilityTab } from './ObservabilityTab';
import { DataStorageTab } from './DataStorageTab';

type TabType = 'users' | 'sessions' | 'actions' | 'analytics' | 'observability' | 'trends' | 'reports' | 'roles' | 'config' | 'cleanup' | 'feedback' | 'announcements' | 'data-storage';

export const AdminManager: React.FC = () => {
  const location = useLocation();

  const getTabFromPath = useCallback((): TabType => {
    const p = location.pathname;
    if (p.includes('/sessions')) return 'sessions';
    if (p.includes('/actions')) return 'actions';
    if (p.includes('/analytics')) return 'analytics';
    if (p.includes('/observability')) return 'observability';
    if (p.includes('/trends')) return 'trends';
    if (p.includes('/reports')) return 'reports';
    if (p.includes('/roles')) return 'roles';
    if (p.includes('/config')) return 'config';
    if (p.includes('/cleanup')) return 'cleanup';
    if (p.includes('/feedback')) return 'feedback';
    if (p.includes('/announcements')) return 'announcements';
    if (p.includes('/data-storage')) return 'data-storage';
    return 'users';
  }, [location.pathname]);

  const [activeTab, setActiveTab] = useState<TabType>(getTabFromPath);
  useEffect(() => { setActiveTab(getTabFromPath()); }, [location.pathname, getTabFromPath]);

  return (
    <div className="space-y-6">
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'sessions' && <SessionsTab />}
      {activeTab === 'actions' && <ActionsTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'observability' && <ObservabilityTab />}
      {activeTab === 'trends' && <TrendsTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'config' && <ConfigTab />}
      {activeTab === 'cleanup' && <CleanupTab />}
      {activeTab === 'feedback' && <FeedbackTab />}
      {activeTab === 'announcements' && <AnnouncementTab />}
      {activeTab === 'data-storage' && <DataStorageTab />}
    </div>
  );
};
