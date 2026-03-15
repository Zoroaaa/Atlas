import React from 'react';
import { clsx } from 'clsx';
import { Globe, Download, User, MessageSquare, Star } from 'lucide-react';
import { Card } from '@/components/ui';
import type { CommunityStats } from '@/types';

export const StatsBanner: React.FC<{ stats: CommunityStats | null }> = ({ stats }) => {
  if (!stats) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[
        { label: '分享总数', value: stats.totalSources, icon: Globe, gradient: 'from-primary-400 to-primary-600' },
        { label: '总下载', value: stats.totalDownloads, icon: Download, gradient: 'from-success-400 to-success-600' },
        { label: '参与用户', value: stats.totalUsers, icon: User, gradient: 'from-blue-400 to-blue-600' },
        { label: '评价数', value: stats.totalReviews, icon: MessageSquare, gradient: 'from-warning-400 to-warning-600' },
        { label: '平均评分', value: stats.averageRating.toFixed(1), icon: Star, gradient: 'from-orange-400 to-orange-600' },
      ].map(item => (
        <Card key={item.label} className="p-4 hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md', item.gradient)}>
              <item.icon className="w-5 h-5 text-white" />
            </div>
            <div><p className="text-xs text-surface-500">{item.label}</p><p className="text-xl font-bold text-surface-900 dark:text-surface-100">{item.value}</p></div>
          </div>
        </Card>
      ))}
    </div>
  );
};
