import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { RefreshCw, Bell, Heart, MessageSquare, Bookmark, AlertTriangle, Inbox } from 'lucide-react';
import { communityApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useAuthStore } from '@/stores';
import type { CommunityNotification } from '@/types';
import { Pagination } from './shared';

const TYPE_CONFIG: Record<CommunityNotification['type'], { icon: typeof Heart; label: string; color: string }> = {
  like: { icon: Heart, label: '点赞', color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
  comment: { icon: MessageSquare, label: '评论', color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
  favorite: { icon: Bookmark, label: '收藏', color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
  report_resolved: { icon: AlertTriangle, label: '举报处理', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
};

export const NotificationsTab: React.FC = () => {
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
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
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
        <p className="text-surface-500">请先登录查看消息通知</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary-500" />
          <h3 className="font-semibold text-surface-900 dark:text-surface-100">消息通知</h3>
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
            <option value="">全部消息</option>
            <option value="like">点赞通知</option>
            <option value="comment">评论通知</option>
            <option value="favorite">收藏通知</option>
            <option value="report_resolved">举报处理</option>
          </select>
          <Button variant="outline" size="sm" onClick={loadNotifications}>
            <RefreshCw className="w-4 h-4 mr-1.5" />刷新
          </Button>
        </div>
      </div>

      {/* 说明文字 */}
      <p className="text-xs text-surface-400">
        当其他用户点赞、评论、收藏你的帖子，或举报被处理时，这里会显示相应通知。
      </p>

      {/* 内容区 */}
      {loading ? (
        <div className="flex justify-center py-12"><Loading /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
          <Inbox className="w-12 h-12 text-surface-300" />
          <p className="text-surface-500 font-medium">暂无消息通知</p>
          <p className="text-xs text-surface-400">在社区分享内容并获得互动后，通知将显示在这里</p>
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
                        <span className="font-semibold">{n.actorName || '系统'}</span>
                        {' '}{n.content}
                      </p>
                      <p className="text-xs text-surface-400 mt-0.5">
                        帖子：<span className="text-surface-500">{n.postTitle}</span>
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
