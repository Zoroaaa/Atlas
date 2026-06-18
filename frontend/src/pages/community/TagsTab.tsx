import React, { useState, useEffect } from 'react';
import { Tag as TagIcon, Plus, Search, Hash } from 'lucide-react';
import { Card, Button, Input, Loading, EmptyState } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { useToast } from '@/components/ui/Toast';

export const TagsTab: React.FC = () => {
  const toast = useToast();
  const { tags, tagsLoading, fetchTags } = useCommunityStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');

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
      toast.error('请输入标签名称');
      return;
    }
    // 这里可以调用创建标签API
    // 暂时只做前端提示
    toast.success(`标签 "${newTagName}" 创建成功（演示）`);
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
              placeholder="搜索标签..."
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
            {showCreateForm ? '取消' : '新建标签'}
          </Button>
        </div>

        {/* 新建标签表单 */}
        {showCreateForm && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  标签名称 *
                </label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="输入标签名称"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">颜色</label>
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="h-10 w-16 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                />
              </div>
              <Button variant="primary" onClick={handleCreateTag}>创建</Button>
            </div>
          </div>
        )}
      </Card>

      {/* 标签统计 */}
      {!tagsLoading && tags.length > 0 && (
        <p className="text-sm text-slate-400">
          共 <span className="font-semibold text-slate-600">{tags.length}</span> 个标签
          {searchQuery && `（搜索结果：${sortedTags.length}）`}
        </p>
      )}

      {/* 标签云/列表 */}
      {tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="w-10 h-10" />}
          title="暂无标签"
          description="社区还没有任何标签，创建第一个标签吧"
          action={
            <Button variant="primary" onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4 mr-1" />
              创建标签
            </Button>
          }
        />
      ) : sortedTags.length === 0 ? (
        <EmptyState
          icon={<Search className="w-10 h-10" />}
          title="没有匹配的标签"
          description={`没有找到与 "${searchQuery}" 相关的标签`}
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
                      className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate"
                      style={{ color: tag.tagColor }}
                    >
                      #{tag.tagName}
                    </span>
                  </div>
                  {tag.tagDescription && (
                    <p className="text-xs text-slate-500 line-clamp-1">{tag.tagDescription}</p>
                  )}
                </div>

                {/* 使用数 */}
                <div className="shrink-0 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors">
                  {tag.postsCount || 0} 帖子
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
