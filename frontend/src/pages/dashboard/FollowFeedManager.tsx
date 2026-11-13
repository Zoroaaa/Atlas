import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCheck, Heart, RefreshCw, Rss } from 'lucide-react';
import { Button, Card, EmptyState, Loading, Tabs } from '@/components/ui';
import { Chip, MediaCard, Pagination } from '@/components/workbench';
import {
  useFollows, useFollowFeed, useFollowFeedSearch, useFollowActions, FOLLOW_FEED_PAGE_SIZE,
} from '@/hooks';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { FollowWorkShareButton } from '@/components/follow/FollowWorkShareButton';
import { FollowFeedToolbar } from '@/components/follow/FollowFeedToolbar';
import type { FollowEntityType, FollowFeedTab } from '@/types';

/** 控制台 · 关注动态：全部关注对象的作品流，可按对象筛选 + 关键词集合搜索，服务端分页 */
export const FollowFeedManager: React.FC = () => {
  const { t } = useTranslation(['follow']);
  const navigate = useNavigate();
  const [tab, setTab] = useState<FollowFeedTab>('new');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');
  const [searchPage, setSearchPage] = useState(1);

  const { data: followsData } = useFollows();
  const follows = useMemo(() => followsData?.follows ?? [], [followsData]);
  const unread = followsData?.unread ?? 0;
  const { markViewed } = useFollowActions();

  const { data: feed, isLoading, isFetching, refetch } = useFollowFeed(tab, page, follows.length > 0, {
    entity: entity || undefined,
    pageSize: FOLLOW_FEED_PAGE_SIZE,
  });
  const items = feed?.items ?? [];
  const total = feed?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / FOLLOW_FEED_PAGE_SIZE));

  const { data: searchResult, isLoading: searchLoading } = useFollowFeedSearch(
    activeKeyword,
    searchPage,
    follows.length > 0
  );
  const searchItems = searchResult?.items ?? [];
  const searchTotal = searchResult?.total ?? 0;
  const searchTotalPages = Math.max(1, Math.ceil(searchTotal / FOLLOW_FEED_PAGE_SIZE));

  useEffect(() => { setPage(1); }, [tab, entity]);
  useEffect(() => { setSearchPage(1); }, [activeKeyword]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => {
    if (searchPage > searchTotalPages) setSearchPage(searchTotalPages);
  }, [searchPage, searchTotalPages]);
  useEffect(() => {
    if (entity && !follows.some((f) => f.key === entity)) setEntity('');
  }, [follows, entity]);

  const openCode = (code: string) => navigate(`/?q=${encodeURIComponent(code)}&tab=jav&sub=code`);

  const typePrefix = (type: FollowEntityType) =>
    type === 'actress' ? '' : `${t(`follow:entityTypes.${type}`)} · `;

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
              {t('follow:feedPage.subtitle', { count: activeKeyword ? searchTotal : total })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            leftIcon={<RefreshCw className={isFetching ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />}
            onClick={() => void refetch()}
            disabled={follows.length === 0 || !!activeKeyword}
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
          <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Tabs
                tabs={[
                  { id: 'new', label: t('follow:tabNew') },
                  { id: 'upcoming', label: t('follow:tabUpcoming') },
                ]}
                activeTab={tab}
                onChange={(id) => setTab(id as FollowFeedTab)}
              />
            </div>
            <FollowFeedToolbar
              follows={follows}
              filterKey={entity}
              onFilterKeyChange={setEntity}
              keyword={keyword}
              onKeywordChange={setKeyword}
              onSearch={() => { setActiveKeyword(keyword.trim()); setSearchPage(1); }}
              onClearSearch={() => { setActiveKeyword(''); setKeyword(''); }}
              activeKeyword={activeKeyword}
            />
          </Card>

          {activeKeyword ? (
            searchLoading ? (
              <div className="flex items-center justify-center py-16"><Loading size="lg" /></div>
            ) : searchItems.length === 0 ? (
              <EmptyState
                icon={<Rss className="w-12 h-12" />}
                title={t('follow:searchEmpty')}
                description={t('follow:searchEmptyHint')}
              />
            ) : (
              <Card className="p-4 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
                <p className="type-micro px-1 pb-2 text-surface-500">
                  {t('follow:searchResultTitle', { q: activeKeyword, count: searchTotal })}
                </p>
                <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
                  {searchItems.map((item) => (
                    <MediaCard
                      key={item.code}
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
                          {item.entityNames.join(' / ')}
                          {item.releaseDate ? ` · ${t('follow:releaseOn', { date: item.releaseDate })}` : ''}
                        </span>
                      }
                      onSelect={() => openCode(item.code)}
                      coverSize="sm"
                    />
                  ))}
                </div>
                <Pagination
                  page={searchPage}
                  totalPages={searchTotalPages}
                  onChange={setSearchPage}
                  prevLabel={t('search:favorites.prevPage')}
                  nextLabel={t('search:favorites.nextPage')}
                  className="pt-4"
                />
              </Card>
            )
          ) : isLoading ? (
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
                    key={`${item.actressKey ?? item.entityKey}-${item.code}`}
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
                        {typePrefix(item.entityType)}
                        {item.entityName}
                        {item.releaseDate ? ` · ${t('follow:releaseOn', { date: item.releaseDate })}` : ''}
                      </span>
                    }
                    onSelect={() => openCode(item.code)}
                    actions={<FollowWorkShareButton item={item} />}
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
