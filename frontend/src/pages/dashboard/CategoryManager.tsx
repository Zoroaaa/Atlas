import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Plus,
  Edit,
  Trash2,
  ChevronRight,
  FolderOpen,
  Layers,
  Search,
  MoreVertical,
  Shield,
  Lock,
} from 'lucide-react';
import { Card, Button, Input, Badge, Modal, Loading, EmptyState, Dropdown } from '@/components/ui';
import { sourceApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores';
import type { 
  MajorCategory, 
  Category, 
  CreateMajorCategoryRequest,
  UpdateMajorCategoryRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '@/types';

export const CategoryManager: React.FC = () => {
  const toast = useToast();
  const { user } = useAuthStore();
  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');
  
  const [majorCategories, setMajorCategories] = useState<MajorCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedMajor, setExpandedMajor] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  
  const [majorCategoryModal, setMajorCategoryModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    data: MajorCategory | null;
  }>({ isOpen: false, mode: 'create', data: null });
  
  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    data: Category | null;
    majorCategoryId: string | null;
  }>({ isOpen: false, mode: 'create', data: null, majorCategoryId: null });
  
  const [majorCategoryForm, setMajorCategoryForm] = useState<CreateMajorCategoryRequest>({
    name: '',
    description: '',
    icon: '',
    color: '#3B82F6',
    requiresKeyword: true,
  });
  
  const [categoryForm, setCategoryForm] = useState<CreateCategoryRequest>({
    majorCategoryId: '',
    name: '',
    description: '',
    icon: '',
    color: '#3B82F6',
    defaultSearchable: true,
    defaultSiteType: 'search',
    searchPriority: 0,
  });

  const loadData = useCallback(async (preserveExpandedState = false) => {
    setIsLoading(true);
    try {
      const majorCategoriesRes = await sourceApi.getMajorCategories();
      if (majorCategoriesRes.success && majorCategoriesRes.data) {
        setMajorCategories(majorCategoriesRes.data);
        if (!preserveExpandedState) {
          setExpandedMajor(new Set(majorCategoriesRes.data.map(m => m.id)));
        }
      }
      
      const categoriesRes = await sourceApi.getCategories();
      if (categoriesRes.success && categoriesRes.data) {
        setCategories(categoriesRes.data);
      }
    } catch (_error) {
      toast.error('加载失败', '无法加载分类数据');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleMajorCategory = (id: string) => {
    const newExpanded = new Set(expandedMajor);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedMajor(newExpanded);
  };

  const handleCreateMajorCategory = async () => {
    if (!majorCategoryForm.name) {
      toast.error('请输入大类名称');
      return;
    }
    
    try {
      const response = await sourceApi.createMajorCategory(majorCategoryForm);
      if (response.success) {
        toast.success('创建成功');
        setMajorCategoryModal({ isOpen: false, mode: 'create', data: null });
        setMajorCategoryForm({
          name: '',
          description: '',
          icon: '',
          color: '#3B82F6',
          requiresKeyword: true,
        });
        loadData(true);
      }
    } catch (_error) {
      toast.error('创建失败', '请稍后重试');
    }
  };

  const handleUpdateMajorCategory = async () => {
    if (!majorCategoryModal.data || !majorCategoryForm.name) {
      toast.error('请输入大类名称');
      return;
    }
    
    try {
      const updateData: UpdateMajorCategoryRequest = {
        name: majorCategoryForm.name,
        description: majorCategoryForm.description,
        icon: majorCategoryForm.icon,
        color: majorCategoryForm.color,
        requiresKeyword: majorCategoryForm.requiresKeyword,
      };
      
      await sourceApi.updateMajorCategory(majorCategoryModal.data.id, updateData);
      toast.success('更新成功');
      setMajorCategoryModal({ isOpen: false, mode: 'create', data: null });
      loadData(true);
    } catch (_error) {
      toast.error('更新失败', '请稍后重试');
    }
  };

  const handleDeleteMajorCategory = async (id: string) => {
    if (!confirm('确定要删除这个大类吗？其下所有分类和搜索源也会被删除。')) return;
    
    try {
      await sourceApi.deleteMajorCategory(id);
      toast.success('删除成功');
      loadData(true);
    } catch (_error) {
      toast.error('删除失败', '请稍后重试');
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name || !categoryForm.majorCategoryId) {
      toast.error('请填写必填字段');
      return;
    }
    
    try {
      const response = await sourceApi.createCategory(categoryForm);
      if (response.success) {
        toast.success('创建成功');
        const currentMajorCategoryId = categoryForm.majorCategoryId;
        setCategoryModal({ isOpen: false, mode: 'create', data: null, majorCategoryId: null });
        setCategoryForm({
          majorCategoryId: '',
          name: '',
          description: '',
          icon: '',
          color: '#3B82F6',
          defaultSearchable: true,
          defaultSiteType: 'search',
          searchPriority: 0,
        });
        setExpandedMajor(prev => {
          const newSet = new Set(prev);
          newSet.add(currentMajorCategoryId);
          return newSet;
        });
        loadData(true);
      }
    } catch (_error) {
      toast.error('创建失败', '请稍后重试');
    }
  };

  const handleUpdateCategory = async () => {
    if (!categoryModal.data || !categoryForm.name) {
      toast.error('请输入分类名称');
      return;
    }
    
    try {
      const updateData: UpdateCategoryRequest = {
        name: categoryForm.name,
        description: categoryForm.description,
        icon: categoryForm.icon,
        color: categoryForm.color,
        defaultSearchable: categoryForm.defaultSearchable,
        defaultSiteType: categoryForm.defaultSiteType,
        searchPriority: categoryForm.searchPriority,
      };
      
      await sourceApi.updateCategory(categoryModal.data.id, updateData);
      toast.success('更新成功');
      setCategoryModal({ isOpen: false, mode: 'create', data: null, majorCategoryId: null });
      loadData(true);
    } catch (_error) {
      toast.error('更新失败', '请稍后重试');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('确定要删除这个分类吗？其下所有搜索源也会被删除。')) return;
    
    try {
      await sourceApi.deleteCategory(id);
      toast.success('删除成功');
      loadData(true);
    } catch (_error) {
      toast.error('删除失败', '请稍后重试');
    }
  };

  const openEditMajorCategoryModal = (majorCategory: MajorCategory) => {
    setMajorCategoryForm({
      name: majorCategory.name,
      description: majorCategory.description || '',
      icon: majorCategory.icon || '',
      color: majorCategory.color || '#3B82F6',
      requiresKeyword: majorCategory.requiresKeyword,
    });
    setMajorCategoryModal({ isOpen: true, mode: 'edit', data: majorCategory });
  };

  const openCreateCategoryModal = (majorCategoryId: string) => {
    const majorCategory = majorCategories.find(mc => mc.id === majorCategoryId);
    const isSearchCategory = majorCategory?.requiresKeyword ?? true;
    
    setCategoryForm({
      majorCategoryId,
      name: '',
      description: '',
      icon: '',
      color: '#3B82F6',
      defaultSearchable: isSearchCategory,
      defaultSiteType: isSearchCategory ? 'search' : 'browse',
      searchPriority: 0,
    });
    setCategoryModal({ isOpen: true, mode: 'create', data: null, majorCategoryId });
  };

  const openEditCategoryModal = (category: Category) => {
    setCategoryForm({
      majorCategoryId: category.majorCategoryId,
      name: category.name,
      description: category.description || '',
      icon: category.icon || '',
      color: category.color || '#3B82F6',
      defaultSearchable: category.defaultSearchable,
      defaultSiteType: category.defaultSiteType,
      searchPriority: category.searchPriority,
    });
    setCategoryModal({ isOpen: true, mode: 'edit', data: category, majorCategoryId: category.majorCategoryId });
  };

  const getCategoriesByMajor = (majorCategoryId: string) => {
    return categories.filter(c => c.majorCategoryId === majorCategoryId);
  };

  const filteredMajorCategories = majorCategories.filter(mc => 
    mc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    mc.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" text="加载分类..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500 to-primary-500 flex items-center justify-center shadow-lg shadow-accent-500/25">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              分类管理
            </h2>
            <p className="text-surface-500 dark:text-surface-400">
              管理搜索源的大类和分类
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setMajorCategoryForm({
              name: '',
              description: '',
              icon: '',
              color: '#3B82F6',
              requiresKeyword: true,
            });
            setMajorCategoryModal({ isOpen: true, mode: 'create', data: null });
          }}
        >
          添加大类
        </Button>
      </div>

      <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <Input
          placeholder="搜索分类..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="w-5 h-5" />}
          fullWidth
        />
      </Card>

      <div className="space-y-4">
        {filteredMajorCategories.map(majorCategory => {
          const subCategories = getCategoriesByMajor(majorCategory.id);
          const isExpanded = expandedMajor.has(majorCategory.id);
          
          return (
            <Card key={majorCategory.id} className="overflow-hidden border-surface-200/50 dark:border-surface-700/50 shadow-lg hover:shadow-xl transition-shadow">
              <div 
                className="flex items-center justify-between p-4 sm:p-5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                onClick={() => toggleMajorCategory(majorCategory.id)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <ChevronRight className={`w-4 h-4 shrink-0 text-surface-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
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
                      {subCategories.length} 个分类
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                  {/* Keyword badge — hide text on mobile */}
                  <Badge variant={majorCategory.requiresKeyword ? 'primary' : 'default'} className="hidden sm:inline-flex">
                    {majorCategory.requiresKeyword ? '需要关键词' : '无需关键词'}
                  </Badge>
                  <Badge variant={majorCategory.requiresKeyword ? 'primary' : 'default'} className="sm:hidden text-xs px-1.5 py-0.5">
                    {majorCategory.requiresKeyword ? '搜索型' : '浏览型'}
                  </Badge>
                  {majorCategory.isSystem && (
                    <Badge variant="accent" className="hidden sm:flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      系统
                    </Badge>
                  )}
                  <Dropdown
                    trigger={
                      <Button variant="ghost" size="sm" className="p-1.5">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    }
                    items={[
                      { label: '添加分类', onClick: () => openCreateCategoryModal(majorCategory.id) },
                      ...(isAdmin || !majorCategory.isSystem ? [
                        { label: '编辑', onClick: () => openEditMajorCategoryModal(majorCategory) },
                        { label: '删除', onClick: () => handleDeleteMajorCategory(majorCategory.id), danger: true },
                      ] : []),
                    ]}
                  />
                </div>
              </div>
              
              {isExpanded && (
                <div className="border-t border-surface-200 dark:border-surface-700">
                  {subCategories.length > 0 ? (
                    <div className="divide-y divide-surface-200 dark:divide-surface-700">
                      {subCategories.map(category => (
                        <div 
                          key={category.id}
                          className="flex items-center gap-3 p-3 sm:p-4 sm:pl-16 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                        >
                          {/* Icon */}
                          <div 
                            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-lg flex items-center justify-center text-white shadow-sm"
                            style={{ backgroundColor: category.color || '#3B82F6' }}
                          >
                            {category.icon ? (
                              <span className="text-base sm:text-lg">{category.icon}</span>
                            ) : (
                              <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5" />
                            )}
                          </div>

                          {/* Name + description + badges */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-sm text-surface-900 dark:text-surface-100 truncate">
                                {category.name}
                              </p>
                              {category.isSystem && (
                                <Badge variant="accent" className="hidden sm:flex items-center gap-1 text-xs shrink-0">
                                  <Shield className="w-2.5 h-2.5" />
                                  系统
                                </Badge>
                              )}
                            </div>
                            {/* Badges on mobile go below name */}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {majorCategory.requiresKeyword ? (
                                <Badge variant={category.defaultSearchable ? 'success' : 'default'} className="text-xs">
                                  {category.defaultSearchable ? '可搜索' : '不可搜索'}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs bg-surface-100 dark:bg-surface-700">
                                  不参与搜索
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {category.defaultSiteType === 'search' ? '搜索' : 
                                 category.defaultSiteType === 'browse' ? '浏览' : '参考'}
                              </Badge>
                              {category.description && (
                                <span className="text-xs text-surface-500 dark:text-surface-400 truncate hidden sm:inline">
                                  {category.description}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="shrink-0 flex items-center gap-0.5">
                            {(isAdmin || !category.isSystem) && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditCategoryModal(category)}
                                  className="p-1.5 hover:bg-accent-50 dark:hover:bg-accent-900/20"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteCategory(category.id)}
                                  className="p-1.5 text-error-500 hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-900/20"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {category.isSystem && !isAdmin && (
                              <span title="系统数据，仅管理员可编辑" className="p-1.5">
                                <Lock className="w-4 h-4 text-surface-400" />
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <FolderOpen className="w-10 h-10 mx-auto text-surface-300 dark:text-surface-600 mb-3" />
                      <p className="text-surface-500 dark:text-surface-400 mb-4">
                        暂无分类
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCreateCategoryModal(majorCategory.id)}
                        leftIcon={<Plus className="w-4 h-4" />}
                      >
                        添加分类
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        
        {filteredMajorCategories.length === 0 && (
          <EmptyState
            icon={<Tag className="w-12 h-12" />}
            title="没有找到分类"
            description="尝试调整搜索条件或添加新的大类"
            action={
              <Button variant="primary" onClick={() => setMajorCategoryModal({ isOpen: true, mode: 'create', data: null })}>
                添加大类
              </Button>
            }
          />
        )}
      </div>

      <Modal
        isOpen={majorCategoryModal.isOpen}
        onClose={() => setMajorCategoryModal({ isOpen: false, mode: 'create', data: null })}
        title={majorCategoryModal.mode === 'edit' ? '编辑大类' : '添加大类'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="名称 *"
            value={majorCategoryForm.name}
            onChange={(e) => setMajorCategoryForm({ ...majorCategoryForm, name: e.target.value })}
            placeholder="大类名称"
            fullWidth
          />
          
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              描述
            </label>
            <textarea
              value={majorCategoryForm.description}
              onChange={(e) => setMajorCategoryForm({ ...majorCategoryForm, description: e.target.value })}
              placeholder="大类描述"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="图标"
              value={majorCategoryForm.icon}
              onChange={(e) => setMajorCategoryForm({ ...majorCategoryForm, icon: e.target.value })}
              placeholder="emoji 或图标名"
              fullWidth
            />
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                颜色
              </label>
              <input
                type="color"
                value={majorCategoryForm.color}
                onChange={(e) => setMajorCategoryForm({ ...majorCategoryForm, color: e.target.value })}
                className="w-full h-10 rounded-lg border border-surface-300 dark:border-surface-600"
              />
            </div>
          </div>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={majorCategoryForm.requiresKeyword}
              onChange={(e) => setMajorCategoryForm({ ...majorCategoryForm, requiresKeyword: e.target.checked })}
              className="rounded border-surface-300 dark:border-surface-600"
            />
            <span className="text-sm text-surface-700 dark:text-surface-300">需要关键词才能搜索</span>
          </label>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setMajorCategoryModal({ isOpen: false, mode: 'create', data: null })}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={majorCategoryModal.mode === 'edit' ? handleUpdateMajorCategory : handleCreateMajorCategory}
            >
              {majorCategoryModal.mode === 'edit' ? '保存' : '创建'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={categoryModal.isOpen}
        onClose={() => setCategoryModal({ isOpen: false, mode: 'create', data: null, majorCategoryId: null })}
        title={categoryModal.mode === 'edit' ? '编辑分类' : '添加分类'}
        size="md"
      >
        {(() => {
          const currentMajorCategory = majorCategories.find(mc => mc.id === categoryModal.majorCategoryId);
          const isSearchCategory = currentMajorCategory?.requiresKeyword ?? true;
          
          return (
        <div className="space-y-4">
          <Input
            label="名称 *"
            value={categoryForm.name}
            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            placeholder="分类名称"
            fullWidth
          />
          
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
              描述
            </label>
            <textarea
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              placeholder="分类描述"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="图标"
              value={categoryForm.icon}
              onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
              placeholder="emoji 或图标名"
              fullWidth
            />
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                颜色
              </label>
              <input
                type="color"
                value={categoryForm.color}
                onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                className="w-full h-10 rounded-lg border border-surface-300 dark:border-surface-600"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                默认站点类型
              </label>
              <select
                value={categoryForm.defaultSiteType}
                onChange={(e) => setCategoryForm({ ...categoryForm, defaultSiteType: e.target.value as 'search' | 'browse' | 'reference' })}
                className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
              >
                <option value="search">搜索型</option>
                <option value="browse">浏览型</option>
                <option value="reference">参考型</option>
              </select>
            </div>
            <Input
              label="搜索优先级"
              type="number"
              value={categoryForm.searchPriority}
              onChange={(e) => setCategoryForm({ ...categoryForm, searchPriority: parseInt(e.target.value) || 0 })}
              fullWidth
            />
          </div>
          
          {isSearchCategory ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={categoryForm.defaultSearchable}
                onChange={(e) => setCategoryForm({ ...categoryForm, defaultSearchable: e.target.checked })}
                className="rounded border-surface-300 dark:border-surface-600"
              />
              <span className="text-sm text-surface-700 dark:text-surface-300">默认可搜索</span>
            </label>
          ) : (
            <div className="p-3 rounded-lg bg-surface-100 dark:bg-surface-800 text-sm text-surface-500 dark:text-surface-400">
              <span className="font-medium">提示：</span>该大类为浏览型（无需关键词），分类下的搜索源不参与搜索
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setCategoryModal({ isOpen: false, mode: 'create', data: null, majorCategoryId: null })}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={categoryModal.mode === 'edit' ? handleUpdateCategory : handleCreateCategory}
            >
              {categoryModal.mode === 'edit' ? '保存' : '创建'}
            </Button>
          </div>
        </div>
          );
        })()}
      </Modal>
    </div>
  );
};
