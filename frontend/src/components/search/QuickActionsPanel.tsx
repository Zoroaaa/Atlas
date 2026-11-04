import React from 'react';
import { Zap, Database, Settings, Globe, ShieldAlert, Link } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PanelSection, PanelHeader } from '@/components/workbench';

interface QuickActionsPanelProps {
  isAdmin: boolean;
  communityEnabled: boolean;
}

interface ActionItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  tone?: 'default' | 'danger';
}

/** 快捷入口：侧栏区段，2 列紧凑行，不再使用独立卡片。 */
export const QuickActionsPanel: React.FC<QuickActionsPanelProps> = ({ isAdmin, communityEnabled }) => {
  const { t } = useTranslation(['search']);
  const navigate = useNavigate();

  const actions: ActionItem[] = [
    { id: 'sources', label: t('search:quickActions.resources'), icon: <Link className="h-4 w-4" />, path: '/main?tab=sources' },
    { id: 'manage', label: t('search:quickActions.manageSources'), icon: <Database className="h-4 w-4" />, path: '/dashboard/sources' },
    { id: 'settings', label: t('search:quickActions.systemSettings'), icon: <Settings className="h-4 w-4" />, path: '/dashboard/settings' },
  ];

  if (communityEnabled) {
    actions.push({ id: 'community', label: t('search:quickActions.community'), icon: <Globe className="h-4 w-4" />, path: '/community' });
  }
  if (isAdmin) {
    actions.push({ id: 'admin', label: t('search:quickActions.adminPanel'), icon: <ShieldAlert className="h-4 w-4" />, path: '/admin-panel', tone: 'danger' });
  }

  return (
    <PanelSection>
      <PanelHeader icon={<Zap className="h-4 w-4" />} title={t('search:quickActions.titleVertical')} />
      <div className="grid grid-cols-1 gap-1.5 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => navigate(action.path)}
            className="flex h-10 items-center gap-2 rounded-lg px-3 text-left text-[12px] font-medium text-surface-600 transition-colors hover:bg-surface-50 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800/60 dark:hover:text-surface-100"
          >
            <span className={action.tone === 'danger' ? 'text-error-500' : 'text-surface-400'}>{action.icon}</span>
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>
    </PanelSection>
  );
};
