import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  FileText,
  Users,
  MessageSquare,
  Heart,
  Bookmark,
  TrendingUp,
  Hash,
  Clock,
} from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';

export const StatsBanner: React.FC = () => {
  const { t } = useTranslation(['communityPages']);
  const { communityStats, tags, fetchCommunityStats, fetchTags } = useCommunityStore();

  useEffect(() => {
    fetchCommunityStats();
    fetchTags();
  }, [fetchCommunityStats, fetchTags]);

  if (!communityStats) return null;

  // 统计卡片数据
  const statCards = [
    {
      labelKey: 'communityPages:statsBanner.totalPosts',
      value: communityStats.totalPosts,
      icon: FileText,
      gradient: 'from-[#d4a853] to-[#f59e0b]',
      color: 'text-amber-700 bg-amber-50 dark:bg-amber-900/20',
    },
    {
      labelKey: 'communityPages:statsBanner.totalUsers',
      value: communityStats.totalUsers,
      icon: Users,
      gradient: 'from-[#e11d48] to-[#be123c]',
      color: 'text-rose-700 bg-rose-50 dark:bg-rose-900/20',
    },
    {
      labelKey: 'communityPages:statsBanner.totalComments',
      value: communityStats.totalComments,
      icon: MessageSquare,
      gradient: 'from-emerald-400 to-emerald-600',
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      labelKey: 'communityPages:statsBanner.totalLikes',
      value: communityStats.totalLikes,
      icon: Heart,
      gradient: 'from-rose-400 to-rose-600',
      color: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20',
    },
    {
      labelKey: 'communityPages:statsBanner.totalFavorites',
      value: communityStats.totalFavorites ?? 0,
      icon: Bookmark,
      gradient: 'from-amber-400 to-amber-600',
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
    },
    {
      labelKey: 'communityPages:statsBanner.engagementRate',
      value: `${(communityStats.averageEngagement * 100).toFixed(1)}%`,
      icon: TrendingUp,
      gradient: 'from-cyan-400 to-cyan-600',
      color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20',
    },
  ];

  // 获取热门标签（优先有帖子的标签，不足时补充其他活跃标签）
  const hotTags = (tags || [])
    .sort((a, b) => (b.postsCount || 0) - (a.postsCount || 0) || a.tagName.localeCompare(b.tagName))
    .slice(0, 4)
    .map(t => ({
      name: t.tagName.replace(/^#/, ''),
      count: t.postsCount || 0,
      color: t.tagColor,
    }));

  // 格式化时间
  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 3600000) return t('communityPages:statsBanner.minutesAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('communityPages:statsBanner.hoursAgo', { count: Math.floor(diff / 3600000) });
    return t('communityPages:statsBanner.daysAgo', { count: Math.floor(diff / 86400000) });
  };

  return (
    <div className="space-y-5">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((item) => (
          <Card key={item.labelKey} padding="md" hover>
            <div className="flex items-center gap-3">
              <div
                className={clsx(
                  'w-11 h-11 rounded-xl flex items-center justify-center shadow-sm',
                  item.color
                )}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-stone-400">{t(item.labelKey)}</p>
                <p className="text-xl font-bold text-stone-900 dark:text-stone-100">
                  {typeof item.value === 'number'
                    ? item.value.toLocaleString()
                    : item.value}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 热门标签 + 最近活动 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 热门标签 */}
        {hotTags.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-primary-500" />
            <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100">{t('communityPages:statsBanner.hotTags')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {hotTags.map((tag, idx) => (
              <Badge
                key={idx}
                variant="default"
                size="md"
                style={{
                  backgroundColor: tag.color + '15',
                  color: tag.color,
                  border: `1px solid ${tag.color}30`,
                }}
              >
                #{tag.name}
                <span className="ml-1 opacity-60">({tag.count})</span>
              </Badge>
            ))}
          </div>
        </Card>
        )}
        {/* 最近活动 */}
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary-500" />
            <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100">{t('communityPages:statsBanner.recentActivity')}</h3>
          </div>
          {communityStats.recentActivity && communityStats.recentActivity.length > 0 ? (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {communityStats.recentActivity.slice(0, 5).map((activity, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <Badge
                    variant={
                      activity.type === 'post' ? 'primary' :
                      activity.type === 'like' ? 'error' :
                      activity.type === 'comment' ? 'accent' : 'default'
                    }
                    size="sm"
                  >
                    {activity.type === 'post' ? t('communityPages:statsBanner.activityPost') :
                     activity.type === 'like' ? t('communityPages:statsBanner.activityLike') :
                     activity.type === 'comment' ? t('communityPages:statsBanner.activityComment') : activity.type}
                  </Badge>
                  <span className="flex-1 truncate text-stone-600 dark:text-stone-400">
                    {activity.title || t('communityPages:statsBanner.newActivity')}
                  </span>
                  <span className="text-stone-400 shrink-0">
                    {formatTime(activity.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400 text-center py-4">{t('communityPages:statsBanner.emptyActivity')}</p>
          )}
        </Card>
      </div>
    </div>
  );
};
