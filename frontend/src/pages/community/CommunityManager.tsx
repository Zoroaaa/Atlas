import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useLocation } from 'react-router-dom';
import { communityApi, sourceApi } from '@/services/api';
import type { Tag as TagType, CommunityStats, SharedSource, CreateSourceRequest } from '@/types';
import { BrowseTab } from './BrowseTab';
import { MySharesTab } from './MySharesTab';
import { FavoritesTab } from './FavoritesTab';
import { TagsTab } from './TagsTab';
import { TrendingTab } from './TrendingTab';
import { NotificationsTab } from './NotificationsTab';
import { StatsBanner } from './StatsBanner';
import { Modal, Button } from '@/components/ui';

export const CommunityManager: React.FC = () => {
  const toast = useToast();
  const location = useLocation();

  const getTabFromPath = () => {
    const p = location.pathname;
    if (p.includes('/my-shares')) return 'my-shares';
    if (p.includes('/my-favorites')) return 'favorites';
    if (p.includes('/tags')) return 'tags';
    if (p.includes('/trending')) return 'trending';
    if (p.includes('/reports')) return 'notifications';
    return 'browse';
  };

  const [activeTab, setActiveTab] = useState(getTabFromPath);
  const [tags, setTags] = useState<TagType[]>([]);
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Import modal state
  const [importModal, setImportModal] = useState<{ open: boolean; source: SharedSource | null }>({ open: false, source: null });
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [importForm, setImportForm] = useState({
    categoryId: '',
    name: '',
    subtitle: '',
    description: '',
    icon: '',
    urlTemplate: '',
    homepageUrl: '',
  });
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => { setActiveTab(getTabFromPath()); }, [location.pathname]);

  const loadTags = useCallback(async () => {
    try {
      const res = await communityApi.getTags();
      if (res.success) setTags(res.data);
    } catch (_error) {
      console.error('加载标签失败:', _error);
    }
  }, []);

  useEffect(() => {
    loadTags();
    communityApi.getCommunityStats()
      .then(r => { if (r.success) setCommunityStats(r.data); })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [loadTags]);

  useEffect(() => {
    sourceApi.getCategories().then((res: any) => {
      if (res.success && res.data) {
        setCategories(res.data.map((c: any) => ({ id: c.id, name: c.name })));
      }
    }).catch(() => {});
  }, []);

  const handleOpenImport = useCallback((source: SharedSource) => {
    setImportForm({
      categoryId: '',
      name: source.sourceName,
      subtitle: source.sourceSubtitle || '',
      description: source.description || '',
      icon: source.sourceIcon || '',
      urlTemplate: source.sourceUrlTemplate,
      homepageUrl: '',
    });
    setImportModal({ open: true, source });
  }, []);

  const handleImportSubmit = async () => {
    if (!importModal.source) return;
    if (!importForm.categoryId) { toast.error('请选择分类'); return; }
    if (!importForm.name.trim()) { toast.error('请填写名称'); return; }
    if (!importForm.urlTemplate.trim()) { toast.error('请填写URL模板'); return; }
    setImportLoading(true);
    try {
      await communityApi.downloadSharedSource(importModal.source.id);
      const createData: CreateSourceRequest = {
        categoryId: importForm.categoryId,
        name: importForm.name,
        subtitle: importForm.subtitle || undefined,
        description: importForm.description || undefined,
        icon: importForm.icon || undefined,
        urlTemplate: importForm.urlTemplate,
        homepageUrl: importForm.homepageUrl || undefined,
      };
      const res = await sourceApi.createSource(createData);
      if (res.success) {
        toast.success('导入成功！搜索源已添加到你的搜索源列表');
        setImportModal({ open: false, source: null });
      } else {
        toast.error('导入失败，请重试');
      }
    } catch (err: any) {
      toast.error(err?.message || '导入失败，请稍后重试');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {!statsLoading && activeTab === 'browse' && <StatsBanner stats={communityStats} />}

      {activeTab === 'browse' && <BrowseTab tags={tags} onImport={handleOpenImport} />}
      {activeTab === 'my-shares' && <MySharesTab tags={tags} onRefreshTags={loadTags} />}
      {activeTab === 'favorites' && <FavoritesTab tags={tags} onImport={handleOpenImport} />}
      {activeTab === 'tags' && <TagsTab tags={tags} onRefresh={loadTags} />}
      {activeTab === 'trending' && <TrendingTab tags={tags} onImport={handleOpenImport} />}
      {activeTab === 'notifications' && <NotificationsTab />}

      {/* 导入弹窗：统一管理 */}
      <Modal isOpen={importModal.open} onClose={() => setImportModal({ open: false, source: null })} title="导入搜索源" size="md">
        {importModal.source && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
              将 <span className="font-semibold">「{importModal.source.sourceName}」</span> 导入到你的搜索源管理，请确认或修改以下信息：
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                分类 <span className="text-red-500">*</span>
              </label>
              <select
                value={importForm.categoryId}
                onChange={e => setImportForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
              >
                <option value="">请选择分类</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={importForm.name}
                onChange={e => setImportForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">副标题</label>
              <input
                type="text"
                value={importForm.subtitle}
                onChange={e => setImportForm(f => ({ ...f, subtitle: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                URL 模板 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={importForm.urlTemplate}
                onChange={e => setImportForm(f => ({ ...f, urlTemplate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm font-mono"
              />
              <p className="text-xs text-surface-400 mt-1">使用 {'{keyword}'} 作为搜索词占位符</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">主页链接</label>
              <input
                type="text"
                value={importForm.homepageUrl}
                onChange={e => setImportForm(f => ({ ...f, homepageUrl: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
                placeholder="https://..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setImportModal({ open: false, source: null })}>取消</Button>
              <Button
                variant="primary"
                onClick={handleImportSubmit}
                disabled={importLoading}
              >
                {importLoading ? '导入中...' : '确认导入'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
