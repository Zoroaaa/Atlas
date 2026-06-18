import React, { useState, useEffect } from 'react';
import { Heart, RefreshCw, Compass } from 'lucide-react';
import { Button, Loading, EmptyState } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { useAuthStore } from '@/stores';
import { PostCard } from './PostCard';

export const FavoritesTab: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const {
    myFavorites,
    postsLoading,
    fetchMyFavorites,
    toggleFavorite,
  } = useCommunityStore();

  const [page, setPage] = useState(1);

  // 合并初始加载与分页为单个 effect，避免挂载时重复请求
  useEffect(() => {
    if (isAuthenticated) {
      fetchMyFavorites({ page });
    }
  }, [page, isAuthenticated, fetchMyFavorites]);

  const handleRefresh = () => {
    fetchMyFavorites({ page });
  };

  const handleUnfavorite = async (postId: string) => {
    await toggleFavorite(postId);
    // 刷新列表以反映变化
    setTimeout(() => fetchMyFavorites({ page }), 300);
  };

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<Heart className="w-10 h-10" />}
        title="请先登录"
        description="登录后可查看你收藏的帖子"
      />
    );
  }

  if (postsLoading && myFavorites.length === 0) {
    return <div className="flex justify-center py-12"><Loading /></div>;
  }

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Heart className="w-4 h-4 text-red-400" />
          <span>我的收藏</span>
          {myFavorites.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-medium">
              {myFavorites.length}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" />刷新
        </Button>
      </div>

      {/* 收藏列表 */}
      {myFavorites.length === 0 ? (
        <EmptyState
          icon={<Heart className="w-10 h-10" />}
          title="还没有收藏"
          description="在社区浏览时点击收藏按钮，喜欢的帖子将出现在这里"
          action={
            <Button variant="primary" onClick={() => window.location.hash = '#browse'}>
              <Compass className="w-4 h-4 mr-1" />
              去浏览
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {myFavorites.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLike={() => {} /* 收藏页不处理点赞，可扩展 */}
                onFavorite={(id) => handleUnfavorite(id)}
              />
            ))}
          </div>

          {/* 分页 */}
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >上一页</Button>
            <span className="mx-3 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-600">{page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={myFavorites.length < 20}
              onClick={() => setPage(p => p + 1)}
            >下一页</Button>
          </div>
        </>
      )}
    </div>
  );
};
