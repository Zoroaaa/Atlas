import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Film, Tv, Send, BookOpen, Users, Library } from 'lucide-react';
import { Modal, Button, TextArea } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { useAuthStore } from '@/stores';
import { useToast } from '@/components/ui/Toast';
import { getBackendBaseUrl } from '@/constants';

interface ShareToCommunityModalProps {
  open: boolean;
  onClose: () => void;
  initialData: {
    postType: 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';
    title: string;
    coverImage: string;
    contentData: any;
  };
  onSuccess?: (post: import('@/types/community').CommunityPost) => void;
}

const POST_TYPE_CONFIG = {
  jav: { icon: Film, color: 'text-rose-500' },
  anime: { icon: Tv, color: 'text-rose-500' },
  movie: { icon: Film, color: 'text-amber-500' },
  manga: { icon: BookOpen, color: 'text-violet-500' },
  novel: { icon: Library, color: 'text-emerald-500' },
  actress: { icon: Users, color: 'text-pink-500' },
};

/**
 * 规范化并重新代理图片URL
 */
const normalizeImageUrl = (url: string): string => {
  if (!url) return '';

  const proxyMatch = url.match(/[?&]url=([^&]+)/);
  if (proxyMatch) {
    const originalUrl = decodeURIComponent(proxyMatch[1]);
    const baseUrl = getBackendBaseUrl();
    return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(originalUrl)}`;
  }

  if (url.startsWith('/')) return url;

  if (url.startsWith('http')) {
    const baseUrl = getBackendBaseUrl();
    return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(url)}`;
  }

  return url;
};

export const ShareToCommunityModal: React.FC<ShareToCommunityModalProps> = ({
  open,
  onClose,
  initialData,
  onSuccess,
}) => {
  const { t } = useTranslation(['communityPages']);
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

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      toast.warning(t('communityPages:shareModal.loginRequired'));
      return;
    }

    if (caption.trim().length === 0) {
      toast.error(t('communityPages:shareModal.captionRequired'));
      return;
    }

    if (caption.length > 200) {
      toast.error(t('communityPages:shareModal.captionTooLong'));
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

      toast.success(t('communityPages:shareModal.published'));
      onClose();
      onSuccess?.({} as any); // 实际数据由store处理
    } catch (error) {
      console.error('发布失败:', error);
      toast.error(t('communityPages:shareModal.publishFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t('communityPages:shareModal.title')}
      size="lg"
    >
      <div className="space-y-5">
        {/* 预览卡片区 */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
            {t('communityPages:shareModal.preview')}
          </label>
          <div className="flex gap-4 p-4 bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-200 dark:border-stone-700">
            {/* 封面预览 */}
            <div className="w-24 h-32 rounded-lg overflow-hidden shrink-0 bg-stone-200 dark:bg-stone-700">
              {initialData.coverImage ? (
                <img
                  src={normalizeImageUrl(initialData.coverImage)}
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
                  {t(`communityPages:shareModal.types.${initialData.postType}`)}
                </span>
              </div>
              <h4 className="font-semibold text-sm text-stone-900 dark:text-stone-100 line-clamp-2 leading-snug">
                {initialData.title}
              </h4>
              {caption && (
                <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 italic">
                  "{caption}"
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 推荐语输入 */}
        <TextArea
          label={t('communityPages:shareModal.captionLabel')}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={t('communityPages:shareModal.captionPlaceholder')}
          rows={3}
          fullWidth
          hint={t('communityPages:shareModal.captionHint', { count: caption.length })}
        />

        {/* 标签选择器 */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
            {t('communityPages:shareModal.tagsLabel')}
          </label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.tagName)}
                className={clsx(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                  selectedTags.includes(tag.tagName)
                    ? 'text-white shadow-md'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                )}
                style={
                  selectedTags.includes(tag.tagName)
                    ? { backgroundColor: tag.tagColor }
                    : undefined
                }
              >
                #{tag.tagName}
              </button>
            ))}
            {tags.length === 0 && (
              <span className="text-sm text-stone-400">{t('communityPages:shareModal.noTags')}</span>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('communityPages:shareModal.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={submitting}
            disabled={!isAuthenticated || !caption.trim()}
            leftIcon={<Send className="w-4 h-4" />}
          >
            {t('communityPages:shareModal.publish')}
          </Button>
        </div>

        {!isAuthenticated && (
          <p className="text-xs text-center text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
            {t('communityPages:shareModal.loginHint')}
          </p>
        )}
      </div>
    </Modal>
  );
};
