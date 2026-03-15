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
    sharedSources: number;
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
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  red: 'from-red-500 to-red-600',
  purple: 'from-purple-500 to-purple-600',
  orange: 'from-orange-500 to-orange-600',
  teal: 'from-teal-500 to-teal-600',
};

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, trend, trendLabel, color }) => (
  <Card className="p-5 hover:shadow-lg transition-shadow">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {subtitle && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>
        )}
        {trend !== undefined && (
          <div className={clsx(
            'flex items-center gap-1 mt-2 text-xs font-medium',
            trend >= 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{Math.abs(trend)}%</span>
            {trendLabel && <span className="text-slate-400">{trendLabel}</span>}
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

const actionLabels: Record<string, string> = {
  login: '登录成功',
  login_failed: '登录失败',
  logout: '登出',
  search: '搜索',
  add_favorite: '添加收藏',
  remove_favorite: '取消收藏',
  sync_favorites: '同步收藏',
  update_settings: '更新设置',
  change_password: '修改密码',
  change_email: '修改邮箱',
  delete_account: '删除账户',
  clear_search_history: '清空搜索历史',
  share_source: '分享搜索源',
  review_source: '评价搜索源',
  report_source: '举报搜索源',
  admin_update_user_status: '管理员更新用户状态',
  admin_update_user_role: '管理员更新用户角色',
  admin_update_user_permissions: '管理员更新用户权限',
  admin_terminate_session: '管理员终止会话',
  admin_cleanup: '管理员清理数据',
  admin_handle_report: '管理员处理举报',
};

const actionColors: Record<string, string> = {
  login: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  login_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  logout: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
  search: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  add_favorite: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  remove_favorite: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
  admin_update_user_status: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  admin_update_user_role: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export const AdminPanelOverview: React.FC = () => {
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
        setError('获取数据失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
      console.error('Fetch overview error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
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
        <p className="text-slate-600 dark:text-slate-400">{error || '暂无数据'}</p>
        <button
          onClick={fetchOverview}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          重新加载
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

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">看板概览</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">实时监控系统运行状态</p>
        </div>
        <button
          onClick={fetchOverview}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新数据
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总用户数"
          value={data.users.total}
          subtitle={`${data.users.active} 活跃用户`}
          icon={<Users className="w-6 h-6 text-white" />}
          color="blue"
        />
        <StatCard
          title="今日新增"
          value={data.users.newToday}
          subtitle="新注册用户"
          icon={<UserPlus className="w-6 h-6 text-white" />}
          color="green"
        />
        <StatCard
          title="今日活跃"
          value={data.users.activeToday}
          subtitle="独立活跃用户"
          icon={<UserCheck className="w-6 h-6 text-white" />}
          color="teal"
        />
        <StatCard
          title="活跃会话"
          value={data.sessions.active}
          subtitle={`${data.sessions.uniqueUsers} 独立用户`}
          icon={<Server className="w-6 h-6 text-white" />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="今日行为"
          value={data.actions.today}
          subtitle="用户行为记录"
          icon={<Activity className="w-6 h-6 text-white" />}
          color="orange"
        />
        <StatCard
          title="今日搜索"
          value={data.searches.today}
          subtitle="搜索请求"
          icon={<Search className="w-6 h-6 text-white" />}
          color="blue"
        />
        <StatCard
          title="搜索源"
          value={data.sources.active}
          subtitle={`${data.sources.total} 总数`}
          icon={<Database className="w-6 h-6 text-white" />}
          color="teal"
        />
        <StatCard
          title="分析事件"
          value={data.analytics.today}
          subtitle="今日记录"
          icon={<BarChart2 className="w-6 h-6 text-white" />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">登录统计</h2>
            <span className="text-xs text-slate-400">今日</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{data.logins.successToday}</p>
                  <p className="text-sm text-green-600/70 dark:text-green-400/70">成功登录</p>
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
                  <p className="text-sm text-red-600/70 dark:text-red-400/70">登录失败</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">社区统计</h2>
            <Link to="/admin-panel/reports" className="text-xs text-blue-500 hover:text-blue-600">查看详情</Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <span className="text-sm text-slate-600 dark:text-slate-400">分享搜索源</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{data.community.sharedSources}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <span className="text-sm text-slate-600 dark:text-slate-400">用户评价</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{data.community.reviews}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20">
              <span className="text-sm text-orange-600 dark:text-orange-400">待处理举报</span>
              <span className="font-semibold text-orange-600 dark:text-orange-400">{data.community.pendingReports}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">最近活动</h2>
          <Link to="/admin-panel/actions" className="text-xs text-blue-500 hover:text-blue-600">查看全部</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">用户</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">行为</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">详情</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentActions.slice(0, 10).map((action, index) => (
                <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{action.username}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={clsx(
                      'inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium',
                      actionColors[action.action] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    )}>
                      {actionLabels[action.action] || action.action}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs block">
                      {action.data && Object.keys(action.data).length > 0 
                        ? JSON.stringify(action.data).slice(0, 50) + '...'
                        : '-'
                      }
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-sm text-slate-400 dark:text-slate-500 flex items-center justify-end gap-1">
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
