import React, { useState } from 'react';
import { Tag as TagIcon, Edit2, Trash2 } from 'lucide-react';
import { Card, Button, Input } from '@/components/ui';
import { communityApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import type { Tag } from '@/types';

export const TagsTab: React.FC<{ tags: Tag[]; onRefresh: () => void }> = ({ tags, onRefresh }) => {
  const toast = useToast();
  const [tagForm, setTagForm] = useState({ name: '', description: '', color: '#3B82F6' });
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!tagForm.name.trim()) { toast.error('请输入标签名称'); return; }
    setSubmitting(true);
    try { await communityApi.createTag(tagForm); toast.success('标签创建成功'); setTagForm({ name: '', description: '', color: '#3B82F6' }); onRefresh(); } catch { toast.error('创建失败'); } finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!editTag) return;
    try { await communityApi.updateTag(editTag.id, { name: tagForm.name, description: tagForm.description, color: tagForm.color }); toast.success('标签更新成功'); setEditTag(null); onRefresh(); } catch { toast.error('更新失败'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此标签吗？')) return;
    try { await communityApi.deleteTag(id); toast.success('删除成功'); onRefresh(); } catch (e: any) { toast.error(e?.message || '删除失败'); }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="font-semibold text-surface-900 dark:text-surface-100 mb-4">
          {editTag ? `编辑标签: ${editTag.name}` : '创建新标签'}
        </h3>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]">
            <Input label="标签名称" value={tagForm.name} onChange={e => setTagForm(f => ({ ...f, name: e.target.value }))} placeholder="输入标签名称..." fullWidth />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Input label="描述（可选）" value={tagForm.description} onChange={e => setTagForm(f => ({ ...f, description: e.target.value }))} placeholder="标签说明..." fullWidth />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">颜色</label>
            <input type="color" value={tagForm.color} onChange={e => setTagForm(f => ({ ...f, color: e.target.value }))} className="h-10 w-16 rounded-lg border border-surface-300 dark:border-surface-600 cursor-pointer" />
          </div>
          <div className="flex gap-2">
            {editTag && <Button variant="outline" onClick={() => { setEditTag(null); setTagForm({ name: '', description: '', color: '#3B82F6' }); }}>取消</Button>}
            <Button variant="primary" onClick={editTag ? handleUpdate : handleCreate} disabled={submitting}>
              {editTag ? '保存修改' : '创建标签'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tags.map(tag => (
          <Card key={tag.id} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg shadow-sm flex items-center justify-center" style={{ backgroundColor: tag.color + '20', border: `2px solid ${tag.color}50` }}>
                <TagIcon className="w-4 h-4" style={{ color: tag.color }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-surface-900 dark:text-surface-100 text-sm">{tag.name}</span>
                  <span className="px-1.5 py-0.5 text-xs rounded border border-surface-200 dark:border-surface-700 text-surface-500">{tag.usageCount} 次</span>
                </div>
                {tag.description && <p className="text-xs text-surface-500 mt-0.5">{tag.description}</p>}
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => { setEditTag(tag); setTagForm({ name: tag.name, description: tag.description || '', color: tag.color }); }} className="p-1.5 rounded-lg text-surface-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(tag.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </Card>
        ))}
        {tags.length === 0 && <div className="col-span-full text-center py-8 text-surface-400 text-sm">暂无标签，创建第一个标签吧</div>}
      </div>
    </div>
  );
};
