import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  Search,
  Grid3X3,
  LayoutList,
  Film,
  Tv,
  BookOpen,
  Library,
  Users,
  Clock,
  Flame,
  RefreshCw,
} from 'lucide-react';
import { Card, Button, Input, Loading, EmptyState } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { PostCard } from './PostCard';
import { PostDetail } from './PostDetail';


const TYPE_FILTERS = [
  { key: 'all' as const, labelKey: 'communityPages:browse.filterAll', icon: null },
  { key: 'jav' as const, labelKey: 'communityPages:browse.filterJav', icon: Film },
  { key: 'anime' as const, labelKey: 'communityPages:browse.filterAnime', icon: Tv },
  { key: 'movie' as const, labelKey: 'communityPages:browse.filterMovie', icon: Film },
  { key: 'manga' as const, labelKey: 'communityPages:browse.filterManga', icon: BookOpen },
  { key: 'novel' as const, labelKey: 'communityPages:browse.filterNovel', icon: Library },
  { key: 'actress' as const, labelKey: 'communityPages:browse.filterActress', icon: Users },
];

const SORT_OPTIONS = [
  { key: 'latest' as const, labelKey: 'communityPages:browse.sortLatest', icon: Clock },
  { key: 'hot' as const, labelKey: 'communityPages:browse.sortHot', icon: Flame },
];

export const BrowseTab: React.FC = () => {
  const { t } = useTranslation(['communityPages']);
  const {
    posts,
    postsLoading,
    postsTotal,
    postTypeFilter,
    sortBy,
    searchQuery,
    fetchPosts,
    toggleLike,
    toggleFavorite,
    setPostTypeFilter,
    setSortBy,
    setSearchQuery,
    fetchPost,
  } = useCommunityStore();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始加载 & 筛选/排序变化时重新加载（合并为单个 effect 避免重复请求）
  useEffect(() => {
    fetchPosts({ page: 1 });
  }, [postTypeFilter, sortBy, fetchPosts]);

  // 搜索防抖
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setPage(1);
      fetchPosts({ page: 1, search: value || undefined });
    }, 500);
  };

  // 分页
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchPosts({ page: newPage });
  };

  // 点击帖子查看详情
  const handlePostClick = (postId: string) => {
    setSelectedPostId(postId);
    fetchPost(postId);
  };

  // 返回列表
  const handleBackToList = () => {
    setSelectedPostId(null);
  };

  // 刷新
  const handleRefresh = () => {
    fetchPosts({ page });
  };

  // 详情页模式
  if (selectedPostId) {
    return <PostDetail postId={selectedPostId} onBack={handleBackToList} />;
  }

  return (
    <div className="space-y-5">
      {/* 搜索和筛选栏 */}
      <Card padding="md">
        <div className="flex flex-col gap-4">
          {/* 搜索框 */}
          <Input
            placeholder={t('communityPages:browse.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            fullWidth
          />

          {/* 类型筛选 + 排序 + 视图切换 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* 类型筛选 */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-xl p-1">
              {TYPE_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => {
                    setPostTypeFilter(filter.key);
                    setPage(1);
                  }}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                    postTypeFilter === filter.key
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                  )}
                >
                  {filter.icon && <filter.icon className="w-3.5 h-3.5" />}
                  {t(filter.labelKey)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* 排序切换 */}
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
                {SORT_OPTIONS.map((sort) => (
                  <button
                    key={sort.key}
                    onClick={() => {
                      setSortBy(sort.key);
                      setPage(1);
                    }}
                    className={clsx(
                      'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                      sortBy === sort.key
                        ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                    )}
                  >
                    <sort.icon className="w-3 h-3" />
                    {t(sort.labelKey)}
                  </button>
                ))}
              </div>

              {/* 视图切换 */}
              <div className="flex items-center gap-0.5 bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={clsx(
                    'p-1.5 rounded-md transition-all',
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 shadow-sm'
                      : 'text-stone-400 hover:text-stone-600'
                  )}
                  title={t('communityPages:browse.gridView')}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={clsx(
                    'p-1.5 rounded-md transition-all',
                    viewMode === 'list'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 shadow-sm'
                      : 'text-stone-400 hover:text-stone-600'
                  )}
                  title={t('communityPages:browse.listView')}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
              </div>

              {/* 刷新按钮 */}
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 帖子数量提示 */}
      {!postsLoading && postsTotal > 0 && (
        <p className="text-sm text-stone-400">
          {t('communityPages:browse.totalFound', { total: postsTotal })}
        </p>
      )}


      {/* 加载状态 */}
      {postsLoading && posts.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loading size="lg" text={t('communityPages:browse.loading')} />
        </div>
      ) : posts.length === 0 ? (
        /* 空状态 */
        <EmptyState
          icon={<Search className="w-12 h-12" />}
          title={t('communityPages:browse.emptyTitle')}
          description={
            searchQuery
              ? t('communityPages:browse.emptyWithSearch', { query: searchQuery })
              : postTypeFilter !== 'all'
              ? t('communityPages:browse.emptyWithType', { label: t(TYPE_FILTERS.find(f => f.key === postTypeFilter)?.labelKey || '') })
              : t('communityPages:browse.emptyDefault')
          }
        />
      ) : (
        /* 帖子列表 */
        <>
          <div
            className={
              viewMode === 'grid'
                ? 'grid gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'space-y-3'
            }
          >
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={(id) => toggleLike(id)}
                onFavorite={(id) => toggleFavorite(id)}
                onClick={(id) => handlePostClick(id)}
              />
            ))}
          </div>

          {/* 分页 */}
          {postsTotal > 20 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-stone-400">{t('communityPages:browse.totalCount', { total: postsTotal })}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  {t('communityPages:browse.prevPage')}
                </Button>
                <span className="flex items-center px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-sm text-stone-600 dark:text-stone-400">
                  {page}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={posts.length < 20}
                  onClick={() => handlePageChange(page + 1)}
                >
                  {t('communityPages:browse.nextPage')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
