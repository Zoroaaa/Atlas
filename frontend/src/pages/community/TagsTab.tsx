import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag as TagIcon, Plus, Search, Hash } from 'lucide-react';
import { Card, Button, Input, Loading, EmptyState } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { useToast } from '@/components/ui/Toast';

export const TagsTab: React.FC = () => {
  const { t } = useTranslation(['communityPages']);
  const toast = useToast();
  const { tags, tagsLoading, fetchTags } = useCommunityStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#d4a853');

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // 筛选标签
  const filteredTags = searchQuery.trim()
    ? tags.filter(tag =>
        tag.tagName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tag.tagDescription || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tags;

  // 按帖子数量降序（多的在前）
  const sortedTags = [...filteredTags].sort((a, b) => (b.postsCount || 0) - (a.postsCount || 0));

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error(t('communityPages:tags.nameRequired'));
      return;
    }
    // 这里可以调用创建标签API
    // 暂时只做前端提示
    toast.success(t('communityPages:tags.created', { name: newTagName }));
    setNewTagName('');
    setShowCreateForm(false);
  };

  const handleTagClick = (_tagId: string, _tagName: string) => {
    // 可以通过事件或回调通知父组件筛选帖子
    // 这里简单实现：切换到浏览tab并设置筛选
    window.location.hash = '#browse';
    // 可以通过store或context传递筛选条件
  };

  if (tagsLoading && tags.length === 0) {
    return <div className="flex justify-center py-12"><Loading /></div>;
  }

  return (
    <div className="space-y-5">
      {/* 搜索和创建栏 */}
      <Card padding="md">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder={t('communityPages:tags.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
              fullWidth
            />
          </div>
          <Button
            variant={showCreateForm ? 'outline' : 'primary'}
            size="md"
            onClick={() => setShowCreateForm(!showCreateForm)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {showCreateForm ? t('communityPages:tags.cancel') : t('communityPages:tags.createTag')}
          </Button>
        </div>

        {/* 新建标签表单 */}
        {showCreateForm && (
          <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-700 space-y-3">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  {t('communityPages:tags.nameLabel')}
                </label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder={t('communityPages:tags.namePlaceholder')}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">{t('communityPages:tags.colorLabel')}</label>
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="h-10 w-16 rounded-lg border border-stone-300 dark:border-stone-600 cursor-pointer"
                />
              </div>
              <Button variant="primary" onClick={handleCreateTag}>{t('communityPages:tags.create')}</Button>
            </div>
          </div>
        )}
      </Card>

      {/* 标签统计 */}
      {!tagsLoading && tags.length > 0 && (
        <p className="text-sm text-stone-400">
          {t('communityPages:tags.totalCount', { count: tags.length })}
          {searchQuery && t('communityPages:tags.searchResult', { count: sortedTags.length })}
        </p>
      )}

      {/* 标签云/列表 */}
      {tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="w-10 h-10" />}
          title={t('communityPages:tags.emptyTitle')}
          description={t('communityPages:tags.emptyDescription')}
          action={
            <Button variant="primary" onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4 mr-1" />
              {t('communityPages:tags.createAction')}
            </Button>
          }
        />
      ) : sortedTags.length === 0 ? (
        <EmptyState
          icon={<Search className="w-10 h-10" />}
          title={t('communityPages:tags.noMatchTitle')}
          description={t('communityPages:tags.noMatchDescription', { query: searchQuery })}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortedTags.map(tag => (
            <Card
              key={tag.id}
              padding="md"
              hover
              onClick={() => handleTagClick(tag.id, tag.tagName)}
              className="group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {/* 标签颜色标识 */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: tag.tagColor + '15',
                    border: `2px solid ${tag.tagColor}40`,
                  }}
                >
                  <Hash className="w-5 h-5" style={{ color: tag.tagColor }} />
                </div>

                {/* 标签信息 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate"
                      style={{ color: tag.tagColor }}
                    >
                      #{tag.tagName}
                    </span>
                  </div>
                  {tag.tagDescription && (
                    <p className="text-xs text-stone-500 line-clamp-1">{tag.tagDescription}</p>
                  )}
                </div>

                {/* 使用数 */}
                <div className="shrink-0 px-2 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-xs text-stone-500 group-hover:bg-stone-200 dark:group-hover:bg-stone-700 transition-colors">
                  {t('communityPages:tags.postCount', { count: tag.postsCount || 0 })}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
