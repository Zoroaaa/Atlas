import React, { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import {
  Search,
  Grid3X3,
  LayoutList,
  Film,
  Tv,
  Clock,
  Flame,
  RefreshCw,
} from 'lucide-react';
import { Card, Button, Input, Loading, EmptyState } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { PostCard } from './PostCard';
import { PostDetail } from './PostDetail';


const TYPE_FILTERS = [
  { key: 'all' as const, label: '全部', icon: null },
  { key: 'jav' as const, label: '番号', icon: Film },
  { key: 'anime' as const, label: '动漫', icon: Tv },
  { key: 'movie' as const, label: '影视', icon: Film },
];

const SORT_OPTIONS = [
  { key: 'latest' as const, label: '最新', icon: Clock },
  { key: 'hot' as const, label: '最热', icon: Flame },
];

export const BrowseTab: React.FC = () => {
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
            placeholder="搜索帖子标题、推荐语..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            fullWidth
          />

          {/* 类型筛选 + 排序 + 视图切换 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* 类型筛选 */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
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
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  )}
                >
                  {filter.icon && <filter.icon className="w-3.5 h-3.5" />}
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* 排序切换 */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
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
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    )}
                  >
                    <sort.icon className="w-3 h-3" />
                    {sort.label}
                  </button>
                ))}
              </div>

              {/* 视图切换 */}
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={clsx(
                    'p-1.5 rounded-md transition-all',
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                  title="网格视图"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={clsx(
                    'p-1.5 rounded-md transition-all',
                    viewMode === 'list'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                  title="列表视图"
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
        <p className="text-sm text-slate-400">
          共找到 <span className="font-semibold text-slate-600 dark:text-slate-300">{postsTotal}</span> 个帖子
        </p>
      )}

      {/* 加载状态 */}
      {postsLoading && posts.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loading size="lg" text="加载中..." />
        </div>
      ) : posts.length === 0 ? (
        /* 空状态 */
        <EmptyState
          icon={<Search className="w-12 h-12" />}
          title="暂无帖子"
          description={
            searchQuery
              ? `没有找到与 "${searchQuery}" 相关的帖子`
              : postTypeFilter !== 'all'
              ? `${TYPE_FILTERS.find(f => f.key === postTypeFilter)?.label}分类下还没有帖子`
              : '社区还没有任何分享，快来发布第一个吧'
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
              <span className="text-sm text-slate-400">共 {postsTotal} 条</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  上一页
                </Button>
                <span className="flex items-center px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-400">
                  {page}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={posts.length < 20}
                  onClick={() => handlePageChange(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
