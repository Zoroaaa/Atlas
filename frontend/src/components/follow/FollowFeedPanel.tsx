import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, CheckCheck, Heart, Settings2, Bell, BellOff, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  PanelSection, PanelHeader, IconAction, CountBadge, Segmented, EmptyBlock, MediaCard, Pagination, Chip,
} from '@/components/workbench';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { useFollows, useFollowFeed, useFollowActions, FOLLOW_FEED_PAGE_SIZE } from '@/hooks';
import type { FollowFeedTab } from '@/types';

interface FollowFeedPanelProps {
  show?: boolean;
  onCodeClick: (code: string) => void;
}

/** 主页"关注动态"：关注女优的新作 / 即将发售，服务端分页，封面放大、标题执行 */
export const FollowFeedPanel: React.FC<FollowFeedPanelProps> = ({ show = true, onCodeClick }) => {
  const { t } = useTranslation(['follow']);
  const [expanded, setExpanded] = useState(true);
  const [managing, setManaging] = useState(false);
  const [tab, setTab] = useState<FollowFeedTab>('new');
  const [page, setPage] = useState(1);

  const { data: followsData } = useFollows();
  const follows = followsData?.follows ?? [];
  const unread = followsData?.unread ?? 0;
  const { unfollow, setNotify, markViewed } = useFollowActions();

  const { data: feed, isLoading } = useFollowFeed(tab, page, show && follows.length > 0 && expanded);
  const items = feed?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((feed?.total ?? 0) / FOLLOW_FEED_PAGE_SIZE));

  useEffect(() => { setPage(1); }, [tab]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  if (!show) return null;

  return (
    <PanelSection>
      <PanelHeader
        icon={<Heart className="h-4 w-4 text-rose-500" />}
        title={t('follow:title')}
        count={unread > 0 ? <CountBadge>{unread}</CountBadge> : undefined}
        meta={follows.length > 0 ? t('follow:manageTitle', { count: follows.length, limit: followsData?.limit ?? 100 }) : undefined}
        onToggle={() => setExpanded((value) => !value)}
        expanded={expanded}
        ariaControls="main-follow-feed"
        actions={
          <>
            {unread > 0 ? (
              <IconAction
                icon={<CheckCheck className="h-3.5 w-3.5" />}
                label={t('follow:markViewed')}
                onClick={() => markViewed.mutate()}
              />
            ) : null}
            {follows.length > 0 ? (
              <IconAction
                icon={<Settings2 className="h-3.5 w-3.5" />}
                label={t('follow:manage')}
                onClick={() => setManaging((value) => !value)}
              />
            ) : null}
            {expanded ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
          </>
        }
      />

      {expanded ? (
        <div id="main-follow-feed" className="px-4 pb-4 sm:px-5 sm:pb-5">
          {follows.length === 0 ? (
            <EmptyBlock
              icon={<Heart className="h-6 w-6" />}
              title={t('follow:emptyTitle')}
              hint={t('follow:emptyHint')}
            />
          ) : (
            <>
              {managing ? (
                <ul className="mb-3 divide-y divide-surface-100 rounded-[10px] bg-surface-50/60 dark:divide-surface-800/70 dark:bg-surface-900/30">
                  {follows.map((follow) => (
                    <li key={follow.key} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-surface-800 dark:text-surface-200">
                        {follow.name}
                      </span>
                      {follow.checkFailing ? <Chip tone="neutral" size="xs">{t('follow:checkFailing')}</Chip> : null}
                      <button
                        type="button"
                        onClick={() => setNotify.mutate({ key: follow.key, notifyInApp: !follow.notifyInApp })}
                        className="rounded-md p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800"
                        title={follow.notifyInApp ? t('follow:notifyOn') : t('follow:notifyOff')}
                        aria-label={follow.notifyInApp ? t('follow:notifyOn') : t('follow:notifyOff')}
                      >
                        {follow.notifyInApp ? <Bell className="h-3.5 w-3.5 text-primary-500" /> : <BellOff className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => unfollow.mutate(follow.key)}
                        className="rounded-md p-1 text-surface-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                        title={t('follow:unfollow')}
                        aria-label={t('follow:unfollow')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mb-2">
                <Segmented
                  value={tab}
                  onChange={setTab}
                  ariaLabel={t('follow:title')}
                  options={[
                    { value: 'new', label: t('follow:tabNew') },
                    { value: 'upcoming', label: t('follow:tabUpcoming') },
                  ]}
                />
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-16 w-full" />)}
                </div>
              ) : items.length === 0 ? (
                <EmptyBlock title={t('follow:noFeed')} className="min-h-[96px]" />
              ) : (
                <div className={clsx('divide-y divide-surface-100 dark:divide-surface-800/70')}>
                  {items.map((item) => (
                    <MediaCard
                      key={`${item.actressKey}-${item.code}`}
                      cover={item.cover ? getProxyImageUrl(item.cover) : undefined}
                      title={item.title || item.code}
                      badges={
                        <>
                          <Chip tone="primary" truncate>{item.code}</Chip>
                          {item.isUnread ? <Chip tone="accent" size="xs">{t('follow:newBadge')}</Chip> : null}
                        </>
                      }
                      meta={
                        <span className="type-micro text-surface-500">
                          {item.actressName}
                          {item.releaseDate ? ` · ${t('follow:releaseOn', { date: item.releaseDate })}` : ''}
                        </span>
                      }
                      onSelect={() => onCodeClick(item.code)}
                      coverSize="sm"
                    />
                  ))}
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    onChange={setPage}
                    prevLabel={t('search:favorites.prevPage')}
                    nextLabel={t('search:favorites.nextPage')}
                    className="pt-3"
                  />
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </PanelSection>
  );
};
