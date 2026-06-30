import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { Card, Button, Input } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { useAuthStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';

interface CommentsSectionProps {
  postId: string;
}

const formatDate = (timestamp: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return d.toLocaleDateString('zh-CN');
};

export const CommentsSection: React.FC<CommentsSectionProps> = ({ postId }) => {
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

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      toast.warning('请先登录');
      return;
    }
    if (!commentText.trim()) {
      toast.error('请输入评论内容');
      return;
    }
    if (commentText.length > 500) {
      toast.error('评论内容不能超过500字');
      return;
    }

    setSubmitting(true);
    try {
      await addComment({
        postId,
        content: commentText.trim(),
      });
      setCommentText('');
      toast.success('评论发表成功');
    } catch (error) {
      console.error('发表评论失败:', error);
      toast.error('发表失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('确定要删除这条评论吗？')) return;
    try {
      await deleteComment(commentId);
      toast.success('已删除');
    } catch (error) {
      console.error('删除评论失败:', error);
      toast.error('删除失败，请重试');
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
          评论 ({comments.length})
        </h3>
      </div>

      {/* 评论输入框 */}
      <Card padding="sm">
        <div className="flex gap-3">
          <Input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAuthenticated ? '写下你的想法...（Ctrl+Enter 发送）' : '登录后即可参与讨论'}
            disabled={!isAuthenticated || submitting}
            fullWidth
            className="flex-1"
            hint={!isAuthenticated ? undefined : `${commentText.length}/500`}
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
          <p className="text-sm font-medium text-stone-600 dark:text-stone-400">快来发表第一条评论</p>
          <p className="text-xs text-stone-400 mt-1">分享你的看法和感受</p>
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
                      {comment.userName || '匿名用户'}
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
                          title="删除评论"
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
