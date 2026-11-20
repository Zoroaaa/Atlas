import React from 'react';
import { ExternalLink, Rss, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { formatRelativeTime } from '@/utils/relativeTime';
import type { NotificationItem } from '@/types';
import { describeNotification, notificationTargetPath, searchPathForCode } from './notificationView';

interface NotificationDetailModalProps {
  item: NotificationItem | null;
  onClose: () => void;
  /** 统一跳转出口；传 null 表示该通知没有独立落地页（如公告） */
  onNavigate: (path: string) => void;
}

/** 通知/公告详情：列表保持摘要，完整内容在这里换行展示 */
export const NotificationDetailModal: React.FC<NotificationDetailModalProps> = ({
  item,
  onClose,
  onNavigate,
}) => {
  const { t, i18n } = useTranslation(['notify']);

  if (!item) return null;

  const view = describeNotification(item, t);
  const body = item.body || view.body;
  const works = item.type === 'follow.new_work' ? item.payload.works ?? [] : [];
  const relatedPostTitle = item.type.startsWith('community.') ? item.payload.postTitle : undefined;
  const target = notificationTargetPath(view);

  // 按钮文案跟落地页一一对应，避免「查看帖子」点到搜索页这类误导
  const footer = target ? (
    <Button
      size="sm"
      leftIcon={view.postId
        ? <ExternalLink className="h-4 w-4" />
        : view.followKey ? <Rss className="h-4 w-4" /> : <Search className="h-4 w-4" />}
      onClick={() => onNavigate(target)}
    >
      {view.postId
        ? t('notify:detail.viewPost')
        : view.followKey ? t('notify:detail.viewFollowFeed') : t('notify:detail.searchCode')}
    </Button>
  ) : undefined;

  return (
    <Modal isOpen onClose={onClose} title={t('notify:detail.title')} size="lg" footer={footer}>
      <div className="space-y-3">
        <h3 className="whitespace-pre-wrap break-words text-base font-semibold text-surface-900 dark:text-surface-100">
          {view.title}
        </h3>
        <p className="text-xs text-surface-400">{formatRelativeTime(item.createdAt, i18n.language)}</p>

        {body ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-surface-700 dark:text-surface-300">
            {body}
          </div>
        ) : null}

        {works.length > 0 ? (
          <div className="rounded-lg border border-surface-200 dark:border-surface-700">
            <p className="border-b border-surface-200 px-3 py-2 text-xs font-medium text-surface-500 dark:border-surface-700">
              {t('notify:detail.works')}
            </p>
            <ul className="divide-y divide-surface-100 dark:divide-surface-800">
              {works.map((work) => (
                <li key={work.code}>
                  <button
                    type="button"
                    onClick={() => onNavigate(searchPathForCode(work.code))}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-surface-700 transition-colors hover:bg-surface-50 dark:text-surface-300 dark:hover:bg-surface-800/60"
                  >
                    <span className="shrink-0 font-mono text-xs text-primary-600 dark:text-primary-400">{work.code}</span>
                    {work.title ? <span className="min-w-0 break-words">{work.title}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {relatedPostTitle ? (
          <p className="break-words text-xs text-surface-500">
            {t('notify:detail.relatedPost', { title: relatedPostTitle })}
          </p>
        ) : null}
      </div>
    </Modal>
  );
};
