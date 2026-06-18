import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Plus,
  Search,
  Edit,
  Trash2,
  RefreshCw,
  Download,
  CheckCircle,
  XCircle,
  Tag,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  FolderOpen,
  Shield,
  LockKeyhole,
  Activity,
  Zap,
} from 'lucide-react';
import { Card, Button, Input, Badge, Modal, Loading, EmptyState, SourceIcon, Dropdown } from '@/components/ui';
import { sourceApi } from '@/services/api';
import { useNotification } from '@/hooks';
import { useAuthStore } from '@/stores';
import type { 
  SearchSource, 
  MajorCategory, 
  Category, 
  UserSourceConfig,
  SourceStats,
  CreateSourceRequest,
  UpdateSourceRequest,
} from '@/types';

interface CategoryWithSources extends Category {
  sources: Array<SearchSource & { userConfig?: UserSourceConfig | null }>;
  enabledCount: number;
  totalCount: number;
  isAllEnabled: boolean;
  isAllDisabled: boolean;
}

interface MajorCategoryWithCategories extends MajorCategory {
  categories: CategoryWithSources[];
  enabledCount: number;
  totalCount: number;
  isAllEnabled: boolean;
  isAllDisabled: boolean;
}

export const SourceManager: React.FC = () => {
  const notification = useNotification();
  const { user } = useAuthStore();
  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');
  
  const [sources, setSources] = useState<Array<SearchSource & { userConfig?: UserSourceConfig | null }>>([]);
  const [majorCategories, setMajorCategories] = useState<MajorCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<SourceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMajorCategories, setExpandedMajorCategories] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  const [editModal, setEditModal] = useState<{ isOpen: boolean; source: SearchSource | null }>({
    isOpen: false,
    source: null,
  });
  const [createModal, setCreateModal] = useState(false);
  
  const [formData, setFormData] = useState<CreateSourceRequest>({
    name: '',
    subtitle: '',
    description: '',
    icon: '',
    urlTemplate: '',
    homepageUrl: '',
    categoryId: '',
    searchable: true,
    searchPriority: 0,
  });
  
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const [batchCheckResults, setBatchCheckResults] = useState<Record<string, {
    status: string;
    available: boolean;
    responseTime: number;
    error: string | null;
  }>>({});

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const sourcesRes = await sourceApi.getSourcesWithUserConfig();
      if (sourcesRes.success && sourcesRes.data) {
        setSources(sourcesRes.data);
      }

      const majorCategoriesRes = await sourceApi.getMajorCategories();
      if (majorCategoriesRes.success && majorCategoriesRes.data) {
        setMajorCategories(majorCategoriesRes.data);
        setExpandedMajorCategories(new Set(majorCategoriesRes.data.map(m => m.id)));
      }

      const categoriesRes = await sourceApi.getCategories();
      if (categoriesRes.success && categoriesRes.data) {
        setCategories(categoriesRes.data);
        setExpandedCategories(new Set(categoriesRes.data.map(c => c.id)));
      }

      const statsRes = await sourceApi.getSourceStats();
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch (_error) {
      notification.source.loadFailed();
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getMajorCategoriesWithCategories = (): MajorCategoryWithCategories[] => {
    return majorCategories.map(mc => {
      const majorCategoryCategories = categories.filter(c => c.majorCategoryId === mc.id);
      
      const categoriesWithSources: CategoryWithSources[] = majorCategoryCategories.map(cat => {
        const categorySources = sources.filter(s => s.categoryId === cat.id);
        const enabledCount = categorySources.filter(s => s.userConfig?.isEnabled !== false).length;
        
        return {
          ...cat,
          sources: categorySources,
          enabledCount,
          totalCount: categorySources.length,
          isAllEnabled: enabledCount === categorySources.length && categorySources.length > 0,
          isAllDisabled: enabledCount === 0 && categorySources.length > 0,
        };
      }).filter(c => c.sources.length > 0);
      
      const totalSources = categoriesWithSources.reduce((sum, c) => sum + c.totalCount, 0);
      const enabledSources = categoriesWithSources.reduce((sum, c) => sum + c.enabledCount, 0);
      
      return {
        ...mc,
        categories: categoriesWithSources,
        enabledCount: enabledSources,
        totalCount: totalSources,
        isAllEnabled: enabledSources === totalSources && totalSources > 0,
        isAllDisabled: enabledSources === 0 && totalSources > 0,
      };
    }).filter(mc => mc.categories.length > 0);
  };

  const filteredMajorCategories = getMajorCategoriesWithCategories().filter(mc => {
    if (!searchQuery) return true;
    return mc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           mc.categories.some(cat => 
             cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             cat.sources.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
           );
  });

  const handleToggleMajorCategory = async (majorCategoryId: string, enable: boolean) => {
    const mc = getMajorCategoriesWithCategories().find(m => m.id === majorCategoryId);
    if (!mc) return;
    
    const allSources = mc.categories.flatMap(c => c.sources);
    
    try {
      const configs = allSources.map(source => ({
        sourceId: source.id,
        isEnabled: enable,
      }));
      
      await sourceApi.batchUpdateUserSourceConfigs({ configs });
      
      setSources(prev => prev.map(s => 
        allSources.some(as => as.id === s.id)
          ? { ...s, userConfig: { ...s.userConfig, isEnabled: enable } as UserSourceConfig }
          : s
      ));
      
      notification.source.batchEnabled(allSources.length);
    } catch (_error) {
      notification.source.createFailed();
    }
  };

  const handleToggleCategory = async (categoryId: string, enable: boolean) => {
    const cat = getMajorCategoriesWithCategories()
      .flatMap(mc => mc.categories)
      .find(c => c.id === categoryId);
    if (!cat) return;
    
    try {
      const configs = cat.sources.map(source => ({
        sourceId: source.id,
        isEnabled: enable,
      }));
      
      await sourceApi.batchUpdateUserSourceConfigs({ configs });
      
      setSources(prev => prev.map(s => 
        configs.some(c => c.sourceId === s.id)
          ? { ...s, userConfig: { ...s.userConfig, isEnabled: enable } as UserSourceConfig }
          : s
      ));
      
      notification.source.batchEnabled(cat.sources.length);
    } catch (_error) {
      notification.source.createFailed();
    }
  };

  const handleToggleSource = async (sourceId: string, isEnabled: boolean) => {
    try {
      await sourceApi.updateUserSourceConfig(sourceId, { isEnabled });
      setSources(prev => prev.map(s => 
        s.id === sourceId 
          ? { ...s, userConfig: { ...s.userConfig, isEnabled } as UserSourceConfig }
          : s
      ));
      notification.source.enabled(isEnabled ? '搜索源' : undefined);
    } catch (_error) {
      notification.source.createFailed();
    }
  };

  const handleToggleAll = async (enable: boolean) => {
    if (sources.length === 0) return;
    
    try {
      const configs = sources.map(source => ({
        sourceId: source.id,
        isEnabled: enable,
      }));
      
      await sourceApi.batchUpdateUserSourceConfigs({ configs });
      
      setSources(prev => prev.map(s => ({ 
        ...s, 
        userConfig: { ...s.userConfig, isEnabled: enable } as UserSourceConfig 
      })));
      
      notification.source.batchEnabled(sources.length);
    } catch (_error) {
      notification.source.createFailed();
    }
  };

  const handleCreateSource = async () => {
    if (!formData.name || !formData.urlTemplate || !formData.categoryId) {
      notification.common.validationError();
      return;
    }
    
    try {
      const response = await sourceApi.createSource(formData);
      if (response.success) {
        notification.source.created(formData.name);
        setCreateModal(false);
        setFormData({
          name: '',
          subtitle: '',
          description: '',
          icon: '',
          urlTemplate: '',
          homepageUrl: '',
          categoryId: '',
          searchable: true,
          searchPriority: 0,
        });
        loadData();
      }
    } catch (_error) {
        notification.source.createFailed();
    }
  };

  const handleUpdateSource = async () => {
    if (!editModal.source) return;
    
    try {
      const updateData: UpdateSourceRequest = {
        name: formData.name,
        subtitle: formData.subtitle,
        description: formData.description,
        icon: formData.icon,
        urlTemplate: formData.urlTemplate,
        homepageUrl: formData.homepageUrl,
        categoryId: formData.categoryId,
        searchable: formData.searchable,
        searchPriority: formData.searchPriority,
      };
      
      await sourceApi.updateSource(editModal.source.id, updateData);
      notification.source.updated();
      setEditModal({ isOpen: false, source: null });
      loadData();
    } catch (_error) {
      notification.source.updateFailed();
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm('确定要删除这个搜索源吗？此操作不可撤销。')) return;
    
    try {
      await sourceApi.deleteSource(sourceId);
      notification.source.deleted();
      loadData();
    } catch (_error) {
      notification.source.deleteFailed();
    }
  };

  const handleCheckStatus = async (sourceId: string) => {
    try {
      const response = await sourceApi.checkSourceStatus(sourceId);
      if (response.success && response.data) {
        setBatchCheckResults(prev => ({
          ...prev,
          [sourceId]: {
            status: response.data.status,
            available: response.data.available,
            responseTime: response.data.responseTime,
            error: response.data.error,
          }
        }));

        const source = sources.find(s => s.id === sourceId);
        const name = source?.name || '搜索源';

        if (response.data.available) {
          const label = response.data.status === 'restricted'
            ? `${name} 在线（访问受限）`
            : `${name} 在线`;
          notification.source.testSuccess(label, `响应时间 ${response.data.responseTime}ms`);
        } else {
          const reason = response.data.status === 'timeout'
            ? '请求超时'
            : response.data.error || '无法访问';
          notification.source.testFailed(`${name}：${reason}`);
        }
      }
    } catch (_error) {
      const source = sources.find(s => s.id === sourceId);
      notification.source.testFailed(source?.name || '搜索源');
    }
  };

  const handleBatchCheckStatus = async () => {
    // 检查所有源（不限于已启用的），方便用户了解全部状态
    const checkableSources = sources.filter(s => s.searchable || s.homepageUrl);
    if (checkableSources.length === 0) {
      notification.warning('没有可检查的搜索源');
      return;
    }

    setIsBatchChecking(true);
    setBatchCheckResults({});

    let totalAvailable = 0;
    let totalChecked = 0;

    try {
      const sourceIds = checkableSources.map(s => s.id);
      // 每批 20 个并发，后端也并发处理，速度大幅提升
      const batchSize = 20;

      for (let i = 0; i < sourceIds.length; i += batchSize) {
        const batch = sourceIds.slice(i, i + batchSize);
        try {
          const response = await sourceApi.batchCheckSourceStatus(batch);

          if (response.success && response.data) {
            const newResults: Record<string, {
              status: string;
              available: boolean;
              responseTime: number;
              error: string | null;
            }> = {};

            response.data.results.forEach(result => {
              newResults[result.sourceId] = {
                status: result.status,
                available: result.available,
                responseTime: result.responseTime,
                error: result.error,
              };
              if (result.available) totalAvailable++;
              totalChecked++;
            });

            setBatchCheckResults(prev => ({ ...prev, ...newResults }));
          }
        } catch {
          // 单批失败不中断整体流程
        }
      }

      const unavailable = totalChecked - totalAvailable;
      if (unavailable === 0) {
        notification.success('检查完成', `全部 ${totalChecked} 个搜索源均可正常访问 ✓`);
      } else {
        notification.warning(
          `检查完成（${totalAvailable}/${totalChecked} 可用）`,
          `${unavailable} 个搜索源可能无法访问`
        );
      }
    } catch (_error) {
      notification.error('批量检查失败', '请检查网络连接后重试');
    } finally {
      setIsBatchChecking(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv' | 'opml') => {
    try {
      const data = await sourceApi.exportSources(format);
      
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `search-sources-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = data as Blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `search-sources-${Date.now()}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      
      notification.source.exported();
    } catch (_error) {
      notification.source.exportFailed();
    }
  };

  const toggleMajorCategoryExpand = (id: string) => {
    const newExpanded = new Set(expandedMajorCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedMajorCategories(newExpanded);
  };

  const toggleCategoryExpand = (id: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  const getSiteTypeBadge = (siteType: string) => {
    const map: Record<string, { variant: 'primary' | 'accent' | 'default'; label: string }> = {
      search: { variant: 'primary', label: '搜索' },
      browse: { variant: 'accent', label: '浏览' },
      reference: { variant: 'default', label: '参考' },
    };
    return map[siteType] || map.search;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" text="加载搜索源..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              搜索源管理
            </h2>
            <p className="text-surface-500 dark:text-surface-400">
              按大类、分类管理搜索源的启用状态
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleBatchCheckStatus}
              disabled={isBatchChecking}
              leftIcon={isBatchChecking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              className="text-primary-600 border-primary-300 hover:bg-primary-50 dark:border-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/20"
            >
              {isBatchChecking ? '检查中...' : '批量检查'}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleToggleAll(true)}
              leftIcon={<CheckCircle className="w-4 h-4" />}
              className="text-success-600 border-success-300 hover:bg-success-50 dark:border-success-700 dark:text-success-400 dark:hover:bg-success-900/20"
            >
              全部启用
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleToggleAll(false)}
              leftIcon={<XCircle className="w-4 h-4" />}
              className="text-surface-600 border-surface-300 hover:bg-surface-50 dark:border-surface-600 dark:text-surface-400 dark:hover:bg-surface-800"
            >
              全部禁用
            </Button>
          </div>
          <Dropdown
            trigger={
              <Button variant="outline" leftIcon={<Download className="w-4 h-4" />}>
                导出
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            }
            items={[
              { label: '导出为 JSON', onClick: () => handleExport('json') },
              { label: '导出为 CSV', onClick: () => handleExport('csv') },
              { label: '导出为 OPML', onClick: () => handleExport('opml') },
            ]}
          />
          <Button
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateModal(true)}
          >
            添加搜索源
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-surface-500 dark:text-surface-400">总搜索源</p>
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                  {stats.totalSources}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-success-400 to-success-600 flex items-center justify-center shadow-md">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-surface-500 dark:text-surface-400">已启用</p>
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                  {sources.filter(s => s.userConfig?.isEnabled !== false).length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-md">
                <Tag className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-surface-500 dark:text-surface-400">分类数</p>
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                  {stats.totalCategories}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-warning-400 to-warning-600 flex items-center justify-center shadow-md">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-surface-500 dark:text-surface-400">大类数</p>
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                  {stats.totalMajorCategories}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-surface-400" />
          <Input
            placeholder="搜索大类、分类或搜索源..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-5 h-5" />}
            fullWidth
          />
        </div>
      </Card>

      <div className="space-y-4">
        {filteredMajorCategories.map((majorCategory) => {
          const isMajorExpanded = expandedMajorCategories.has(majorCategory.id);
          
          return (
            <Card key={majorCategory.id} className="overflow-hidden border-surface-200/50 dark:border-surface-700/50 shadow-lg">
              <div className="p-4 sm:p-5 bg-gradient-to-r from-surface-50 to-surface-100 dark:from-surface-800/50 dark:to-surface-800">
                <div className="flex items-center gap-3">
                  {/* Expand toggle + icon + title — takes available space */}
                  <button
                    onClick={() => toggleMajorCategoryExpand(majorCategory.id)}
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                  >
                    <ChevronRight className={`w-4 h-4 shrink-0 text-surface-400 transition-transform duration-200 ${isMajorExpanded ? 'rotate-90' : ''}`} />
                    <div 
                      className="w-9 h-9 sm:w-12 sm:h-12 shrink-0 rounded-xl flex items-center justify-center text-white shadow-md"
                      style={{ backgroundColor: majorCategory.color || '#3B82F6' }}
                    >
                      {majorCategory.icon ? (
                        <span className="text-lg sm:text-2xl">{majorCategory.icon}</span>
                      ) : (
                        <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-surface-900 dark:text-surface-100 truncate">
                        {majorCategory.name}
                      </h3>
                      <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400">
                        {majorCategory.categories.length} 个分类 · {majorCategory.totalCount} 个搜索源
                      </p>
                    </div>
                  </button>
                  
                  {/* Controls: shrink-0 so they never wrap into the title */}
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg bg-surface-100 dark:bg-surface-700 text-xs text-surface-600 dark:text-surface-300 whitespace-nowrap">
                      {majorCategory.enabledCount}/{majorCategory.totalCount}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleMajorCategory(majorCategory.id, true); }}
                      className="p-1.5 rounded-lg text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-900/20 transition-all"
                      title="启用全部"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleMajorCategory(majorCategory.id, false); }}
                      className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 transition-all"
                      title="禁用全部"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                    <span className="sm:hidden text-xs text-surface-500">
                      {majorCategory.enabledCount}/{majorCategory.totalCount}
                    </span>
                  </div>
                </div>
              </div>
              
              {isMajorExpanded && (
                <div className="border-t border-surface-200 dark:border-surface-700">
                  {majorCategory.categories.map((category) => {
                    const isCategoryExpanded = expandedCategories.has(category.id);
                    
                    return (
                      <div key={category.id} className="border-b border-surface-100 dark:border-surface-800 last:border-b-0">
                        <div 
                          className="flex items-center justify-between px-4 py-3 sm:pl-12 hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer transition-colors"
                          onClick={() => toggleCategoryExpand(category.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <ChevronRight className={`w-4 h-4 shrink-0 text-surface-400 transition-transform duration-200 ${isCategoryExpanded ? 'rotate-90' : ''}`} />
                            <div 
                              className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-white shadow-sm"
                              style={{ backgroundColor: category.color || '#6366f1' }}
                            >
                              {category.icon ? (
                                <span className="text-sm">{category.icon}</span>
                              ) : (
                                <FolderOpen className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium text-sm text-surface-800 dark:text-surface-200 truncate block">
                                {category.name}
                              </span>
                              <span className="text-xs text-surface-400">
                                {category.totalCount} 个源
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                            <span className="hidden sm:inline text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">
                              {category.enabledCount}/{category.totalCount}
                            </span>
                            <button
                              onClick={() => handleToggleCategory(category.id, true)}
                              className="p-1.5 rounded-lg text-success-600 dark:text-success-400 hover:bg-success-50 dark:hover:bg-success-900/20 transition-all"
                              title="启用全部"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleCategory(category.id, false)}
                              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 transition-all"
                              title="禁用全部"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                            <span className="sm:hidden text-xs text-surface-500">
                              {category.enabledCount}/{category.totalCount}
                            </span>
                          </div>
                        </div>
                        
                        {isCategoryExpanded && (
                          <div className="bg-surface-50/50 dark:bg-surface-900/30">
                            {category.sources.map((source) => {
                              const isEnabled = source.userConfig?.isEnabled !== false;
                              const siteType = getSiteTypeBadge(source.siteType);
                              const checkResult = batchCheckResults[source.id];
                              
                              return (
                                <div 
                                  key={source.id}
                                  className={`px-4 py-3 sm:pl-16 hover:bg-surface-100/50 dark:hover:bg-surface-800/30 transition-colors border-b border-surface-100/80 dark:border-surface-800/50 last:border-b-0 ${
                                    !isEnabled ? 'opacity-60' : ''
                                  }`}
                                >
                                  {/* Mobile: stacked layout; Desktop: single row */}
                                  <div className="flex items-start gap-3">
                                    <div className="shrink-0 mt-0.5">
                                      <SourceIcon
                                        icon={source.icon}
                                        name={source.name}
                                        size="sm"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {/* Name + system badge row */}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                                          {source.userConfig?.customName || source.name}
                                        </p>
                                        <Badge variant={siteType.variant} className="text-xs shrink-0">
                                          {siteType.label}
                                        </Badge>
                                        {source.isSystem && (
                                          <Badge variant="accent" className="flex items-center gap-1 text-xs shrink-0">
                                            <Shield className="w-2.5 h-2.5" />
                                            系统
                                          </Badge>
                                        )}
                                        {checkResult && (() => {
                                          const statusColorClass = checkResult.available
                                            ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                                            : checkResult.status === 'timeout'
                                              ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
                                              : checkResult.status === 'restricted'
                                                ? 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'
                                                : 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400';
                                          const statusLabel = checkResult.available
                                            ? checkResult.status === 'restricted'
                                              ? `受限 ${checkResult.responseTime}ms`
                                              : `在线 ${checkResult.responseTime}ms`
                                            : checkResult.status === 'timeout'
                                              ? '超时'
                                              : checkResult.status === 'offline'
                                                ? '离线'
                                                : checkResult.error || '不可用';
                                          const titleText = checkResult.available
                                            ? checkResult.status === 'restricted'
                                              ? `服务器在线（访问受限），响应 ${checkResult.responseTime}ms`
                                              : `可正常访问，响应时间 ${checkResult.responseTime}ms`
                                            : checkResult.error || '无法访问';
                                          return (
                                            <Badge
                                              variant={checkResult.available ? 'primary' : 'default'}
                                              className={`flex items-center gap-1 text-xs shrink-0 ${statusColorClass}`}
                                              title={titleText}
                                            >
                                              {checkResult.available ? (
                                                <><Zap className="w-2.5 h-2.5" />{statusLabel}</>
                                              ) : (
                                                <><XCircle className="w-2.5 h-2.5" />{statusLabel}</>
                                              )}
                                            </Badge>
                                          );
                                        })()}
                                      </div>
                                      {/* Subtitle */}
                                      {(source.userConfig?.customSubtitle || source.subtitle) && (
                                        <p className="text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">
                                          {source.userConfig?.customSubtitle || source.subtitle}
                                        </p>
                                      )}
                                      {/* Actions row — always on its own line on mobile */}
                                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        <button
                                          onClick={() => handleToggleSource(source.id, !isEnabled)}
                                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                            isEnabled
                                              ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                                              : 'bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-400'
                                          }`}
                                        >
                                          {isEnabled ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                          {isEnabled ? '已启用' : '已禁用'}
                                        </button>
                                        <div className="flex items-center gap-0.5 ml-auto">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCheckStatus(source.id)}
                                            title="检测状态"
                                            className="p-1.5 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                                          >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                          </Button>
                                          {(isAdmin || !source.isSystem) && (
                                            <>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                  setFormData({
                                                    name: source.name,
                                                    subtitle: source.subtitle || '',
                                                    description: source.description || '',
                                                    icon: source.icon || '',
                                                    urlTemplate: source.urlTemplate,
                                                    homepageUrl: source.homepageUrl || '',
                                                    categoryId: source.categoryId,
                                                    searchable: source.searchable,
                                                    searchPriority: source.searchPriority,
                                                  });
                                                  setEditModal({ isOpen: true, source });
                                                }}
                                                title="编辑"
                                                className="p-1.5 hover:bg-accent-50 dark:hover:bg-accent-900/20"
                                              >
                                                <Edit className="w-3.5 h-3.5" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteSource(source.id)}
                                                title="删除"
                                                className="p-1.5 text-error-500 hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-900/20"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </Button>
                                            </>
                                          )}
                                          {source.isSystem && !isAdmin && (
                                            <span title="系统数据，仅管理员可编辑" className="p-1.5">
                                              <LockKeyhole className="w-3.5 h-3.5 text-surface-400" />
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
        
        {filteredMajorCategories.length === 0 && (
          <EmptyState
            icon={<Database className="w-12 h-12" />}
            title="没有找到搜索源"
            description="尝试调整搜索条件或添加新的搜索源"
            action={
              <Button variant="primary" onClick={() => setCreateModal(true)}>
                添加搜索源
              </Button>
            }
          />
        )}
      </div>

      <Modal
        isOpen={createModal || editModal.isOpen}
        onClose={() => {
          setCreateModal(false);
          setEditModal({ isOpen: false, source: null });
          setFormData({
            name: '',
            subtitle: '',
            description: '',
            icon: '',
            urlTemplate: '',
            homepageUrl: '',
            categoryId: '',
            searchable: true,
            searchPriority: 0,
          });
        }}
        title={editModal.isOpen ? '编辑搜索源' : '添加搜索源'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="名称 *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="搜索源名称"
              fullWidth
            />
            <Input
              label="副标题"
              value={formData.subtitle}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="简短描述"
              fullWidth
            />
          </div>
          
          <Input
            label="URL模板 *"
            value={formData.urlTemplate}
            onChange={(e) => setFormData({ ...formData, urlTemplate: e.target.value })}
            placeholder="https://example.com/search?q={keyword}"
            fullWidth
          />
          
          <Input
            label="主页URL"
            value={formData.homepageUrl}
            onChange={(e) => setFormData({ ...formData, homepageUrl: e.target.value })}
            placeholder="https://example.com"
            fullWidth
          />
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                分类 *
              </label>
              <select
                value={formData.categoryId}
                onChange={(e) => {
                  const newCategoryId = e.target.value;
                  const selectedCategory = categories.find(c => c.id === newCategoryId);
                  
                  setFormData({ 
                    ...formData, 
                    categoryId: newCategoryId,
                    searchable: selectedCategory?.defaultSearchable ?? true,
                  });
                }}
                className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
              >
                <option value="">选择分类</option>
                {majorCategories.map(mc => (
                  <optgroup key={mc.id} label={mc.name}>
                    {categories.filter(c => c.majorCategoryId === mc.id).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          
          <Input
            label="图标URL"
            value={formData.icon}
            onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
            placeholder="https://example.com/icon.png"
            fullWidth
          />
          
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="搜索源详细描述"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.searchable}
                onChange={(e) => setFormData({ ...formData, searchable: e.target.checked })}
                className="rounded border-surface-300 dark:border-surface-600"
              />
              <span className="text-sm text-surface-700 dark:text-surface-300">可搜索</span>
            </label>
            <Input
              label="优先级"
              type="number"
              value={formData.searchPriority}
              onChange={(e) => setFormData({ ...formData, searchPriority: parseInt(e.target.value) || 0 })}
              fullWidth
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setCreateModal(false);
                setEditModal({ isOpen: false, source: null });
              }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={editModal.isOpen ? handleUpdateSource : handleCreateSource}
            >
              {editModal.isOpen ? '保存更改' : '创建'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
