import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { RefreshCw, Bell, Heart, MessageSquare, Download, AlertTriangle, Inbox } from 'lucide-react';
import { communityApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores';
import { Pagination } from './shared';

interface NotificationItem {
  id: string;
  type: 'like' | 'review' | 'download' | 'report_resolved';
  sourceId: string;
  sourceName: string;
  actorName: string;
  content: string;
  rating?: number;
  createdAt: number;
}

const TYPE_CONFIG = {
  like: { icon: Heart, label: '点赞', color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
  review: { icon: MessageSquare, label: '评价', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
  download: { icon: Download, label: '导入', color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
  report_resolved: { icon: AlertTriangle, label: '举报处理', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
};

export const NotificationsTab: React.FC = () => {
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
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
      const response = await communityApi.getNotifications(page, 20);
      if (response.success && response.data) {
        setNotifications(response.data.items || []);
        setTotalPages(response.data.totalPages || 1);
        setTotal(response.data.total || 0);
      }
    } catch {
      toast.error('加载通知失败');
    } finally {
      setLoading(false);
    }
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
            <option value="review">评价通知</option>
            <option value="download">导入通知</option>
            <option value="report_resolved">举报处理</option>
          </select>
          <Button variant="outline" size="sm" onClick={loadNotifications}>
            <RefreshCw className="w-4 h-4 mr-1.5" />刷新
          </Button>
        </div>
      </div>

      {/* 说明文字 */}
      <p className="text-xs text-surface-400">
        当其他用户点赞、评价、导入你分享的搜索源，或你的搜索源举报被处理时，这里会显示相应通知。
      </p>

      {/* 内容区 */}
      {loading ? (
        <div className="flex justify-center py-12"><Loading /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700">
          <Inbox className="w-12 h-12 text-surface-300" />
          <p className="text-surface-500 font-medium">暂无消息通知</p>
          <p className="text-xs text-surface-400">在社区分享你的搜索源，获得互动后这里会显示通知</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const config = TYPE_CONFIG[n.type];
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
                        <span className="font-semibold">{n.actorName}</span>
                        {' '}{n.content}
                      </p>
                      <p className="text-xs text-surface-400 mt-0.5">
                        来源：<span className="text-surface-500">{n.sourceName}</span>
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
