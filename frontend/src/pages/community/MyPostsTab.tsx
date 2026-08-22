import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

const STATUS_CONFIG: Record<string, { labelKey: string; value: string }> = {
  all: { labelKey: 'statusAll', value: '' },
  active: { labelKey: 'statusActive', value: 'active' },
  pending: { labelKey: 'statusPending', value: 'pending' },
  rejected: { labelKey: 'statusRejected', value: 'rejected' },
};

const STATUS_BADGE: Record<string, { labelKey: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
  active: { labelKey: 'statusActive', variant: 'success' },
  pending: { labelKey: 'statusPending', variant: 'warning' },
  rejected: { labelKey: 'statusRejected', variant: 'error' },
  hidden: { labelKey: 'statusHidden', variant: 'default' },
};

export const MyPostsTab: React.FC = () => {
  const { t } = useTranslation(['communityPages']);
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
      toast.success(t('communityPages:myPosts.updateSuccess'));
      setEditModal({ open: false, post: null });
      handleRefresh();
    } catch (error) {
      console.error('更新失败:', error);
      toast.error(t('communityPages:myPosts.updateFailed'));
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm(t('communityPages:myPosts.deleteConfirm'))) return;
    try {
      await deletePost(postId);
      toast.success(t('communityPages:myPosts.deleted'));
      handleRefresh();
    } catch (error) {
      console.error('删除失败:', error);
      toast.error(t('communityPages:myPosts.deleteFailed'));
    }
  };

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<FileText className="w-10 h-10" />}
        title={t('communityPages:myPosts.loginRequiredTitle')}
        description={t('communityPages:myPosts.loginRequiredDescription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* 用户统计卡片 */}
      {userStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { labelKey: 'communityPages:myPosts.statPostsCount', value: userStats.postsCount, icon: FileText, color: 'text-amber-700 bg-amber-50 dark:bg-amber-900/20' },
            { labelKey: 'communityPages:myPosts.statLikesReceived', value: userStats.likesReceived, icon: Heart, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
            { labelKey: 'communityPages:myPosts.statFavoritesReceived', value: userStats.favoritesReceived, icon: Bookmark, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
            { labelKey: 'communityPages:myPosts.statCommentsCount', value: userStats.commentsCount, icon: MessageSquare, color: 'text-rose-700 bg-rose-50 dark:bg-rose-900/20' },
          ].map(item => (
            <Card key={item.labelKey} padding="md">
              <div className="flex items-center gap-3">
                <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', item.color)}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-stone-400">{t(item.labelKey)}</p>
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
              {t(`communityPages:myPosts.${config.labelKey}`)}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" />{t('communityPages:myPosts.refresh')}
        </Button>
      </div>

      {/* 帖子列表 */}
      {postsLoading && myPosts.length === 0 ? (
        <div className="flex justify-center py-12"><Loading /></div>
      ) : myPosts.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-10 h-10" />}
          title={t('communityPages:myPosts.emptyTitle')}
          description={statusFilter
            ? t('communityPages:myPosts.emptyWithFilter', { label: t(`communityPages:myPosts.${STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG]?.labelKey || 'statusAll'}`) })
            : t('communityPages:myPosts.emptyDefault')}
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
                          {STATUS_BADGE[post.status]
                            ? t(`communityPages:myPosts.${STATUS_BADGE[post.status].labelKey}`)
                            : post.status}
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
                          title={t('communityPages:myPosts.edit')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        title={t('communityPages:myPosts.delete')}
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
            >{t('communityPages:myPosts.prevPage')}</Button>
            <span className="mx-3 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-sm text-stone-600">{page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={myPosts.length < 20}
              onClick={() => setPage(p => p + 1)}
            >{t('communityPages:myPosts.nextPage')}</Button>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      <Modal
        isOpen={editModal.open}
        onClose={() => setEditModal({ open: false, post: null })}
        title={t('communityPages:myPosts.editTitle')}
        size="md"
      >
        {editModal.post && (
          <div className="space-y-4">
            <TextArea
              label={t('communityPages:myPosts.captionLabel')}
              value={editForm.caption}
              onChange={(e) => setEditForm(f => ({ ...f, caption: e.target.value }))}
              placeholder={t('communityPages:myPosts.captionPlaceholder')}
              rows={3}
              fullWidth
              hint={t('communityPages:myPosts.captionHint', { count: editForm.caption.length })}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditModal({ open: false, post: null })}>{t('communityPages:myPosts.cancel')}</Button>
              <Button variant="primary" onClick={handleEditSave}>{t('communityPages:myPosts.save')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
