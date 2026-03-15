import React, { useEffect, useState } from 'react';
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

interface Activity {
  id: string;
  action: string;
  actionLabel: string;
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

const actionColors: Record<string, { bg: string; text: string; icon: string }> = {
  login: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: '✓' },
  login_failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: '✗' },
  logout: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-400', icon: '→' },
  search: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: '🔍' },
  add_favorite: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-400', icon: '♥' },
  remove_favorite: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-400', icon: '♡' },
  sync_favorites: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', icon: '↻' },
  update_settings: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', icon: '⚙' },
  change_password: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: '🔒' },
  change_email: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-400', icon: '✉' },
  clear_search_history: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-400', icon: '🗑' },
  share_source: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: '↗' },
  review_source: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', icon: '★' },
  report_source: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', icon: '⚠' },
};

const actionFilterOptions = [
  { value: '', label: '全部活动' },
  { value: 'login', label: '登录' },
  { value: 'login_failed', label: '登录失败' },
  { value: 'search', label: '搜索' },
  { value: 'add_favorite', label: '添加收藏' },
  { value: 'remove_favorite', label: '取消收藏' },
  { value: 'update_settings', label: '更新设置' },
];

export const UserActivitiesPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const limit = 20;

  const fetchData = async () => {
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
  };

  useEffect(() => {
    fetchData();
  }, [offset, actionFilter]);

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">我的活动记录</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">查看您最近的操作历史</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.total}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">总活动</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.summary.logins}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">本月登录</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.summary.thisWeekLogins}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">本周登录</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.summary.failedLogins}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">登录失败</p>
          </Card>
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setOffset(0);
            }}
            className="flex-1 sm:flex-none px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            title="暂无活动记录"
            description="您还没有任何活动记录"
          />
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {Object.entries(groupedActivities).map(([date, dateActivities]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{date}</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>
                <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dateActivities.map((activity) => {
                    const colorStyle = actionColors[activity.action] || { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-400', icon: '•' };
                    return (
                      <div key={activity.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={clsx(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                            colorStyle.bg,
                            colorStyle.text
                          )}>
                            {colorStyle.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={clsx('font-medium', colorStyle.text)}>
                                {activity.actionLabel}
                              </p>
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(activity.createdAt)}
                              </span>
                            </div>
                            {activity.data && Object.keys(activity.data).length > 0 && (
                              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
                                {Object.entries(activity.data).slice(0, 2).map(([key, value]) => (
                                  <span key={key} className="mr-3">
                                    {key}: {String(value).slice(0, 30)}
                                  </span>
                                ))}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
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
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  共 {total} 条记录，第 {currentPage}/{totalPages} 页
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevPage}
                    disabled={offset === 0}
                    className={clsx(
                      'p-2 rounded-xl transition-colors',
                      offset === 0
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    )}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={offset + limit >= total}
                    className={clsx(
                      'p-2 rounded-xl transition-colors',
                      offset + limit >= total
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
