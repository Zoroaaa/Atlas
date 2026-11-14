import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CheckCheck, UserCheck, Settings2, Bell, BellOff, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  PanelSection, PanelHeader, IconAction, CountBadge, Segmented, EmptyBlock, MediaCard, Pagination, Chip,
} from '@/components/workbench';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { FollowWorkShareButton } from './FollowWorkShareButton';
import { FollowFeedToolbar } from './FollowFeedToolbar';
import {
  useFollows, useFollowFeed, useFollowFeedSearch, useFollowActions, FOLLOW_FEED_PAGE_SIZE,
} from '@/hooks';
import type { FollowFeedTab } from '@/types';

interface FollowFeedPanelProps {
  show?: boolean;
  onCodeClick: (code: string) => void;
}

/** 主页"关注动态"：关注对象的新作 / 即将发售，支持按对象筛选与关键词集合搜索 */
export const FollowFeedPanel: React.FC<FollowFeedPanelProps> = ({ show = true, onCodeClick }) => {
  const { t } = useTranslation(['follow']);
  const [expanded, setExpanded] = useState(true);
  const [managing, setManaging] = useState(false);
  const [tab, setTab] = useState<FollowFeedTab>('new');
  const [page, setPage] = useState(1);
  const [filterKey, setFilterKey] = useState('');
  const [keyword, setKeyword] = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');
  const [searchPage, setSearchPage] = useState(1);

  const { data: followsData } = useFollows();
  const follows = useMemo(() => followsData?.follows ?? [], [followsData]);
  const unread = followsData?.unread ?? 0;
  const { unfollow, setNotify, markViewed } = useFollowActions();

  const { data: feed, isLoading, isError: feedError } = useFollowFeed(tab, page, show && follows.length > 0 && expanded, {
    entity: filterKey || undefined,
  });
  const items = feed?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((feed?.total ?? 0) / FOLLOW_FEED_PAGE_SIZE));

  const { data: searchResult, isLoading: searchLoading } = useFollowFeedSearch(
    activeKeyword,
    searchPage,
    show && expanded && follows.length > 0
  );
  const searchItems = searchResult?.items ?? [];
  const searchTotalPages = Math.max(1, Math.ceil((searchResult?.total ?? 0) / FOLLOW_FEED_PAGE_SIZE));

  useEffect(() => { setPage(1); }, [tab, filterKey]);
  useEffect(() => { setSearchPage(1); }, [activeKeyword]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => {
    if (searchPage > searchTotalPages) setSearchPage(searchTotalPages);
  }, [searchPage, searchTotalPages]);
  // 取消关注后如果正在按该对象筛选，自动回到全部
  useEffect(() => {
    if (filterKey && !follows.some((f) => f.key === filterKey)) setFilterKey('');
  }, [follows, filterKey]);

  if (!show) return null;

  const submitSearch = () => {
    const q = keyword.trim();
    setActiveKeyword(q);
    setSearchPage(1);
  };

  const typePrefix = (type: string) =>
    type === 'actress' ? '' : `${t(`follow:entityTypes.${type}`)} · `;

  return (
    <PanelSection>
      <PanelHeader
        icon={<UserCheck className="h-4 w-4 text-primary-500" />}
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
              icon={<UserCheck className="h-6 w-6" />}
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
                        <span className="text-surface-400">{typePrefix(follow.entityType)}</span>
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

              <FollowFeedToolbar
                className="mb-3"
                follows={follows}
                filterKey={filterKey}
                onFilterKeyChange={setFilterKey}
                keyword={keyword}
                onKeywordChange={setKeyword}
                onSearch={submitSearch}
                onClearSearch={() => { setActiveKeyword(''); setKeyword(''); }}
                activeKeyword={activeKeyword}
              />

              {!activeKeyword && feedError && items.length > 0 ? (
                <p className="type-micro mb-2 px-1 text-surface-400">{t('follow:offlineCacheHint')}</p>
              ) : null}

              {activeKeyword ? (
                searchLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-16 w-full" />)}
                  </div>
                ) : searchItems.length === 0 ? (
                  <EmptyBlock
                    title={t('follow:searchEmpty')}
                    hint={t('follow:searchEmptyHint')}
                    className="min-h-[96px]"
                  />
                ) : (
                  <div className={clsx('divide-y divide-surface-100 dark:divide-surface-800/70')}>
                    <p className="type-micro px-1 pb-1.5 text-surface-500">
                      {t('follow:searchResultTitle', { q: activeKeyword, count: searchResult?.total ?? 0 })}
                    </p>
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
                        onSelect={() => onCodeClick(item.code)}
                        coverSize="sm"
                      />
                    ))}
                    <Pagination
                      page={searchPage}
                      totalPages={searchTotalPages}
                      onChange={setSearchPage}
                      prevLabel={t('search:favorites.prevPage')}
                      nextLabel={t('search:favorites.nextPage')}
                      className="pt-3"
                    />
                  </div>
                )
              ) : isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-16 w-full" />)}
                </div>
              ) : items.length === 0 ? (
                <EmptyBlock title={t('follow:noFeed')} className="min-h-[96px]" />
              ) : (
                <div className={clsx('divide-y divide-surface-100 dark:divide-surface-800/70')}>
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
                      onSelect={() => onCodeClick(item.code)}
                      actions={<FollowWorkShareButton item={item} />}
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
