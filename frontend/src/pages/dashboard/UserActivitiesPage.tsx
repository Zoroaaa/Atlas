import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  Activity,
  Clock,
  Monitor,
  MapPin,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { userApi } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';
import { actionBadgeClass, actionEmoji, resolveActionLabel, userActionOptions } from '@/utils/userActions';

interface Activity {
  id: string;
  action: string;
  data: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: number;
}

interface ActivityStats {
  total: number;
  today: number;
  week: number;
  month: number;
  actionsByType: Array<{ action: string; count: number }>;
  summary: {
    logins: number;
    thisWeekLogins: number;
    lastWeekLogins: number;
    failedLogins: number;
  };
}

const actionOptions = userActionOptions.map((item) => ({ value: item.action, labelKey: item.labelKey }));

export const UserActivitiesPage: React.FC = () => {
  const { t } = useTranslation(['dashboard']);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const limit = 20;

  const actionFilterOptions = useMemo(
    () => [
      { value: '', label: t('dashboard:activities.filterAll') },
      ...actionOptions.map(opt => ({ value: opt.value, label: t(opt.labelKey) })),
    ],
    [t]
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [activitiesRes, statsRes] = await Promise.all([
        userApi.getActivities({ limit, offset, action: actionFilter || undefined }),
        userApi.getActivitiesStats(),
      ]);

      if (activitiesRes.success && activitiesRes.data) {
        setActivities(activitiesRes.data.activities);
        setTotal(activitiesRes.data.total);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch (err) {
      console.error('Fetch activities error:', err);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, actionFilter]);

  useEffect(() => {
    fetchData();
  }, [offset, actionFilter, fetchData]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const handlePrevPage = () => {
    if (offset > 0) {
      setOffset(offset - limit);
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  const groupedActivities = activities.reduce((groups, activity) => {
    const date = formatDate(activity.createdAt);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {} as Record<string, Activity[]>);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">{t('dashboard:activities.title')}</h1>
          <p className="text-stone-500 dark:text-stone-400 mt-1">{t('dashboard:activities.subtitle')}</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('dashboard:activities.refresh')}
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">{stats.total}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{t('dashboard:activities.statsTotal')}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.summary.logins}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{t('dashboard:activities.statsMonthlyLogins')}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.summary.thisWeekLogins}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{t('dashboard:activities.statsWeeklyLogins')}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.summary.failedLogins}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{t('dashboard:activities.statsFailedLogins')}</p>
          </Card>
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-stone-400" />
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setOffset(0);
            }}
            className="flex-1 sm:flex-none px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {actionFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loading size="lg" />
        </div>
      ) : activities.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<Activity className="w-12 h-12" />}
            title={t('dashboard:activities.emptyTitle')}
            description={t('dashboard:activities.emptyDesc')}
          />
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {Object.entries(groupedActivities).map(([date, dateActivities]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm font-semibold text-stone-600 dark:text-stone-400">{date}</span>
                  <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
                </div>
                <Card className="divide-y divide-stone-100 dark:divide-stone-800">
                  {dateActivities.map((activity) => {
                    return (
                      <div key={activity.id} className="p-4 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={clsx(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                            actionBadgeClass(activity.action)
                          )}>
                            {actionEmoji(activity.action)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-stone-900 dark:text-stone-100">
                                {resolveActionLabel(activity.action)}
                              </p>
                              <span className="text-xs text-stone-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(activity.createdAt)}
                              </span>
                            </div>
                            {activity.data && Object.keys(activity.data).length > 0 && (
                              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 truncate">
                                {Object.entries(activity.data).slice(0, 2).map(([key, value]) => (
                                  <span key={key} className="mr-3">
                                    {key}: {String(value).slice(0, 30)}
                                  </span>
                                ))}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-stone-400">
                              {activity.ipAddress && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {activity.ipAddress}
                                </span>
                              )}
                              {activity.userAgent && (
                                <span className="flex items-center gap-1 truncate max-w-xs">
                                  <Monitor className="w-3 h-3 flex-shrink-0" />
                                  {activity.userAgent.slice(0, 50)}...
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  {t('dashboard:activities.pagination', { total, current: currentPage, totalPages })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevPage}
                    disabled={offset === 0}
                    aria-label={t('dashboard:activities.prevPage')}
                    title={t('dashboard:activities.prevPage')}
                    className={clsx(
                      'p-2 rounded-xl transition-colors',
                      offset === 0
                        ? 'text-stone-300 dark:text-stone-600 cursor-not-allowed'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                    )}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={offset + limit >= total}
                    aria-label={t('dashboard:activities.nextPage')}
                    title={t('dashboard:activities.nextPage')}
                    className={clsx(
                      'p-2 rounded-xl transition-colors',
                      offset + limit >= total
                        ? 'text-stone-300 dark:text-stone-600 cursor-not-allowed'
                        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                    )}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
