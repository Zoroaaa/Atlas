import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { RefreshCw, Bell, Heart, MessageSquare, Bookmark, AlertTriangle, Inbox } from 'lucide-react';
import { communityApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useAuthStore } from '@/stores';
import type { CommunityNotification } from '@/types';
import { Pagination } from './shared';

const TYPE_CONFIG: Record<CommunityNotification['type'], { icon: typeof Heart; color: string }> = {
  like: { icon: Heart, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
  comment: { icon: MessageSquare, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
  favorite: { icon: Bookmark, color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
  report_resolved: { icon: AlertTriangle, color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
};

export const NotificationsTab: React.FC = () => {
  const { t } = useTranslation(['communityPages']);
  const { isAuthenticated } = useAuthStore();
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '-';
    const d = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return t('communityPages:notifications.justNow');
    if (diff < 3600000) return t('communityPages:notifications.minutesAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('communityPages:notifications.hoursAgo', { count: Math.floor(diff / 3600000) });
    if (diff < 604800000) return t('communityPages:notifications.daysAgo', { count: Math.floor(diff / 86400000) });
    return d.toLocaleDateString('zh-CN');
  };

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await communityApi.getNotifications({ page, pageSize: 20 });
      setNotifications(response.items || []);
      setTotalPages(response.totalPages || 1);
      setTotal(response.total || 0);
    } catch {
      // 静默失败，不阻塞 UI
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isAuthenticated]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const filtered = typeFilter
    ? notifications.filter(n => n.type === typeFilter)
    : notifications;

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Bell className="w-12 h-12 text-surface-300" />
        <p className="text-surface-500">{t('communityPages:notifications.loginRequired')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary-500" />
          <h3 className="font-semibold text-surface-900 dark:text-surface-100">{t('communityPages:notifications.title')}</h3>
          {total > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded-full">
              {total}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
          >
            <option value="">{t('communityPages:notifications.filterAll')}</option>
            <option value="like">{t('communityPages:notifications.filterLike')}</option>
            <option value="comment">{t('communityPages:notifications.filterComment')}</option>
            <option value="favorite">{t('communityPages:notifications.filterFavorite')}</option>
            <option value="report_resolved">{t('communityPages:notifications.filterReportResolved')}</option>
          </select>
          <Button variant="outline" size="sm" onClick={loadNotifications}>
            <RefreshCw className="w-4 h-4 mr-1.5" />{t('communityPages:notifications.refresh')}
          </Button>
        </div>
      </div>

      {/* 说明文字 */}
      <p className="text-xs text-surface-400">
        {t('communityPages:notifications.description')}
      </p>

      {/* 内容区 */}
      {loading ? (
        <div className="flex justify-center py-12"><Loading /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
          <Inbox className="w-12 h-12 text-surface-300" />
          <p className="text-surface-500 font-medium">{t('communityPages:notifications.emptyTitle')}</p>
          <p className="text-xs text-surface-400">{t('communityPages:notifications.emptyDescription')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const config = TYPE_CONFIG[n.type];
            if (!config) return null;
            const Icon = config.icon;
            return (
              <div
                key={n.id}
                className="flex items-start gap-4 p-4 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 hover:shadow-md transition-shadow"
              >
                <div className={clsx('p-2.5 rounded-xl flex-shrink-0', config.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-surface-900 dark:text-surface-100">
                        <span className="font-semibold">{n.actorName || t('communityPages:notifications.systemActor')}</span>
                        {' '}{n.content}
                      </p>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {t('communityPages:notifications.postPrefix')}<span className="text-surface-500">{n.postTitle}</span>
                      </p>
                    </div>
                    <span className="text-xs text-surface-400 whitespace-nowrap flex-shrink-0">{formatDate(n.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </div>
  );
};
