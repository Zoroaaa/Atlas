import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Film, Tv, Send } from 'lucide-react';
import { Modal, Button, TextArea } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { useAuthStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';

interface ShareToCommunityModalProps {
  open: boolean;
  onClose: () => void;
  initialData: {
    postType: 'jav' | 'anime' | 'movie';
    title: string;
    coverImage: string;
    contentData: any;
  };
  onSuccess?: (post: import('@/types/community').CommunityPost) => void;
}

const POST_TYPE_CONFIG = {
  jav: { label: '番号', icon: Film, color: 'text-rose-500' },
  anime: { label: '动漫', icon: Tv, color: 'text-violet-500' },
  movie: { label: '影视', icon: Film, color: 'text-blue-500' },
};

export const ShareToCommunityModal: React.FC<ShareToCommunityModalProps> = ({
  open,
  onClose,
  initialData,
  onSuccess,
}) => {
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const { tags, fetchTags, createPost } = useCommunityStore();

  const [caption, setCaption] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && tags.length === 0) {
      fetchTags();
    }
  }, [open, tags.length, fetchTags]);

  // 重置表单
  useEffect(() => {
    if (!open) {
      setCaption('');
      setSelectedTags([]);
      setSubmitting(false);
    }
  }, [open]);

  const typeConfig = POST_TYPE_CONFIG[initialData.postType];
  const TypeIcon = typeConfig.icon;

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      toast.warning('请先登录');
      return;
    }

    if (caption.trim().length === 0) {
      toast.error('请填写推荐语');
      return;
    }

    if (caption.length > 200) {
      toast.error('推荐语不能超过200字');
      return;
    }

    setSubmitting(true);
    try {
      await createPost({
        postType: initialData.postType,
        title: initialData.title,
        coverImage: initialData.coverImage,
        contentData: typeof initialData.contentData === 'string'
          ? initialData.contentData
          : JSON.stringify(initialData.contentData),
        caption: caption.trim(),
        tags: selectedTags,
      });

      toast.success('分享成功！帖子已发布到社区');
      onClose();
      onSuccess?.({} as any); // 实际数据由store处理
    } catch (error) {
      console.error('发布失败:', error);
      toast.error('发布失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="分享到社区"
      size="lg"
    >
      <div className="space-y-5">
        {/* 预览卡片区 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            预览内容
          </label>
          <div className="flex gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            {/* 封面预览 */}
            <div className="w-24 h-32 rounded-lg overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-700">
              {initialData.coverImage ? (
                <img
                  src={initialData.coverImage}
                  alt={initialData.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <TypeIcon className={clsx('w-8 h-8', typeConfig.color)} />
                </div>
              )}
            </div>

            {/* 信息预览 */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <TypeIcon className={clsx('w-4 h-4', typeConfig.color)} />
                <span className={clsx('text-xs font-medium', typeConfig.color)}>
                  {typeConfig.label}
                </span>
              </div>
              <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
                {initialData.title}
              </h4>
              {caption && (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 italic">
                  "{caption}"
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 推荐语输入 */}
        <TextArea
          label="推荐语 *"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="分享你的发现...（最多200字）"
          rows={3}
          fullWidth
          hint={`${caption.length}/200`}
        />

        {/* 标签选择器 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            选择标签（可选）
          </label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                  selectedTags.includes(tag.id)
                    ? 'text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                )}
                style={
                  selectedTags.includes(tag.id)
                    ? { backgroundColor: tag.tagColor }
                    : undefined
                }
              >
                #{tag.tagName}
              </button>
            ))}
            {tags.length === 0 && (
              <span className="text-sm text-slate-400">暂无可用标签</span>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={submitting}
            disabled={!isAuthenticated || !caption.trim()}
            leftIcon={<Send className="w-4 h-4" />}
          >
            发布分享
          </Button>
        </div>

        {!isAuthenticated && (
          <p className="text-xs text-center text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
            请先登录后再发布分享
          </p>
        )}
      </div>
    </Modal>
  );
};
