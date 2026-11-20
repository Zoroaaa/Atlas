import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/workbench';
import { useUnreadCount, useNotificationInbox, useMarkNotificationsRead } from '@/hooks';
import type { NotificationItem } from '@/types';
import { registerBackHandler } from '@/utils/backStack';
import { describeNotification, notificationTargetPath } from './notificationView';

const PAGE_SIZE = 10;
/** 顶部导航高度（h-16），移动端面板从这里展开 */
const MOBILE_PANEL_TOP = 64;
const WIDE_QUERY = '(min-width: 640px)';

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
  const [isWide, setIsWide] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(WIDE_QUERY).matches
      : false
  ));
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { data: unread = 0 } = useUnreadCount();
  const { data: inbox, isLoading } = useNotificationInbox(page, PAGE_SIZE, open);
  const markRead = useMarkNotificationsRead();
  const totalPages = Math.max(1, Math.ceil((inbox?.total ?? 0) / PAGE_SIZE));

  // 宽屏面板锚定铃铛右下角；窄屏用左右留白的固定面板
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(WIDE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsWide(event.matches);
    setIsWide(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const updateAnchor = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
    };
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    return () => window.removeEventListener('resize', updateAnchor);
  }, [open, isWide]);

  // 打开期间锁定背景滚动、支持 Esc / Android 返回键关闭
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const unregisterBack = registerBackHandler(() => setOpen(false));
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      unregisterBack();
    };
  }, [open]);

  const close = () => setOpen(false);

  const handleItemClick = (item: NotificationItem, target: string | null) => {
    if (!item.isRead) markRead.mutate([item.id]);
    if (target) {
      close();
      navigate(target);
    } else if (item.source === 'announcement' || item.type.startsWith('community.')) {
      // 公告没有独立页面，社区通知缺帖子 ID 时也回落到收件箱看详情
      close();
      navigate('/dashboard/notifications');
    }
  };

  const panelStyle: React.CSSProperties = isWide && anchor
    ? { top: anchor.top, right: anchor.right, width: 320 }
    : { top: MOBILE_PANEL_TOP, left: 12, right: 12 };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
        aria-label={unread > 0 ? t('notify:unreadAria', { count: unread }) : t('notify:title')}
        title={t('notify:title')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[80]">
              {/* 空白遮罩：拦截页面点击，避免关闭弹层时误触下面的作品卡片 */}
              <div
                className="absolute inset-0 bg-black/20 sm:bg-transparent"
                onClick={close}
                aria-hidden="true"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t('notify:title')}
                className="absolute flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-surface-200 bg-white shadow-xl dark:border-surface-700 dark:bg-surface-900"
                style={panelStyle}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-100 px-4 py-2.5 dark:border-surface-800">
                  <span className="text-[13px] font-semibold text-surface-800 dark:text-surface-200">{t('notify:title')}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => markRead.mutate(undefined)}
                      disabled={unread === 0 || markRead.isPending}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700 disabled:opacity-40 dark:text-primary-400 dark:hover:bg-primary-900/20"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      {t('notify:markAllRead')}
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      aria-label={t('notify:close')}
                      title={t('notify:close')}
                      className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 dark:hover:text-surface-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                              onClick={() => handleItemClick(item, notificationTargetPath(view))}
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
                </div>

                {totalPages > 1 ? (
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    onChange={setPage}
                    prevLabel={t('notify:prev')}
                    nextLabel={t('notify:next')}
                    className="shrink-0 border-t border-surface-100 px-4 py-2 dark:border-surface-800"
                  />
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};
