import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Users,
  UserCheck,
  UserPlus,
  Activity,
  Server,
  Database,
  Search,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { adminApi } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useTranslation } from 'react-i18next';
import { resolveActionLabel, actionColors } from './shared';

interface DashboardOverview {
  users: {
    total: number;
    active: number;
    newToday: number;
    newWeek: number;
    newMonth: number;
    activeToday: number;
  };
  sessions: {
    total: number;
    active: number;
    uniqueUsers: number;
  };
  actions: {
    total: number;
    uniqueUsers: number;
    today: number;
    week: number;
  };
  analytics: {
    total: number;
    uniqueUsers: number;
    uniqueSessions: number;
    today: number;
    week: number;
  };
  sources: {
    total: number;
    active: number;
    totalUsage: number;
  };
  searches: {
    total: number;
    uniqueUsers: number;
    today: number;
    week: number;
  };
  logins: {
    successToday: number;
    failedToday: number;
  };
  community: {
    posts: number;
    reviews: number;
    pendingReports: number;
  };
  recentActions: Array<{
    action: string;
    data: Record<string, unknown>;
    createdAt: number;
    username: string;
  }>;
}

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  color: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'teal';
}

const colorClasses = {
  blue: 'from-[#d4a853] to-[#f59e0b]',
  green: 'from-green-500 to-green-600',
  red: 'from-red-500 to-red-600',
  purple: 'from-rose-500 to-rose-600',
  orange: 'from-orange-500 to-orange-600',
  teal: 'from-teal-500 to-teal-600',
};

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, trend, trendLabel, color }) => (
  <Card className="p-5 hover:shadow-lg transition-shadow">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">{title}</p>
        <p className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {subtitle && (
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">{subtitle}</p>
        )}
        {trend !== undefined && (
          <div className={clsx(
            'flex items-center gap-1 mt-2 text-xs font-medium',
            trend >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{Math.abs(trend)}%</span>
            {trendLabel && <span className="text-stone-400">{trendLabel}</span>}
          </div>
        )}
      </div>
      <div className={clsx(
        'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md',
        colorClasses[color]
      )}>
        {icon}
      </div>
    </div>
  </Card>
);

export const AdminPanelOverview: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getDashboardOverview();
      if (response) {
        setData(response);
      } else {
        setError(t('admin:overview.fetchFailed'));
      }
    } catch (err) {
      setError(t('admin:overview.networkError'));
      console.error('Fetch overview error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loading size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <p className="text-stone-600 dark:text-stone-400">{error || t('admin:overview.noData')}</p>
        <button
          onClick={fetchOverview}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('admin:overview.reload')}
        </button>
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('admin:overview.time.justNow');
    if (minutes < 60) return t('admin:overview.time.minutesAgo', { count: minutes });
    if (hours < 24) return t('admin:overview.time.hoursAgo', { count: hours });
    if (days < 7) return t('admin:overview.time.daysAgo', { count: days });
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">{t('admin:overview.title')}</h1>
          <p className="text-stone-500 dark:text-stone-400 mt-1">{t('admin:overview.subtitle')}</p>
        </div>
        <button
          onClick={fetchOverview}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('admin:overview.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('admin:overview.stat.totalUsers')}
          value={data.users.total}
          subtitle={t('admin:overview.stat.activeUsers', { count: data.users.active })}
          icon={<Users className="w-6 h-6 text-white" />}
          color="blue"
        />
        <StatCard
          title={t('admin:overview.stat.newToday')}
          value={data.users.newToday}
          subtitle={t('admin:overview.stat.newTodaySub')}
          icon={<UserPlus className="w-6 h-6 text-white" />}
          color="green"
        />
        <StatCard
          title={t('admin:overview.stat.activeToday')}
          value={data.users.activeToday}
          subtitle={t('admin:overview.stat.activeTodaySub')}
          icon={<UserCheck className="w-6 h-6 text-white" />}
          color="teal"
        />
        <StatCard
          title={t('admin:overview.stat.activeSessions')}
          value={data.sessions.active}
          subtitle={t('admin:overview.stat.uniqueUsers', { count: data.sessions.uniqueUsers })}
          icon={<Server className="w-6 h-6 text-white" />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('admin:overview.stat.actionsToday')}
          value={data.actions.today}
          subtitle={t('admin:overview.stat.actionsTodaySub')}
          icon={<Activity className="w-6 h-6 text-white" />}
          color="orange"
        />
        <StatCard
          title={t('admin:overview.stat.searchesToday')}
          value={data.searches.today}
          subtitle={t('admin:overview.stat.searchesTodaySub')}
          icon={<Search className="w-6 h-6 text-white" />}
          color="blue"
        />
        <StatCard
          title={t('admin:overview.stat.sources')}
          value={data.sources.active}
          subtitle={t('admin:overview.stat.sourcesTotal', { count: data.sources.total })}
          icon={<Database className="w-6 h-6 text-white" />}
          color="teal"
        />
        <StatCard
          title={t('admin:overview.stat.analyticsToday')}
          value={data.analytics.today}
          subtitle={t('admin:overview.stat.analyticsTodaySub')}
          icon={<BarChart2 className="w-6 h-6 text-white" />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{t('admin:overview.loginStats.title')}</h2>
            <span className="text-xs text-stone-400">{t('admin:overview.loginStats.today')}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{data.logins.successToday}</p>
                  <p className="text-sm text-green-600/70 dark:text-green-400/70">{t('admin:overview.loginStats.success')}</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{data.logins.failedToday}</p>
                  <p className="text-sm text-red-600/70 dark:text-red-400/70">{t('admin:overview.loginStats.failed')}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{t('admin:overview.communityStats.title')}</h2>
            <Link to="/admin-panel/reports" className="text-xs text-amber-500 hover:text-amber-600">{t('admin:overview.communityStats.viewDetail')}</Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50">
              <span className="text-sm text-stone-600 dark:text-stone-400">{t('admin:overview.communityStats.posts')}</span>
              <span className="font-semibold text-stone-900 dark:text-stone-100">{data.community.posts}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50">
              <span className="text-sm text-stone-600 dark:text-stone-400">{t('admin:overview.communityStats.reviews')}</span>
              <span className="font-semibold text-stone-900 dark:text-stone-100">{data.community.reviews}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20">
              <span className="text-sm text-orange-600 dark:text-orange-400">{t('admin:overview.communityStats.pendingReports')}</span>
              <span className="font-semibold text-orange-600 dark:text-orange-400">{data.community.pendingReports}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{t('admin:overview.recentActivity.title')}</h2>
          <Link to="/admin-panel/actions" className="text-xs text-amber-500 hover:text-amber-600">{t('admin:overview.recentActivity.viewAll')}</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="text-left py-3 px-4 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">{t('admin:overview.recentActivity.colUser')}</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">{t('admin:overview.recentActivity.colAction')}</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">{t('admin:overview.recentActivity.colDetail')}</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">{t('admin:overview.recentActivity.colTime')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {data.recentActions.slice(0, 10).map((action, index) => (
                <tr key={index} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-medium text-stone-900 dark:text-stone-100">{action.username}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={clsx(
                      'inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium',
                      actionColors[action.action] || 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400'
                    )}>
                      {resolveActionLabel(action.action)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-stone-500 dark:text-stone-400 truncate max-w-xs block">
                      {action.data && Object.keys(action.data).length > 0
                        ? JSON.stringify(action.data).slice(0, 50) + '...'
                        : '-'
                      }
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-sm text-stone-400 dark:text-stone-500 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(action.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
