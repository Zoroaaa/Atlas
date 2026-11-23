/**
 * 社区标签页：浏览、按标签筛选、创建、编辑与删除。
 *
 * 权限：后端只允许创建者或管理员改删；这里按同一口径控制按钮可见性，
 * 删除仍以后端「标签未被帖子使用」校验为准。
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Tag as TagIcon, Plus, Search, Hash, Pencil, Trash2 } from 'lucide-react';
import { Card, Button, Input, Loading, EmptyState, Modal } from '@/components/ui';
import { useCommunityStore, useAuthStore } from '@/stores';
import { communityApi, ApiError } from '@/services/api';
import { useToast } from '@/hooks/useNotification';
import type { CommunityTag } from '@/types';

const DEFAULT_TAG_COLOR = '#d4a853';

export const TagsTab: React.FC = () => {
  const { t } = useTranslation(['communityPages', 'errors']);
  const toast = useToast();
  const navigate = useNavigate();
  const { tags, tagsLoading, fetchTags } = useCommunityStore();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagDescription, setNewTagDescription] = useState('');
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLOR);
  const [creating, setCreating] = useState(false);

  const [editingTag, setEditingTag] = useState<CommunityTag | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', color: DEFAULT_TAG_COLOR });
  const [saving, setSaving] = useState(false);
  const [deletingTag, setDeletingTag] = useState<CommunityTag | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const canManage = (tag: CommunityTag): boolean =>
    isAdmin || (!!currentUser?.id && tag.createdBy === currentUser.id);

  const errorMessage = (error: unknown): string =>
    error instanceof ApiError && error.message ? error.message : t('errors:requestFailed');

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error(t('communityPages:tags.nameRequired'));
      return;
    }
    setCreating(true);
    try {
      await communityApi.createTag({
        name: newTagName.trim(),
        description: newTagDescription.trim() || undefined,
        color: newTagColor,
      });
      toast.success(t('communityPages:tags.created', { name: newTagName.trim() }));
      setNewTagName('');
      setNewTagDescription('');
      setShowCreateForm(false);
      await fetchTags();
    } catch (error) {
      toast.error(t('errors:requestFailed'), errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (tag: CommunityTag) => {
    setEditingTag(tag);
    setEditForm({
      name: tag.tagName,
      description: tag.tagDescription || '',
      color: tag.tagColor || DEFAULT_TAG_COLOR,
    });
  };

  const handleUpdateTag = async () => {
    if (!editingTag) return;
    if (!editForm.name.trim()) {
      toast.error(t('communityPages:tags.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await communityApi.updateTag(editingTag.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        color: editForm.color,
      });
      toast.success(t('communityPages:tags.updated', { name: editForm.name.trim() }));
      setEditingTag(null);
      await fetchTags();
    } catch (error) {
      toast.error(t('errors:requestFailed'), errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTag = async () => {
    if (!deletingTag) return;
    setDeleting(true);
    try {
      await communityApi.deleteTag(deletingTag.id);
      toast.success(t('communityPages:tags.deleted', { name: deletingTag.tagName }));
      setDeletingTag(null);
      await fetchTags();
    } catch (error) {
      // 标签仍被帖子使用时后端返回 400，直接展示服务端原因
      toast.error(t('errors:requestFailed'), errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  /** 标签筛选统一走浏览页 query，刷新/分享后仍能保留筛选条件 */
  const handleTagClick = (tag: CommunityTag) => {
    navigate(`/community/browse?tags=${encodeURIComponent(tag.tagName)}`);
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
              <div className="flex-1">
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  {t('communityPages:tags.descriptionLabel')}
                </label>
                <input
                  type="text"
                  value={newTagDescription}
                  onChange={(e) => setNewTagDescription(e.target.value)}
                  placeholder={t('communityPages:tags.descriptionPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
              <Button variant="primary" onClick={handleCreateTag} isLoading={creating} disabled={creating}>{t('communityPages:tags.create')}</Button>
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
              onClick={() => handleTagClick(tag)}
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

              {canManage(tag) && (
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEdit(tag); }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('communityPages:tags.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeletingTag(tag); }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('communityPages:tags.delete')}
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* 编辑标签 */}
      <Modal isOpen={!!editingTag} onClose={() => setEditingTag(null)} title={t('communityPages:tags.editTitle')}>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('communityPages:tags.nameLabel')}
            </label>
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder={t('communityPages:tags.namePlaceholder')}
              fullWidth
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('communityPages:tags.descriptionLabel')}
            </label>
            <Input
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder={t('communityPages:tags.descriptionPlaceholder')}
              fullWidth
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('communityPages:tags.colorLabel')}
            </label>
            <input
              type="color"
              value={editForm.color}
              onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
              className="h-10 w-16 cursor-pointer rounded-lg border border-stone-300 dark:border-stone-600"
            />
          </div>
          <p className="text-xs text-stone-400">{t('communityPages:tags.renameHint')}</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingTag(null)}>{t('communityPages:tags.cancel')}</Button>
            <Button variant="primary" onClick={handleUpdateTag} isLoading={saving} disabled={saving}>{t('communityPages:tags.save')}</Button>
          </div>
        </div>
      </Modal>

      {/* 删除标签 */}
      <Modal isOpen={!!deletingTag} onClose={() => setDeletingTag(null)} title={t('communityPages:tags.deleteTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t('communityPages:tags.deleteConfirm', { name: deletingTag?.tagName || '' })}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeletingTag(null)}>{t('communityPages:tags.cancel')}</Button>
            <Button variant="primary" onClick={handleDeleteTag} isLoading={deleting} disabled={deleting}>{t('communityPages:tags.delete')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
