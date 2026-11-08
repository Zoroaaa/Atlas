import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCheck, Heart, RefreshCw, Rss } from 'lucide-react';
import { Button, Card, EmptyState, Loading, Tabs } from '@/components/ui';
import { Chip, MediaCard, Pagination } from '@/components/workbench';
import { useFollows, useFollowFeed, useFollowActions, FOLLOW_FEED_PAGE_SIZE } from '@/hooks';
import { getProxyImageUrl } from '@/utils/imageProxy';
import type { FollowFeedTab } from '@/types';

/** 控制台 · 关注动态：全部关注女优的作品流，可按女优筛选，服务端分页 */
export const FollowFeedManager: React.FC = () => {
  const { t } = useTranslation(['follow']);
  const navigate = useNavigate();
  const [tab, setTab] = useState<FollowFeedTab>('new');
  const [actress, setActress] = useState('');
  const [page, setPage] = useState(1);

  const { data: followsData } = useFollows();
  const follows = followsData?.follows ?? [];
  const unread = followsData?.unread ?? 0;
  const { markViewed } = useFollowActions();

  const { data: feed, isLoading, isFetching, refetch } = useFollowFeed(tab, page, follows.length > 0, {
    actress: actress || undefined,
    pageSize: FOLLOW_FEED_PAGE_SIZE,
  });
  const items = feed?.items ?? [];
  const total = feed?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / FOLLOW_FEED_PAGE_SIZE));

  useEffect(() => { setPage(1); }, [tab, actress]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const openCode = (code: string) => navigate(`/?q=${encodeURIComponent(code)}&tab=jav&sub=code`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-amber-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Rss className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">{t('follow:feedPage.title')}</h2>
            <p className="text-surface-500 dark:text-surface-400">
              {t('follow:feedPage.subtitle', { count: total })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            leftIcon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />}
            onClick={() => void refetch()}
            disabled={follows.length === 0}
          >
            {t('follow:feedPage.refresh')}
          </Button>
          <Button
            variant="outline"
            leftIcon={<CheckCheck className="w-4 h-4" />}
            onClick={() => markViewed.mutate()}
            disabled={unread === 0}
            isLoading={markViewed.isPending}
          >
            {t('follow:markViewed')}
          </Button>
        </div>
      </div>

      {follows.length === 0 ? (
        <EmptyState
          icon={<Heart className="w-12 h-12" />}
          title={t('follow:emptyTitle')}
          description={t('follow:emptyHint')}
          action={<Button variant="outline" onClick={() => navigate('/dashboard/follows')}>{t('follow:feedPage.goManage')}</Button>}
        />
      ) : (
        <>
          <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Tabs
                tabs={[
                  { id: 'new', label: t('follow:tabNew') },
                  { id: 'upcoming', label: t('follow:tabUpcoming') },
                ]}
                activeTab={tab}
                onChange={(id) => setTab(id as FollowFeedTab)}
              />
              <select
                value={actress}
                onChange={(e) => setActress(e.target.value)}
                aria-label={t('follow:feedPage.filterAll')}
                className="sm:ml-auto px-4 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('follow:feedPage.filterAll')}</option>
                {follows.map((f) => (
                  <option key={f.key} value={f.key}>{f.name}</option>
                ))}
              </select>
            </div>
          </Card>

          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loading size="lg" /></div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Rss className="w-12 h-12" />}
              title={t('follow:noFeed')}
              description={tab === 'upcoming' ? t('follow:feedPage.upcomingHint') : undefined}
            />
          ) : (
            <Card className="p-4 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
              <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
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
                    onSelect={() => openCode(item.code)}
                    coverSize="sm"
                  />
                ))}
              </div>
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={setPage}
                prevLabel={t('search:favorites.prevPage')}
                nextLabel={t('search:favorites.nextPage')}
                className="pt-4"
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
};
