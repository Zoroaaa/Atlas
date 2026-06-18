import React, { useEffect, useState, useCallback } from 'react';
import {
  Database,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Heart,
  Activity,
  Zap,
  Globe,
  RefreshCw,
  Sparkles,
  Award,
  Tag,
  Clock,
  LogIn,
} from 'lucide-react';
import { Card, Badge, Loading, Button } from '@/components/ui';
import { systemApi, userApi, sourceApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { useNavigate } from 'react-router-dom';
import { useFeatureFlags } from '@/contexts';
import type { FavoriteItem, SearchHistoryItem, SearchSource, UserSourceConfig } from '@/types';

const getUserLevel = (total: number) => {
  if (total < 10)  return { label: '新手',   color: 'from-slate-400 to-slate-500',   icon: '🌱', next: 10,  prev: 0   };
  if (total < 50)  return { label: '熟练',   color: 'from-green-400 to-emerald-500', icon: '⚡', next: 50,  prev: 10  };
  if (total < 200) return { label: '专业',   color: 'from-blue-400 to-cyan-500',     icon: '🎯', next: 200, prev: 50  };
  if (total < 500) return { label: '专家',   color: 'from-purple-400 to-violet-500', icon: '🔥', next: 500, prev: 200 };
  return             { label: '大师',   color: 'from-amber-400 to-orange-500',   icon: '👑', next: Infinity, prev: 500 };
};

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning' | 'accent' | 'error';
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, icon, color, onClick }) => {
  const colorStyles = {
    primary: 'from-primary-500 to-primary-600',
    success: 'from-success-500 to-success-600',
    warning: 'from-warning-500 to-warning-600',
    accent: 'from-accent-500 to-accent-600',
    error: 'from-error-500 to-error-600',
  };

  return (
    <Card 
      className={`p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg hover:shadow-xl transition-all duration-300 ${onClick ? 'cursor-pointer hover:-translate-y-1' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-surface-500 dark:text-surface-400 mb-1">{title}</p>
          <p className="text-3xl font-bold text-surface-900 dark:text-surface-100">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${change >= 0 ? 'text-success-600' : 'text-error-600'}`}>
              {change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              <span>{Math.abs(change)}%</span>
              <span className="text-surface-400">vs 上周</span>
            </div>
          )}
        </div>
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${colorStyles[color]} flex items-center justify-center text-white shadow-lg`}>
          {icon}
        </div>
      </div>
    </Card>
  );
};

interface QuickActionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  gradient: string;
}

const QuickAction: React.FC<QuickActionProps> = ({ icon, title, description, onClick, gradient }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-4 p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-all duration-200 text-left w-full group hover:shadow-md"
  >
    <div className={`w-12 h-12 rounded-xl ${gradient} flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform duration-200`}>
      {icon}
    </div>
    <div>
      <p className="font-medium text-surface-900 dark:text-surface-100">{title}</p>
      <p className="text-sm text-surface-500 dark:text-surface-400">{description}</p>
    </div>
  </button>
);

export const OverviewManager: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { communityEnabled } = useFeatureFlags();
  
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [sources, setSources] = useState<Array<SearchSource & { userConfig?: UserSourceConfig | null }>>([]);
  const [userSearchStats, setUserSearchStats] = useState<{
    totalSearches: number;
    topSources: Array<{ source: string; count: number }>;
    recentSearches: Array<{ query: string; createdAt: number }>;
    searchGrowthPercent: number;
    thisWeekSearches: number;
    lastWeekSearches: number;
  } | null>(null);
  const [activityStats, setActivityStats] = useState<{
    thisWeekLogins: number;
    lastWeekLogins: number;
  } | null>(null);
  const [recentActivities, setRecentActivities] = useState<Array<{
    id: string;
    action: string;
    target: string;
    createdAt: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAllData = useCallback(async () => {
    try {
      const [
        favoritesResponse,
        historyResponse,
        sourcesResponse,
        searchStatsResponse,
        activitiesResponse,
        activityStatsResponse
      ] = await Promise.all([
        userApi.getFavorites(),
        userApi.getSearchHistory(50),
        sourceApi.getSourcesWithUserConfig(),
        userApi.getSearchStats(),
        systemApi.getUserActions({ userId: user?.id, limit: 10 }),
        userApi.getActivitiesStats()
      ]);
      
      if (favoritesResponse.success && favoritesResponse.data) {
        setFavorites(favoritesResponse.data.favorites || []);
      }
      
      if (historyResponse.success && historyResponse.data) {
        setSearchHistory(historyResponse.data.history || []);
      }
      
      if (sourcesResponse.success && sourcesResponse.data) {
        setSources(sourcesResponse.data);
      }
      
      if (searchStatsResponse.success && searchStatsResponse.data) {
        setUserSearchStats(searchStatsResponse.data);
      }
      
      if (activitiesResponse.success && activitiesResponse.data) {
        setRecentActivities(activitiesResponse.data.logs.map((log: { id: string; action: string; target: string; createdAt: string }) => ({
          id: log.id,
          action: log.action,
          target: log.target,
          createdAt: log.createdAt,
        })));
      }

      if (activityStatsResponse.success && activityStatsResponse.data) {
        setActivityStats({
          thisWeekLogins: activityStatsResponse.data.summary.thisWeekLogins,
          lastWeekLogins: activityStatsResponse.data.summary.lastWeekLogins,
        });
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadAllData();
      setIsLoading(false);
    };
    init();
  }, [loadAllData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAllData();
    setIsRefreshing(false);
  };

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'search':
        return <Search className="w-4 h-4" />;
      case 'favorite':
        return <Heart className="w-4 h-4" />;
      case 'login':
        return <Activity className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityColor = (action: string) => {
    switch (action) {
      case 'search':
        return 'bg-gradient-to-br from-primary-100 to-primary-200 text-primary-600 dark:from-primary-900/30 dark:to-primary-800/30 dark:text-primary-400';
      case 'favorite':
        return 'bg-gradient-to-br from-error-100 to-error-200 text-error-600 dark:from-error-900/30 dark:to-error-800/30 dark:text-error-400';
      case 'login':
        return 'bg-gradient-to-br from-success-100 to-success-200 text-success-600 dark:from-success-900/30 dark:to-success-800/30 dark:text-success-400';
      default:
        return 'bg-gradient-to-br from-surface-100 to-surface-200 text-surface-600 dark:from-surface-800 dark:to-surface-700 dark:text-surface-400';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return `${Math.floor(diff / 86400)} 天前`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" text="加载中..." />
      </div>
    );
  }

  const userStats = {
    searchCount: userSearchStats?.totalSearches || searchHistory.length,
    favoriteCount: favorites.length,
    sourceCount: sources.filter(s => s.userConfig?.isEnabled !== false).length,
    totalSourceCount: sources.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              欢迎回来，{user?.username || '用户'}
            </h2>
            <p className="text-surface-500 dark:text-surface-400">
              这是您的个人数据概览
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          isLoading={isRefreshing}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          刷新
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="我的搜索次数"
          value={userStats.searchCount}
          change={userSearchStats?.searchGrowthPercent}
          icon={<Search className="w-6 h-6" />}
          color="primary"
          onClick={() => navigate('/dashboard/history')}
        />
        <StatCard
          title="我的收藏"
          value={userStats.favoriteCount}
          icon={<Heart className="w-6 h-6" />}
          color="error"
          onClick={() => navigate('/dashboard/favorites')}
        />
        <StatCard
          title="本周登录"
          value={activityStats?.thisWeekLogins ?? 0}
          change={activityStats?.lastWeekLogins ? Math.round((((activityStats.thisWeekLogins ?? 0) - activityStats.lastWeekLogins) / Math.max(activityStats.lastWeekLogins, 1)) * 100) : undefined}
          icon={<LogIn className="w-6 h-6" />}
          color="success"
        />
        <StatCard
          title="可用搜索源"
          value={userStats.sourceCount}
          icon={<Database className="w-6 h-6" />}
          color="accent"
          onClick={() => navigate('/dashboard/sources')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              </div>
              最近活动
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard/activities')}
            >
              查看全部
            </Button>
          </div>
          
          {recentActivities.length > 0 ? (
            <div className="space-y-4">
              {recentActivities.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getActivityColor(activity.action)}`}>
                    {getActivityIcon(activity.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                      {activity.action === 'search' && `搜索了 "${activity.target}"`}
                      {activity.action === 'favorite' && `收藏了 ${activity.target}`}
                      {activity.action === 'login' && '登录了账户'}
                      {!['search', 'favorite', 'login'].includes(activity.action) && activity.action}
                    </p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      {formatTimeAgo(activity.createdAt)}
                    </p>
                  </div>
                  <Badge variant={
                    activity.action === 'search' ? 'primary' :
                    activity.action === 'favorite' ? 'error' :
                    'default'
                  }>
                    {activity.action === 'search' && '搜索'}
                    {activity.action === 'favorite' && '收藏'}
                    {activity.action === 'login' && '登录'}
                    {!['search', 'favorite', 'login'].includes(activity.action) && activity.action}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-3" />
              <p className="text-surface-500 dark:text-surface-400">暂无活动记录</p>
            </div>
          )}
        </Card>

        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-accent-600 dark:text-accent-400" />
            </div>
            快速操作
          </h3>
          <div className="space-y-3">
            <QuickAction
              icon={<Search className="w-5 h-5" />}
              title="开始搜索"
              description="搜索磁力资源"
              onClick={() => navigate('/')}
              gradient="bg-gradient-to-br from-primary-500 to-primary-600"
            />
            <QuickAction
              icon={<Database className="w-5 h-5" />}
              title="管理搜索源"
              description="添加或编辑搜索源"
              onClick={() => navigate('/dashboard/sources')}
              gradient="bg-gradient-to-br from-accent-500 to-accent-600"
            />
            <QuickAction
              icon={<Heart className="w-5 h-5" />}
              title="查看收藏"
              description="管理您的收藏"
              onClick={() => navigate('/dashboard/favorites')}
              gradient="bg-gradient-to-br from-error-500 to-error-600"
            />
            {communityEnabled && (
              <QuickAction
                icon={<Globe className="w-5 h-5" />}
                title="社区分享"
                description="发现优质搜索源"
                onClick={() => navigate('/community')}
                gradient="bg-gradient-to-br from-success-500 to-success-600"
              />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 用户等级卡 */}
        {(() => {
          const totalActions = (userSearchStats?.totalSearches || searchHistory.length) + favorites.length;
          const level = getUserLevel(totalActions);
          const progress = level.next === Infinity
            ? 100
            : Math.min(100, Math.round(((totalActions - level.prev) / (level.next - level.prev)) * 100));
          return (
            <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg overflow-hidden relative">
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-primary-50 dark:bg-primary-900/20 -translate-y-16 translate-x-16 pointer-events-none" />
              <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                用户成就
              </h3>
              <div className={`relative rounded-2xl bg-gradient-to-br ${level.color} p-5 text-white mb-4`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{level.icon}</span>
                  <div>
                    <p className="text-xs text-white/70 font-medium">当前等级</p>
                    <p className="text-2xl font-bold">{level.label}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-white/70">累计操作</p>
                    <p className="text-xl font-bold">{totalActions}</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-white/70 mb-1">
                    <span>等级进度</span>
                    {level.next !== Infinity
                      ? <span>还差 {level.next - totalActions} 次升级</span>
                      : <span>🎉 已达最高等级</span>}
                  </div>
                  <div className="h-2 rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white/60 transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <p className="text-lg font-bold text-surface-900 dark:text-surface-100">{userStats.searchCount}</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">搜索次数</p>
                </div>
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <p className="text-lg font-bold text-surface-900 dark:text-surface-100">{userStats.favoriteCount}</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">收藏数量</p>
                </div>
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <p className="text-lg font-bold text-surface-900 dark:text-surface-100">
                    {new Set(searchHistory.map(h => h.query)).size}
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">不同词</p>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* 热门搜索 + 快速操作 */}
        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            搜索习惯
          </h3>
          
          <div className="space-y-4">
            <div className="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
              <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">本周最常搜索</p>
              {userSearchStats?.topSources && userSearchStats.topSources.length > 0 ? (
                <div className="space-y-2">
                  {userSearchStats.topSources.slice(0, 3).map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs flex items-center justify-center font-medium">
                          {index + 1}
                        </span>
                        <span className="text-sm text-surface-700 dark:text-surface-300 truncate max-w-[150px]">{item.source}</span>
                      </div>
                      <span className="text-sm font-medium text-surface-900 dark:text-surface-100">{item.count}次</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-surface-400 dark:text-surface-500">暂无数据</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                  {new Set(searchHistory.map(h => h.query)).size}
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">不同关键词</p>
              </div>
              <div className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                  {userSearchStats?.thisWeekSearches ?? 0}
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">本周搜索</p>
              </div>
            </div>

            {searchHistory.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag className="w-3.5 h-3.5 text-surface-400" />
                  <span className="text-xs text-surface-500 dark:text-surface-400 font-medium">最近搜索</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set(searchHistory.slice(0, 10).map(h => h.query))].slice(0, 6).map(q => (
                    <button
                      key={q}
                      onClick={() => navigate('/main')}
                      className="text-xs px-2.5 py-1 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30 dark:hover:text-primary-400 transition-colors border border-surface-200 dark:border-surface-700 truncate max-w-[100px]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
