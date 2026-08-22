import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { Card, Button, Input } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { useAuthStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';

interface CommentsSectionProps {
  postId: string;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({ postId }) => {
  const { t } = useTranslation(['communityPages']);
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const {
    comments,
    commentsLoading,
    fetchComments,
    addComment,
    deleteComment,
  } = useCommunityStore();

  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (postId) {
      fetchComments(postId);
    }
  }, [postId, fetchComments]);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return t('communityPages:comments.justNow');
    if (diff < 3600000) return t('communityPages:comments.minutesAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('communityPages:comments.hoursAgo', { count: Math.floor(diff / 3600000) });
    if (diff < 604800000) return t('communityPages:comments.daysAgo', { count: Math.floor(diff / 86400000) });
    return d.toLocaleDateString('zh-CN');
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      toast.warning(t('communityPages:comments.loginRequired'));
      return;
    }
    if (!commentText.trim()) {
      toast.error(t('communityPages:comments.emptyContent'));
      return;
    }
    if (commentText.length > 500) {
      toast.error(t('communityPages:comments.tooLong'));
      return;
    }

    setSubmitting(true);
    try {
      await addComment({
        postId,
        content: commentText.trim(),
      });
      setCommentText('');
      toast.success(t('communityPages:comments.published'));
    } catch (error) {
      console.error('发表评论失败:', error);
      toast.error(t('communityPages:comments.publishFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm(t('communityPages:comments.deleteConfirm'))) return;
    try {
      await deleteComment(commentId);
      toast.success(t('communityPages:comments.deleted'));
    } catch (error) {
      console.error('删除评论失败:', error);
      toast.error(t('communityPages:comments.deleteFailed'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-stone-500" />
        <h3 className="font-semibold text-stone-900 dark:text-stone-100">
          {t('communityPages:comments.title', { count: comments.length })}
        </h3>
      </div>

      {/* 评论输入框 */}
      <Card padding="sm">
        <div className="flex gap-3">
          <Input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAuthenticated ? t('communityPages:comments.inputPlaceholder') : t('communityPages:comments.inputPlaceholderGuest')}
            disabled={!isAuthenticated || submitting}
            fullWidth
            className="flex-1"
            hint={!isAuthenticated ? undefined : t('communityPages:comments.inputHint', { count: commentText.length })}
          />
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={!isAuthenticated || submitting || !commentText.trim()}
            isLoading={submitting}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* 评论列表 */}
      {commentsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} padding="md">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-stone-200 dark:bg-stone-700 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
                  <div className="h-3 w-full bg-stone-100 dark:bg-stone-800 rounded animate-pulse" />
                  <div className="h-3 w-2/3 bg-stone-100 dark:bg-stone-800 rounded animate-pulse" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <Card padding="lg" className="text-center">
          <MessageSquare className="w-12 h-12 mx-auto text-stone-300 mb-3" />
          <p className="text-sm font-medium text-stone-600 dark:text-stone-400">{t('communityPages:comments.emptyTitle')}</p>
          <p className="text-xs text-stone-400 mt-1">{t('communityPages:comments.emptyDescription')}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <Card key={comment.id} padding="md" className="hover:shadow-md transition-shadow">
              <div className="flex gap-3">
                {/* 头像 */}
                {comment.userAvatar ? (
                  <img
                    src={comment.userAvatar}
                    alt={comment.userName}
                    className="w-9 h-9 rounded-full object-cover ring-1 ring-stone-200 dark:ring-stone-700 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {comment.userName?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}

                {/* 内容区 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                      {comment.userName || t('communityPages:comments.anonymous')}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-stone-400 whitespace-nowrap">
                        {formatDate(comment.createdAt)}
                      </span>
                      {/* 删除按钮 - 仅自己的评论显示 */}
                      {isAuthenticated && (
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className={clsx(
                            'p-1 rounded-lg transition-all',
                            'text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                          )}
                          title={t('communityPages:comments.deleteButton')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed break-words">
                    {comment.content}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
