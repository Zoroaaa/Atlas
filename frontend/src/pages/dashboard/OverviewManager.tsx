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
import { useTranslation } from 'react-i18next';
import type { FavoriteItem, SearchHistoryItem, SearchSource, UserSourceConfig } from '@/types';

const getUserLevel = (total: number, t: (key: string) => string) => {
  if (total < 10)  return { label: t('dashboard:overview.userLevel.beginner'),   color: 'from-stone-400 to-stone-500',   icon: '🌱', next: 10,  prev: 0   };
  if (total < 50)  return { label: t('dashboard:overview.userLevel.skilled'),   color: 'from-green-400 to-emerald-500', icon: '⚡', next: 50,  prev: 10  };
  if (total < 200) return { label: t('dashboard:overview.userLevel.professional'),   color: 'from-amber-400 to-amber-500',   icon: '🎯', next: 200, prev: 50  };
  if (total < 500) return { label: t('dashboard:overview.userLevel.expert'),   color: 'from-rose-400 to-rose-500',     icon: '🔥', next: 500, prev: 200 };
  return             { label: t('dashboard:overview.userLevel.master'),   color: 'from-amber-400 to-orange-500',   icon: '👑', next: Infinity, prev: 500 };
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
  const { t } = useTranslation(['dashboard']);
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
              <span className="text-surface-400">{t('dashboard:overview.vsLastWeek')}</span>
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
  const { t } = useTranslation(['dashboard']);
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

    if (diff < 60) return t('dashboard:overview.timeAgo.justNow');
    if (diff < 3600) return t('dashboard:overview.timeAgo.minutesAgo', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('dashboard:overview.timeAgo.hoursAgo', { count: Math.floor(diff / 3600) });
    return t('dashboard:overview.timeAgo.daysAgo', { count: Math.floor(diff / 86400) });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" text={t('dashboard:overview.loading')} />
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
              {t('dashboard:overview.welcome', { username: user?.username || t('dashboard:overview.defaultUsername') })}
            </h2>
            <p className="text-surface-500 dark:text-surface-400">
              {t('dashboard:overview.subtitle')}
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
          {t('dashboard:overview.refresh')}
        </Button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('dashboard:overview.stats.searchCount')}
          value={userStats.searchCount}
          change={userSearchStats?.searchGrowthPercent}
          icon={<Search className="w-6 h-6" />}
          color="primary"
          onClick={() => navigate('/dashboard/history')}
        />
        <StatCard
          title={t('dashboard:overview.stats.favorites')}
          value={userStats.favoriteCount}
          icon={<Heart className="w-6 h-6" />}
          color="error"
          onClick={() => navigate('/dashboard/favorites')}
        />
        <StatCard
          title={t('dashboard:overview.stats.weeklyLogins')}
          value={activityStats?.thisWeekLogins ?? 0}
          change={activityStats?.lastWeekLogins ? Math.round((((activityStats.thisWeekLogins ?? 0) - activityStats.lastWeekLogins) / Math.max(activityStats.lastWeekLogins, 1)) * 100) : undefined}
          icon={<LogIn className="w-6 h-6" />}
          color="success"
        />
        <StatCard
          title={t('dashboard:overview.stats.availableSources')}
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
              {t('dashboard:overview.recentActivities')}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard/activities')}
            >
              {t('dashboard:overview.viewAll')}
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
                      {activity.action === 'search' && t('dashboard:overview.activityMessage.search', { target: activity.target })}
                      {activity.action === 'favorite' && t('dashboard:overview.activityMessage.favorite', { target: activity.target })}
                      {activity.action === 'login' && t('dashboard:overview.activityMessage.login')}
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
                    {activity.action === 'search' && t('dashboard:overview.activityBadge.search')}
                    {activity.action === 'favorite' && t('dashboard:overview.activityBadge.favorite')}
                    {activity.action === 'login' && t('dashboard:overview.activityBadge.login')}
                    {!['search', 'favorite', 'login'].includes(activity.action) && activity.action}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-3" />
              <p className="text-surface-500 dark:text-surface-400">{t('dashboard:overview.noActivities')}</p>
            </div>
          )}
        </Card>

        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-accent-600 dark:text-accent-400" />
            </div>
            {t('dashboard:overview.quickActions')}
          </h3>
          <div className="space-y-3">
            <QuickAction
              icon={<Search className="w-5 h-5" />}
              title={t('dashboard:overview.actions.startSearch.title')}
              description={t('dashboard:overview.actions.startSearch.description')}
              onClick={() => navigate('/')}
              gradient="bg-gradient-to-br from-primary-500 to-primary-600"
            />
            <QuickAction
              icon={<Database className="w-5 h-5" />}
              title={t('dashboard:overview.actions.manageSources.title')}
              description={t('dashboard:overview.actions.manageSources.description')}
              onClick={() => navigate('/dashboard/sources')}
              gradient="bg-gradient-to-br from-accent-500 to-accent-600"
            />
            <QuickAction
              icon={<Heart className="w-5 h-5" />}
              title={t('dashboard:overview.actions.viewFavorites.title')}
              description={t('dashboard:overview.actions.viewFavorites.description')}
              onClick={() => navigate('/dashboard/favorites')}
              gradient="bg-gradient-to-br from-error-500 to-error-600"
            />
            {communityEnabled && (
              <QuickAction
                icon={<Globe className="w-5 h-5" />}
                title={t('dashboard:overview.actions.communityShare.title')}
                description={t('dashboard:overview.actions.communityShare.description')}
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
          const level = getUserLevel(totalActions, t);
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
                {t('dashboard:overview.userAchievement')}
              </h3>
              <div className={`relative rounded-2xl bg-gradient-to-br ${level.color} p-5 text-white mb-4`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{level.icon}</span>
                  <div>
                    <p className="text-xs text-white/70 font-medium">{t('dashboard:overview.currentLevel')}</p>
                    <p className="text-2xl font-bold">{level.label}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-white/70">{t('dashboard:overview.totalActions')}</p>
                    <p className="text-xl font-bold">{totalActions}</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-white/70 mb-1">
                    <span>{t('dashboard:overview.levelProgress')}</span>
                    {level.next !== Infinity
                      ? <span>{t('dashboard:overview.levelsToNext', { count: level.next - totalActions })}</span>
                      : <span>{t('dashboard:overview.maxLevel')}</span>}
                  </div>
                  <div className="h-2 rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white/60 transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <p className="text-lg font-bold text-surface-900 dark:text-surface-100">{userStats.searchCount}</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{t('dashboard:overview.achievementStats.searchCount')}</p>
                </div>
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <p className="text-lg font-bold text-surface-900 dark:text-surface-100">{userStats.favoriteCount}</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{t('dashboard:overview.achievementStats.favoriteCount')}</p>
                </div>
                <div className="text-center p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <p className="text-lg font-bold text-surface-900 dark:text-surface-100">
                    {new Set(searchHistory.map(h => h.query)).size}
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{t('dashboard:overview.achievementStats.uniqueKeywords')}</p>
                </div>
              </div>
            </Card>
          );
        })()}

        {/* 热门搜索 + 快速操作 */}
        <Card className="p-6 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            {t('dashboard:overview.searchHabits')}
          </h3>

          <div className="space-y-4">
            <div className="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
              <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">{t('dashboard:overview.weeklyTopSearch')}</p>
              {userSearchStats?.topSources && userSearchStats.topSources.length > 0 ? (
                <div className="space-y-2">
                  {userSearchStats.topSources.slice(0, 3).map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#d4a853] to-[#f59e0b] text-white text-xs flex items-center justify-center font-medium">
                          {index + 1}
                        </span>
                        <span className="text-sm text-surface-700 dark:text-surface-300 truncate max-w-[150px]">{item.source}</span>
                      </div>
                      <span className="text-sm font-medium text-surface-900 dark:text-surface-100">{item.count}{t('dashboard:overview.countSuffix')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-surface-400 dark:text-surface-500">{t('dashboard:overview.noData')}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                  {new Set(searchHistory.map(h => h.query)).size}
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">{t('dashboard:overview.uniqueKeywordsFull')}</p>
              </div>
              <div className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl text-center">
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                  {userSearchStats?.thisWeekSearches ?? 0}
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">{t('dashboard:overview.weeklySearches')}</p>
              </div>
            </div>

            {searchHistory.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag className="w-3.5 h-3.5 text-surface-400" />
                  <span className="text-xs text-surface-500 dark:text-surface-400 font-medium">{t('dashboard:overview.recentSearches')}</span>
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
