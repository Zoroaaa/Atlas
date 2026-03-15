import React, { useState, useEffect } from 'react';
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

type TabType = 'users' | 'sessions' | 'actions' | 'analytics' | 'trends' | 'reports' | 'roles' | 'config' | 'cleanup' | 'feedback';

export const AdminManager: React.FC = () => {
  const location = useLocation();

  const getTabFromPath = (): TabType => {
    const p = location.pathname;
    if (p.includes('/sessions')) return 'sessions';
    if (p.includes('/actions')) return 'actions';
    if (p.includes('/analytics')) return 'analytics';
    if (p.includes('/trends')) return 'trends';
    if (p.includes('/reports')) return 'reports';
    if (p.includes('/roles')) return 'roles';
    if (p.includes('/config')) return 'config';
    if (p.includes('/cleanup')) return 'cleanup';
    if (p.includes('/feedback')) return 'feedback';
    return 'users';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getTabFromPath);
  useEffect(() => { setActiveTab(getTabFromPath()); }, [location.pathname]);

  return (
    <div className="space-y-6">
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'sessions' && <SessionsTab />}
      {activeTab === 'actions' && <ActionsTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'trends' && <TrendsTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'config' && <ConfigTab />}
      {activeTab === 'cleanup' && <CleanupTab />}
      {activeTab === 'feedback' && <FeedbackTab />}
    </div>
  );
};
