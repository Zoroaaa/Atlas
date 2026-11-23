/**
 * 个人中心 · 我的反馈：查看处理状态、管理员回复，并删除未处理/已关闭的反馈。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import {
  Bug, Lightbulb, MessageCircle, MessageSquarePlus, Clock, MailCheck, Trash2, RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, Loading, Button } from '@/components/ui';
import { Pagination } from '@/components/workbench';
import { feedbackApi } from '@/services/api';
import type { FeedbackItem } from '@/services/api';
import { useToast } from '@/hooks/useNotification';

const PAGE_SIZE = 10;
const STATUS_TABS = ['all', 'pending', 'processing', 'resolved', 'closed'] as const;
type StatusTab = typeof STATUS_TABS[number];

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  processing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400',
};

const TYPE_ICON: Record<string, React.ElementType> = {
  bug: Bug,
  suggestion: Lightbulb,
  other: MessageCircle,
};

export const MyFeedbackPage: React.FC = () => {
  const { t, i18n } = useTranslation(['feedback']);
  const toast = useToast();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusTab>('all');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await feedbackApi.getMy(page, PAGE_SIZE, status === 'all' ? undefined : status);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast.error((err as Error).message || t('feedback:my.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, status, toast, t]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = (next: StatusTab) => {
    setStatus(next);
    setPage(1);
  };

  const handleDelete = async (item: FeedbackItem) => {
    if (!confirm(t('feedback:my.deleteConfirm'))) return;
    setDeletingId(item.id);
    try {
      await feedbackApi.deleteMy(item.id);
      toast.success(t('feedback:my.deleted'));
      // 删掉当前页最后一条时回退一页，避免停在空白页
      if (items.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      toast.error((err as Error).message || t('feedback:my.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">{t('feedback:my.title')}</h1>
          <p className="mt-1 text-stone-500 dark:text-stone-400">{t('feedback:my.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={clsx('w-4 h-4 mr-2', loading && 'animate-spin')} />
          {t('feedback:my.refresh')}
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => changeStatus(tab)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              status === tab
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
            )}
          >
            {t(`feedback:my.statusFilter.${tab}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loading size="lg" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<MessageSquarePlus className="w-12 h-12" />}
            title={t('feedback:my.empty')}
            description={t('feedback:my.emptyDesc')}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const TypeIcon = TYPE_ICON[item.type] || MessageCircle;
            const canDelete = item.status === 'pending' || item.status === 'closed';
            return (
              <Card key={item.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className={clsx(
                    'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                    item.type === 'bug'
                      ? 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400'
                      : 'bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400'
                  )}>
                    <TypeIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 dark:text-stone-100 break-words">{item.title}</p>
                        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-stone-400">
                          <span>
                            {item.type === 'bug'
                              ? t('feedback:modal.typeBug')
                              : item.type === 'suggestion'
                                ? t('feedback:modal.typeSuggestion')
                                : t('feedback:modal.typeOther')}
                          </span>
                          <span className={clsx('px-2 py-0.5 rounded font-medium', STATUS_STYLE[item.status] || STATUS_STYLE.closed)}>
                            {t(`feedback:my.status.${item.status}`)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(item.created_at).toLocaleString(i18n.language)}
                          </span>
                          {item.email_sent === 1 && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <MailCheck className="w-3 h-3" />
                              {t('feedback:my.emailSent')}
                            </span>
                          )}
                        </div>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item.id}
                          title={t('feedback:my.delete')}
                          aria-label={t('feedback:my.delete')}
                          className="p-2 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-stone-600 dark:text-stone-300 whitespace-pre-wrap break-words">
                      {item.content}
                    </p>

                    {item.admin_reply ? (
                      <div className="mt-3 rounded-lg border-l-4 border-primary-400 bg-primary-50/60 dark:bg-primary-900/10 px-3 py-2">
                        <p className="text-xs font-semibold text-primary-700 dark:text-primary-400">{t('feedback:my.replyLabel')}</p>
                        <p className="mt-1 text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap break-words">{item.admin_reply}</p>
                      </div>
                    ) : item.status === 'resolved' || item.status === 'closed' ? (
                      <p className="mt-3 text-xs text-stone-400">{t('feedback:my.noReply')}</p>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}

          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            prevLabel={t('feedback:my.prevPage')}
            nextLabel={t('feedback:my.nextPage')}
          />
        </div>
      )}
    </div>
  );
};
