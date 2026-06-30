import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import {
  FileText,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  Heart,
  MessageSquare,
  Bookmark,
} from 'lucide-react';
import { Card, Button, Modal, Loading, EmptyState, Badge, TextArea } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { useAuthStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';

const STATUS_CONFIG = {
  all: { label: '全部', value: '' },
  active: { label: '已发布', value: 'active' },
  pending: { label: '审核中', value: 'pending' },
  rejected: { label: '已拒绝', value: 'rejected' },
};

const STATUS_BADGE = {
  active: { label: '已发布', variant: 'success' as const },
  pending: { label: '审核中', variant: 'warning' as const },
  rejected: { label: '已拒绝', variant: 'error' as const },
  hidden: { label: '已隐藏', variant: 'default' as const },
};

export const MyPostsTab: React.FC = () => {
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const {
    myPosts,
    postsLoading,
    userStats,
    fetchMyPosts,
    fetchUserStats,
    updatePost,
    deletePost,
  } = useCommunityStore();

  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editModal, setEditModal] = useState<{ open: boolean; post: any }>({ open: false, post: null });
  const [editForm, setEditForm] = useState({ caption: '', tags: [] as string[] });

  // 合并初始加载、状态筛选变化、分页为单个 effect，避免重复请求
  useEffect(() => {
    if (isAuthenticated) {
      fetchMyPosts({ page, status: statusFilter || undefined });
      // 仅在初始加载或 statusFilter 变化时获取用户统计（分页不需要）
      if (page === 1) fetchUserStats();
    }
  }, [isAuthenticated, fetchMyPosts, fetchUserStats, statusFilter, page]);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleRefresh = () => {
    fetchMyPosts({ page, status: statusFilter || undefined });
  };

  const openEdit = (post: any) => {
    setEditForm({
      caption: post.caption || '',
      tags: Array.isArray(post.tags) ? post.tags.map((t: any) => typeof t === 'string' ? t : t.id || t.tagName || t.name) : [],
    });
    setEditModal({ open: true, post });
  };

  const handleEditSave = async () => {
    if (!editModal.post) return;
    try {
      await updatePost(editModal.post.id, {
        caption: editForm.caption,
        tags: editForm.tags,
      });
      toast.success('更新成功');
      setEditModal({ open: false, post: null });
      handleRefresh();
    } catch (error) {
      console.error('更新失败:', error);
      toast.error('更新失败，请重试');
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('确定要删除这个帖子吗？此操作不可恢复。')) return;
    try {
      await deletePost(postId);
      toast.success('已删除');
      handleRefresh();
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败，请重试');
    }
  };

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<FileText className="w-10 h-10" />}
        title="请先登录"
        description="登录后可查看和管理你发布的帖子"
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* 用户统计卡片 */}
      {userStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '发布帖子', value: userStats.postsCount, icon: FileText, color: 'text-amber-700 bg-amber-50 dark:bg-amber-900/20' },
            { label: '获得点赞', value: userStats.likesReceived, icon: Heart, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
            { label: '被收藏', value: userStats.favoritesReceived, icon: Bookmark, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
            { label: '收到评论', value: userStats.commentsCount, icon: MessageSquare, color: 'text-rose-700 bg-rose-50 dark:bg-rose-900/20' },
          ].map(item => (
            <Card key={item.label} padding="md">
              <div className="flex items-center gap-3">
                <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', item.color)}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-stone-400">{item.label}</p>
                  <p className="text-lg font-bold text-stone-900 dark:text-stone-100">{item.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 筛选和操作栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => handleStatusChange(config.value)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                statusFilter === config.value
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 hover:bg-stone-200 dark:hover:bg-stone-700'
              )}
            >
              {config.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" />刷新
        </Button>
      </div>

      {/* 帖子列表 */}
      {postsLoading && myPosts.length === 0 ? (
        <div className="flex justify-center py-12"><Loading /></div>
      ) : myPosts.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-10 h-10" />}
          title="还没有帖子"
          description={statusFilter ? `${STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG]?.label}的帖子为空` : '分享你的发现，让更多人看到'}
        />
      ) : (
        <div className="space-y-3">
          {myPosts.map(post => (
            <Card key={post.id} padding="md" hover>
              <div className="flex gap-4">
                {/* 封面缩略图 */}
                <div className="w-24 h-16 rounded-lg overflow-hidden shrink-0 bg-stone-100 dark:bg-stone-800">
                  {post.coverImage ? (
                    <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-300">
                      <FileText className="w-6 h-6" />
                    </div>
                  )}
                </div>

                {/* 内容区 */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">{post.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={STATUS_BADGE[post.status]?.variant || 'default'}
                          size="sm"
                        >
                          {STATUS_BADGE[post.status]?.label || post.status}
                        </Badge>
                        <span className="text-xs text-stone-400 uppercase">{post.postType}</span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-1 shrink-0">
                      {(post.status === 'active' || post.status === 'rejected') && (
                        <button
                          onClick={() => openEdit(post)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                          title="编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 推荐语 */}
                  {post.caption && (
                    <p className="text-xs text-stone-500 line-clamp-2 mt-1 flex-1">{post.caption}</p>
                  )}

                  {/* 底部数据 */}
                  <div className="flex items-center gap-4 pt-2 mt-auto border-t border-stone-100 dark:border-stone-800/50 text-xs text-stone-400">
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.viewCount}</span>
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likeCount}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.commentCount}</span>
                    <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" />{post.favoriteCount}</span>
                    <span className="ml-auto text-stone-400">
                      {new Date(post.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {/* 分页 */}
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >上一页</Button>
            <span className="mx-3 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-sm text-stone-600">{page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={myPosts.length < 20}
              onClick={() => setPage(p => p + 1)}
            >下一页</Button>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      <Modal
        isOpen={editModal.open}
        onClose={() => setEditModal({ open: false, post: null })}
        title="编辑帖子"
        size="md"
      >
        {editModal.post && (
          <div className="space-y-4">
            <TextArea
              label="推荐语"
              value={editForm.caption}
              onChange={(e) => setEditForm(f => ({ ...f, caption: e.target.value }))}
              placeholder="修改推荐语..."
              rows={3}
              fullWidth
              hint={`${editForm.caption.length}/200`}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditModal({ open: false, post: null })}>取消</Button>
              <Button variant="primary" onClick={handleEditSave}>保存修改</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
