import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/workbench';
import { useUnreadCount, useNotificationInbox, useMarkNotificationsRead } from '@/hooks';
import type { NotificationItem } from '@/types';
import { describeNotification } from './notificationView';

const PAGE_SIZE = 10;

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 顶栏通知铃铛：未读红点 + 收件箱（打开时才请求，服务端分页） */
export const NotificationBell: React.FC = () => {
  const { t } = useTranslation(['notify']);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: unread = 0 } = useUnreadCount();
  const { data: inbox, isLoading } = useNotificationInbox(page, PAGE_SIZE, open);
  const markRead = useMarkNotificationsRead();
  const totalPages = Math.max(1, Math.ceil((inbox?.total ?? 0) / PAGE_SIZE));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleItemClick = (item: NotificationItem, code?: string, postId?: string) => {
    if (!item.isRead) markRead.mutate([item.id]);
    if (code) {
      setOpen(false);
      navigate(`/?q=${encodeURIComponent(code)}&tab=jav&sub=code`);
    } else if (postId) {
      setOpen(false);
      navigate(`/community/post/${postId}`);
    } else if (item.source === 'announcement' || item.type.startsWith('community.')) {
      setOpen(false);
      navigate('/dashboard/notifications');
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative p-1.5 sm:p-2 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
        aria-label={unread > 0 ? t('notify:unreadAria', { count: unread }) : t('notify:title')}
        title={t('notify:title')}
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-surface-200 bg-white shadow-xl dark:border-surface-700 dark:bg-surface-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between border-b border-surface-100 px-4 py-2.5 dark:border-surface-800">
            <span className="text-[13px] font-semibold text-surface-800 dark:text-surface-200">{t('notify:title')}</span>
            <button
              type="button"
              onClick={() => markRead.mutate(undefined)}
              disabled={unread === 0 || markRead.isPending}
              className="inline-flex items-center gap-1 text-[12px] text-primary-600 transition-colors hover:text-primary-700 disabled:opacity-40 dark:text-primary-400"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('notify:markAllRead')}
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-10 w-full" />)}
            </div>
          ) : !inbox || inbox.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-surface-500">{t('notify:empty')}</p>
          ) : (
            <ul className="divide-y divide-surface-100 dark:divide-surface-800">
              {inbox.items.map((item) => {
                const view = describeNotification(item, t);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(item, view.code, view.postId)}
                      className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/50"
                    >
                      <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', item.isRead ? 'bg-transparent' : 'bg-rose-500')} />
                      <span className="min-w-0 flex-1">
                        <span className={clsx('block text-[13px] leading-snug', item.isRead ? 'text-surface-600 dark:text-surface-400' : 'font-semibold text-surface-900 dark:text-surface-100')}>
                          {view.title}
                        </span>
                        {view.body ? <span className="mt-0.5 block truncate text-[12px] text-surface-500">{view.body}</span> : null}
                        <span className="mt-0.5 block text-[11px] text-surface-400">{formatTime(item.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              prevLabel={t('notify:prev')}
              nextLabel={t('notify:next')}
              className="border-t border-surface-100 px-4 py-2 dark:border-surface-800"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
