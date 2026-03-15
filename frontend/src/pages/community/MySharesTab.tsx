import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { Share2, Download, Heart, Star, Eye, Plus, Edit2, Trash2 } from 'lucide-react';
import { Card, Button, Input, Modal, Loading, EmptyState } from '@/components/ui';
import { communityApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import type { SharedSource, Tag, CreateSharedSourceRequest } from '@/types';
import { Pagination, StatusBadge } from './shared';
import { SourceIcon } from '@/components/ui';

export const MySharesTab: React.FC<{ tags: Tag[]; onRefreshTags: () => void }> = ({ tags }) => {
  const toast = useToast();
  const [sources, setSources] = useState<SharedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [shareModal, setShareModal] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; source: SharedSource | null }>({ open: false, source: null });
  const [shareForm, setShareForm] = useState<CreateSharedSourceRequest>({
    sourceName: '', sourceSubtitle: '', sourceIcon: '', sourceUrlTemplate: '', sourceCategory: '', description: '', tags: [],
  });
  const [userStats, setUserStats] = useState<any>(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await communityApi.getMySources(page, 12, statusFilter || undefined);
      if (res.success && res.data) { setSources(res.data.items); setTotalPages(res.data.totalPages); setTotal(res.data.total); }
    } catch { toast.error('加载失败'); } finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => {
    loadSources();
    communityApi.getUserStats().then(r => { if (r.success) setUserStats(r.data); }).catch(() => {});
  }, [loadSources]);

  const handleShare = async () => {
    if (!shareForm.sourceName || !shareForm.sourceUrlTemplate || !shareForm.sourceCategory) { toast.error('请填写必填字段（名称、URL模板、分类）'); return; }
    try {
      const res = await communityApi.createSharedSource(shareForm);
      if (res.success) { toast.success('分享成功！等待审核通过后将会公开显示'); setShareModal(false); setShareForm({ sourceName: '', sourceSubtitle: '', sourceIcon: '', sourceUrlTemplate: '', sourceCategory: '', description: '', tags: [] }); loadSources(); }
    } catch { toast.error('分享失败'); }
  };

  const handleEdit = async () => {
    if (!editModal.source) return;
    try {
      const res = await communityApi.updateSharedSource(editModal.source.id, { sourceName: shareForm.sourceName, description: shareForm.description, tags: shareForm.tags, sourceCategory: shareForm.sourceCategory });
      if (res.success) { toast.success('更新成功'); setEditModal({ open: false, source: null }); loadSources(); }
    } catch { toast.error('更新失败'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此分享吗？')) return;
    try { await communityApi.deleteSharedSource(id); toast.success('已删除'); loadSources(); } catch { toast.error('删除失败'); }
  };

  const openEdit = (source: SharedSource) => {
    setShareForm({ sourceName: source.sourceName, sourceSubtitle: source.sourceSubtitle || '', sourceIcon: source.sourceIcon || '', sourceUrlTemplate: source.sourceUrlTemplate, sourceCategory: source.sourceCategory, description: source.description || '', tags: source.tags || [] });
    setEditModal({ open: true, source });
  };

  const ShareFormContent: React.FC<{ onSubmit: () => void; submitLabel: string }> = ({ onSubmit, submitLabel }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="名称 *" value={shareForm.sourceName} onChange={e => setShareForm(f => ({ ...f, sourceName: e.target.value }))} placeholder="搜索源名称" fullWidth />
        <Input label="副标题" value={shareForm.sourceSubtitle || ''} onChange={e => setShareForm(f => ({ ...f, sourceSubtitle: e.target.value }))} placeholder="简短描述" fullWidth />
      </div>
      <Input label="URL模板 *" value={shareForm.sourceUrlTemplate} onChange={e => setShareForm(f => ({ ...f, sourceUrlTemplate: e.target.value }))} placeholder="https://example.com/search?q={keyword}" fullWidth />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="分类 *" value={shareForm.sourceCategory} onChange={e => setShareForm(f => ({ ...f, sourceCategory: e.target.value }))} placeholder="视频、音乐、软件..." fullWidth />
        <Input label="图标URL" value={shareForm.sourceIcon || ''} onChange={e => setShareForm(f => ({ ...f, sourceIcon: e.target.value }))} placeholder="https://..." fullWidth />
      </div>
      <div>
        <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">描述</label>
        <textarea value={shareForm.description} onChange={e => setShareForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm" placeholder="详细描述搜索源特点..." />
      </div>
      <div>
        <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">标签</label>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <button key={tag.id} type="button" onClick={() => setShareForm(f => ({ ...f, tags: f.tags?.includes(tag.id) ? f.tags.filter(t => t !== tag.id) : [...(f.tags || []), tag.id] }))} className={clsx('px-3 py-1 rounded-full text-sm transition-all', shareForm.tags?.includes(tag.id) ? 'text-white shadow-md' : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600')} style={shareForm.tags?.includes(tag.id) ? { backgroundColor: tag.color } : {}}>
              {tag.name}
            </button>
          ))}
          {tags.length === 0 && <span className="text-sm text-surface-400">暂无标签，可在标签管理中创建</span>}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => { setShareModal(false); setEditModal({ open: false, source: null }); }}>取消</Button>
        <Button variant="primary" onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {userStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '已分享', value: userStats.sharedSources, icon: Share2, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
            { label: '总下载', value: userStats.totalDownloads, icon: Download, color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
            { label: '总点赞', value: userStats.totalLikes, icon: Heart, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
            { label: '平均评分', value: (userStats.avgRating || 0).toFixed(1), icon: Star, color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' },
          ].map(item => (
            <Card key={item.label} className="p-4">
              <div className="flex items-center gap-3">
                <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', item.color)}><item.icon className="w-4 h-4" /></div>
                <div><p className="text-xs text-surface-500">{item.label}</p><p className="text-lg font-bold text-surface-900 dark:text-surface-100">{item.value}</p></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
          <option value="">全部状态</option><option value="active">已通过</option><option value="pending">待审核</option><option value="rejected">已拒绝</option>
        </select>
        <Button variant="primary" onClick={() => { setShareForm({ sourceName: '', sourceSubtitle: '', sourceIcon: '', sourceUrlTemplate: '', sourceCategory: '', description: '', tags: [] }); setShareModal(true); }} leftIcon={<Plus className="w-4 h-4" />}>分享搜索源</Button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loading /></div>
        : sources.length === 0 ? <EmptyState icon={<Share2 className="w-10 h-10" />} title="还没有分享" description="分享你的搜索源，帮助更多人" action={<Button variant="primary" onClick={() => setShareModal(true)}>立即分享</Button>} />
        : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map(source => (
              <Card key={source.id} className="p-4 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <SourceIcon icon={source.sourceIcon} name={source.sourceName} size="md" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-surface-900 dark:text-surface-100 truncate text-sm">{source.sourceName}</h3>
                      <StatusBadge status={source.status} />
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(source)} className="p-1.5 rounded-lg text-surface-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(source.id)} className="p-1.5 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-surface-500 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{source.viewCount}</span>
                  <span className="flex items-center gap-1"><Download className="w-3 h-3" />{source.downloadCount}</span>
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{source.likeCount}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" />{source.ratingScore.toFixed(1)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      <Modal isOpen={shareModal} onClose={() => setShareModal(false)} title="分享搜索源" size="lg">
        <ShareFormContent onSubmit={handleShare} submitLabel="提交分享" />
      </Modal>
      <Modal isOpen={editModal.open} onClose={() => setEditModal({ open: false, source: null })} title="编辑分享" size="lg">
        <ShareFormContent onSubmit={handleEdit} submitLabel="保存修改" />
      </Modal>
    </div>
  );
};
