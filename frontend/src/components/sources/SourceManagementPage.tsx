/**
 * 源站管理页：个人源站（我的源 + 系统源）与管理员系统源站共用同一套树形编辑器。
 *
 * scope=user：个人大类/分类/源 CRUD，系统源只允许启停与自定义展示；
 * scope=admin：只操作系统树，不出现任何用户私有数据。
 */
import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  Download,
  Edit,
  FolderPlus,
  Layers,
  LockKeyhole,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Badge, Button, Card, EmptyState, Input, Loading, Modal, SourceIcon } from '@/components/ui';
import { sourceApi } from '@/services/api';
import { useAdminSourceTree, useUserSourceTree, sourcesKeys } from '@/hooks';
import { useToast } from '@/hooks/useNotification';
import { useTranslation } from 'react-i18next';
import type {
  Category,
  MajorCategory,
  SearchSource,
  UserSourceConfig,
} from '@/types';

type Scope = 'user' | 'admin';
type TreeMode = 'mine' | 'system' | 'admin';

type SystemSource = SearchSource & { enabled: boolean; userConfig: UserSourceConfig | null };

interface SourceManagementPageProps {
  scope: Scope;
}

interface MajorFormState {
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface CategoryFormState {
  majorCategoryId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultSearchable: boolean;
  defaultSiteType: 'search' | 'browse' | 'reference';
  searchPriority: number;
}

interface SourceFormState {
  categoryId: string;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  urlTemplate: string;
  homepageUrl: string;
  searchable: boolean;
  searchPriority: number;
}

interface CheckResult {
  available: boolean;
  status: string;
  responseTime: number;
  error: string | null;
}

const emptyMajorForm: MajorFormState = {
  name: '',
  description: '',
  icon: '🌟',
  color: '#6b7280',
};

const emptyCategoryForm: CategoryFormState = {
  majorCategoryId: '',
  name: '',
  description: '',
  icon: '📁',
  color: '#3b82f6',
  defaultSearchable: true,
  defaultSiteType: 'search',
  searchPriority: 5,
};

const emptySourceForm: SourceFormState = {
  categoryId: '',
  name: '',
  subtitle: '',
  urlTemplate: '',
  description: '',
  icon: '🔍',
  homepageUrl: '',
  searchable: true,
  searchPriority: 5,
};

/** 表单下拉框统一样式 */
const selectClassName =
  'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-amber-500 dark:focus:ring-amber-500/10';

export const SourceManagementPage: React.FC<SourceManagementPageProps> = ({ scope }) => {
  const { t } = useTranslation(['dashboard']);
  const toast = useToast();
  const queryClient = useQueryClient();

  const isUserScope = scope === 'user';
  const userTreeQuery = useUserSourceTree(isUserScope);
  const adminTreeQuery = useAdminSourceTree(!isUserScope);
  const tree = isUserScope ? userTreeQuery.data : undefined;
  const adminTree = !isUserScope ? adminTreeQuery.data : undefined;
  const isLoading = isUserScope ? userTreeQuery.isLoading : adminTreeQuery.isLoading;

  const [tab, setTab] = useState<'mine' | 'system'>('mine');
  const [checkMap, setCheckMap] = useState<Record<string, CheckResult>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const [majorModal, setMajorModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    item: MajorCategory | null;
  }>({ open: false, mode: 'create', item: null });
  const [majorForm, setMajorForm] = useState<MajorFormState>(emptyMajorForm);

  const [categoryModal, setCategoryModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    item: Category | null;
    majorCategoryId: string;
  }>({ open: false, mode: 'create', item: null, majorCategoryId: '' });
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);

  const [sourceModal, setSourceModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    item: SearchSource | null;
    categoryId: string;
  }>({ open: false, mode: 'create', item: null, categoryId: '' });
  const [sourceForm, setSourceForm] = useState<SourceFormState>(emptySourceForm);

  const [configModal, setConfigModal] = useState<{ open: boolean; source: SystemSource | null }>({
    open: false,
    source: null,
  });
  const [configForm, setConfigForm] = useState({
    customName: '',
    customSubtitle: '',
    customIcon: '',
    notes: '',
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: sourcesKeys.userTree });
    queryClient.invalidateQueries({ queryKey: sourcesKeys.adminTree });
    queryClient.invalidateQueries({ queryKey: sourcesKeys.userConfig });
    queryClient.invalidateQueries({ queryKey: sourcesKeys.catalog });
    queryClient.invalidateQueries({ queryKey: sourcesKeys.stats });
    queryClient.invalidateQueries({ queryKey: sourcesKeys.majorCategories });
    queryClient.invalidateQueries({ queryKey: sourcesKeys.categories });
  };

  // ── 数据整理 ─────────────────────────────────────────

  const systemMajorIds = useMemo(
    () => new Set((tree?.system.majorCategories || []).map((item) => item.id)),
    [tree]
  );

  const mineGroups = useMemo(() => {
    if (!tree) return [] as Array<{ major: MajorCategory; categories: Category[]; isSystemMajor: boolean }>;
    const personalMajorIds = new Set(tree.mine.majorCategories.map((item) => item.id));
    const groups = new Map<string, { major: MajorCategory; categories: Category[]; isSystemMajor: boolean }>();

    for (const major of tree.mine.majorCategories) {
      groups.set(major.id, { major, categories: [], isSystemMajor: false });
    }

    for (const category of tree.mine.categories) {
      if (personalMajorIds.has(category.majorCategoryId)) {
        groups.get(category.majorCategoryId)?.categories.push(category);
        continue;
      }

      // 个人分类挂在系统大类下：优先用系统大类信息；父大类被停用时用分类里的快照兜底
      const systemMajor = tree.system.majorCategories.find((item) => item.id === category.majorCategoryId);
      if (systemMajor) {
        if (!groups.has(systemMajor.id)) {
          groups.set(systemMajor.id, { major: systemMajor, categories: [], isSystemMajor: true });
        }
        groups.get(systemMajor.id)?.categories.push(category);
        continue;
      }

      if (category.majorCategoryOwnerId === null || systemMajorIds.has(category.majorCategoryId)) {
        const archivedMajor: MajorCategory = {
          id: category.majorCategoryId,
          name: category.majorCategoryName || t('dashboard:mySources.archivedMajor'),
          description: '',
          icon: '📦',
          color: '#6b7280',
          isActive: false,
          isSystem: true,
          displayOrder: 999,
          createdAt: '',
          updatedAt: '',
        };
        if (!groups.has(archivedMajor.id)) {
          groups.set(archivedMajor.id, { major: archivedMajor, categories: [], isSystemMajor: true });
        }
        groups.get(archivedMajor.id)?.categories.push(category);
      }
    }

    return [...groups.values()];
  }, [tree, systemMajorIds, t]);

  const myCategories = tree?.mine.categories || [];
  const mySources = tree?.mine.sources || [];
  const systemSources = (tree?.system.sources || []) as SystemSource[];
  const adminSources = (adminTree?.sources || []) as SearchSource[];
  const adminCategories = adminTree?.categories || [];
  const adminMajors = adminTree?.majorCategories || [];

  const systemCategorySources = (categoryId: string) =>
    systemSources.filter((source) => source.categoryId === categoryId);
  const myCategorySources = (categoryId: string) =>
    mySources.filter((source) => source.categoryId === categoryId);
  const adminCategorySources = (categoryId: string) =>
    adminSources.filter((source) => source.categoryId === categoryId);

  // ── 健康检查 ─────────────────────────────────────────

  const checkSource = async (sourceId: string) => {
    setCheckingId(sourceId);
    try {
      const response = await sourceApi.checkSourceStatus(sourceId);
      if (response.success && response.data) {
        setCheckMap((prev) => ({ ...prev, [sourceId]: response.data }));
        if (response.data.available) {
          toast.success(t('dashboard:sources.checkOnline', { time: response.data.responseTime }));
        } else {
          toast.error(
            response.data.status === 'timeout'
              ? t('dashboard:sources.checkTimeout')
              : response.data.error || t('dashboard:sources.checkUnavailable')
          );
        }
      }
    } catch {
      toast.error(t('dashboard:sources.batchCheckFailed'));
    } finally {
      setCheckingId(null);
    }
  };

  // ── 大类 ─────────────────────────────────────────────

  const openCreateMajor = () => {
    setMajorForm(emptyMajorForm);
    setMajorModal({ open: true, mode: 'create', item: null });
  };

  const openEditMajor = (major: MajorCategory) => {
    setMajorForm({
      name: major.name,
      description: major.description || '',
      icon: major.icon || '🌟',
      color: major.color || '#6b7280',
    });
    setMajorModal({ open: true, mode: 'edit', item: major });
  };

  const saveMajor = async () => {
    if (!majorForm.name.trim()) {
      toast.error(t('dashboard:categories.majorNameRequired'));
      return;
    }
    try {
      const payload = {
        name: majorForm.name.trim(),
        description: majorForm.description.trim() || undefined,
        icon: majorForm.icon.trim() || undefined,
        color: majorForm.color,
      };
      const response = majorModal.mode === 'create'
        ? (isUserScope
            ? await sourceApi.createMajorCategory(payload)
            : await sourceApi.createSystemMajorCategory(payload))
        : (isUserScope
            ? await sourceApi.updateMajorCategory(majorModal.item!.id, payload)
            : await sourceApi.updateSystemMajorCategory(majorModal.item!.id, payload));
      if (response.success) {
        toast.success(majorModal.mode === 'create'
          ? t('dashboard:categories.createSuccess')
          : t('dashboard:categories.updateSuccess'));
        setMajorModal({ open: false, mode: 'create', item: null });
        invalidate();
      }
    } catch {
      toast.error(t('dashboard:categories.createFailedTitle'), t('dashboard:categories.retryLater'));
    }
  };

  const deleteMajor = async (major: MajorCategory) => {
    if (!window.confirm(t('dashboard:categories.majorDeleteConfirm', { name: major.name }))) return;
    try {
      const response = isUserScope
        ? await sourceApi.deleteMajorCategory(major.id)
        : await sourceApi.deleteSystemMajorCategory(major.id);
      if (response.success) {
        toast.success(t('dashboard:categories.deleteSuccess'));
        invalidate();
      }
    } catch {
      toast.error(t('dashboard:categories.deleteFailedTitle'));
    }
  };

  // ── 分类 ─────────────────────────────────────────────

  const openCreateCategory = (majorCategoryId: string) => {
    setCategoryForm({ ...emptyCategoryForm, majorCategoryId });
    setCategoryModal({ open: true, mode: 'create', item: null, majorCategoryId });
  };

  const openEditCategory = (category: Category) => {
    setCategoryForm({
      majorCategoryId: category.majorCategoryId,
      name: category.name,
      description: category.description || '',
      icon: category.icon || '📁',
      color: category.color || '#3b82f6',
      defaultSearchable: category.defaultSearchable,
      defaultSiteType: category.defaultSiteType,
      searchPriority: category.searchPriority,
    });
    setCategoryModal({ open: true, mode: 'edit', item: category, majorCategoryId: category.majorCategoryId });
  };

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error(t('dashboard:categories.categoryNameRequired'));
      return;
    }
    if (!categoryForm.majorCategoryId) {
      toast.error(t('dashboard:mySources.selectMajorRequired'));
      return;
    }
    try {
      const payload = {
        majorCategoryId: categoryForm.majorCategoryId,
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || undefined,
        icon: categoryForm.icon.trim() || undefined,
        color: categoryForm.color,
        defaultSearchable: categoryForm.defaultSearchable,
        defaultSiteType: categoryForm.defaultSiteType,
        searchPriority: categoryForm.searchPriority,
      };
      const response = categoryModal.mode === 'create'
        ? (isUserScope
            ? await sourceApi.createCategory(payload)
            : await sourceApi.createSystemCategory(payload))
        : (isUserScope
            ? await sourceApi.updateCategory(categoryModal.item!.id, payload)
            : await sourceApi.updateSystemCategory(categoryModal.item!.id, payload));
      if (response.success) {
        toast.success(categoryModal.mode === 'create'
          ? t('dashboard:categories.createSuccess')
          : t('dashboard:categories.updateSuccess'));
        setCategoryModal({ open: false, mode: 'create', item: null, majorCategoryId: '' });
        // 从系统源 Tab 新建个人分类后切回「我的源」，让用户能继续在分类下建源
        if (isUserScope && categoryModal.mode === 'create') setTab('mine');
        invalidate();
      }
    } catch {
      toast.error(t('dashboard:categories.createFailedTitle'), t('dashboard:categories.retryLater'));
    }
  };

  const deleteCategory = async (category: Category) => {
    if (!window.confirm(t('dashboard:categories.categoryDeleteConfirm'))) return;
    try {
      const response = isUserScope
        ? await sourceApi.deleteCategory(category.id)
        : await sourceApi.deleteSystemCategory(category.id);
      if (response.success) {
        toast.success(t('dashboard:categories.deleteSuccess'));
        invalidate();
      }
    } catch {
      toast.error(t('dashboard:categories.deleteFailedTitle'));
    }
  };

  // ── 搜索源 ───────────────────────────────────────────

  const openCreateSource = (categoryId: string) => {
    setSourceForm({ ...emptySourceForm, categoryId });
    setSourceModal({ open: true, mode: 'create', item: null, categoryId });
  };

  const openEditSource = (source: SearchSource) => {
    setSourceForm({
      categoryId: source.categoryId,
      name: source.name,
      subtitle: source.subtitle || '',
      description: source.description || '',
      icon: source.icon || '🔍',
      urlTemplate: source.urlTemplate,
      homepageUrl: source.homepageUrl || '',
      searchable: source.searchable,
      searchPriority: source.searchPriority,
    });
    setSourceModal({ open: true, mode: 'edit', item: source, categoryId: source.categoryId });
  };

  const saveSource = async () => {
    if (!sourceForm.categoryId || !sourceForm.name.trim() || !sourceForm.urlTemplate.trim()) {
      toast.error(t('dashboard:categories.requiredFields'));
      return;
    }
    try {
      const payload = {
        categoryId: sourceForm.categoryId,
        name: sourceForm.name.trim(),
        subtitle: sourceForm.subtitle.trim() || undefined,
        description: sourceForm.description.trim() || undefined,
        icon: sourceForm.icon.trim() || undefined,
        urlTemplate: sourceForm.urlTemplate.trim(),
        homepageUrl: sourceForm.homepageUrl.trim() || undefined,
        searchable: sourceForm.searchable,
        searchPriority: sourceForm.searchPriority,
      };
      const response = sourceModal.mode === 'create'
        ? (isUserScope
            ? await sourceApi.createSource(payload)
            : await sourceApi.createSystemSource(payload))
        : (isUserScope
            ? await sourceApi.updateSource(sourceModal.item!.id, payload)
            : await sourceApi.updateSystemSource(sourceModal.item!.id, payload));
      if (response.success) {
        toast.success(sourceModal.mode === 'create'
          ? t('dashboard:categories.createSuccess')
          : t('dashboard:categories.updateSuccess'));
        setSourceModal({ open: false, mode: 'create', item: null, categoryId: '' });
        invalidate();
      }
    } catch {
      toast.error(t('dashboard:categories.createFailedTitle'), t('dashboard:categories.retryLater'));
    }
  };

  const deleteSource = async (source: SearchSource) => {
    if (!window.confirm(t('dashboard:sources.deleteConfirm'))) return;
    try {
      const response = isUserScope
        ? await sourceApi.deleteSource(source.id)
        : await sourceApi.deleteSystemSource(source.id);
      if (response.success) {
        toast.success(t('dashboard:categories.deleteSuccess'));
        invalidate();
      }
    } catch {
      toast.error(t('dashboard:categories.deleteFailedTitle'));
    }
  };

  // ── 系统源启停与自定义 ───────────────────────────────

  const toggleSystemSource = async (source: SystemSource) => {
    try {
      const response = await sourceApi.updateUserSourceConfig(source.id, { isEnabled: !source.enabled });
      if (response.success) {
        invalidate();
      }
    } catch {
      toast.error(t('dashboard:categories.updateFailedTitle'));
    }
  };

  const openConfig = (source: SystemSource) => {
    setConfigForm({
      customName: source.userConfig?.customName || '',
      customSubtitle: source.userConfig?.customSubtitle || '',
      customIcon: source.userConfig?.customIcon || '',
      notes: source.userConfig?.notes || '',
    });
    setConfigModal({ open: true, source });
  };

  const saveConfig = async () => {
    if (!configModal.source) return;
    try {
      const response = await sourceApi.updateUserSourceConfig(configModal.source.id, {
        customName: configForm.customName.trim() || undefined,
        customSubtitle: configForm.customSubtitle.trim() || undefined,
        customIcon: configForm.customIcon.trim() || undefined,
        notes: configForm.notes.trim() || undefined,
      });
      if (response.success) {
        toast.success(t('dashboard:categories.updateSuccess'));
        setConfigModal({ open: false, source: null });
        invalidate();
      }
    } catch {
      toast.error(t('dashboard:categories.updateFailedTitle'));
    }
  };

  // ── 导出 ─────────────────────────────────────────────

  const exportSources = async (format: 'json' | 'csv' | 'opml') => {
    try {
      const data = await sourceApi.exportSources(format);
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'my-search-sources.json');
      } else {
        downloadBlob(data as Blob, `my-search-sources.${format}`);
      }
    } catch {
      toast.error(t('dashboard:mySources.exportFailed'));
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // ── 渲染 ─────────────────────────────────────────────

  if (isLoading) {
    return <Loading text={t('dashboard:sources.loading')} />;
  }

  const renderSourceRow = (source: SearchSource, mode: TreeMode) => {
    const systemSource = source as SystemSource;
    const check = checkMap[source.id];
    const enabled = mode === 'system' ? systemSource.enabled : true;

    return (
      <div
        key={source.id}
        className={clsx(
          'flex flex-col gap-2 rounded-xl border border-stone-200/70 bg-white px-3 py-2.5 transition-colors dark:border-stone-700/60 dark:bg-stone-900/60 sm:flex-row sm:items-center',
          !enabled && 'opacity-60'
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <SourceIcon icon={source.icon} name={source.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                {systemSource.userConfig?.customName || source.name}
              </span>
              <Badge variant={mode === 'mine' ? 'accent' : 'primary'} className="text-[10px]">
                {mode === 'mine' ? t('dashboard:mySources.mine') : t('dashboard:sources.system')}
              </Badge>
              {source.searchable && (
                <Badge variant="info" className="text-[10px]">{t('dashboard:mySources.searchable')}</Badge>
              )}
              {check && (
                <Badge variant={check.available ? 'success' : 'error'} className="text-[10px]">
                  {check.available
                    ? t('dashboard:sources.checkOnline', { time: check.responseTime })
                    : check.status === 'timeout'
                      ? t('dashboard:sources.checkTimeout')
                      : t('dashboard:sources.checkUnavailable')}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
              {systemSource.userConfig?.customSubtitle || source.subtitle || source.urlTemplate}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
          {mode === 'system' ? (
            <>
              <button
                onClick={() => toggleSystemSource(systemSource)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
                  enabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                )}
              >
                {enabled ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {enabled ? t('dashboard:sources.enabled') : t('dashboard:sources.disabled')}
              </button>
              <IconButton title={t('dashboard:sources.actionEdit')} onClick={() => openConfig(systemSource)}>
                <Edit className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton title={t('dashboard:sources.systemDataLock')} disabled>
                <LockKeyhole className="h-3.5 w-3.5" />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton title={t('dashboard:sources.actionEdit')} onClick={() => openEditSource(source)}>
                <Edit className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton title={t('dashboard:sources.actionDelete')} onClick={() => deleteSource(source)} danger>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </>
          )}
          <IconButton
            title={t('dashboard:sources.actionCheckStatus')}
            onClick={() => checkSource(source.id)}
            disabled={checkingId === source.id}
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', checkingId === source.id && 'animate-spin')} />
          </IconButton>
        </div>
      </div>
    );
  };

  const renderCategory = (
    category: Category,
    mode: TreeMode,
    sources: SearchSource[]
  ) => (
    <div key={category.id} className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-3 dark:border-stone-700/60 dark:bg-stone-800/30">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base">{category.icon || '📁'}</span>
        <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">{category.name}</span>
        <Badge variant="default" className="text-[10px]">
          {t('dashboard:mySources.sourceCount', { count: sources.length })}
        </Badge>
        {mode !== 'system' && (
          <div className="ml-auto flex items-center gap-1">
            <IconButton title={t('dashboard:sources.actionEdit')} onClick={() => openEditCategory(category)}>
              <Edit className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title={t('dashboard:sources.actionDelete')} onClick={() => deleteCategory(category)} danger>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1.5">
        {sources.length > 0 ? (
          sources.map((source) => renderSourceRow(source, mode))
        ) : (
          <p className="py-2 text-xs text-stone-400">{t('dashboard:mySources.emptySources')}</p>
        )}
      </div>

      {mode !== 'system' && (
        <button
          onClick={() => openCreateSource(category.id)}
          className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
        >
          <Plus className="h-3 w-3" />
          {t('dashboard:mySources.addSource')}
        </button>
      )}
    </div>
  );

  const renderMajorBlock = (
    major: MajorCategory,
    categories: Category[],
    mode: TreeMode,
    getSources: (categoryId: string) => SearchSource[],
    isSystemMajor = false
  ) => (
    <Card key={`${mode}-${major.id}`} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
        <span className="text-lg">{major.icon || '🌟'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">{major.name}</h3>
            {isSystemMajor || mode !== 'mine' ? (
              <Badge variant="primary" className="text-[10px]">
                <Shield className="mr-0.5 h-2.5 w-2.5" />
                {t('dashboard:sources.system')}
              </Badge>
            ) : (
              <Badge variant="accent" className="text-[10px]">{t('dashboard:mySources.mine')}</Badge>
            )}
            <Badge variant="default" className="text-[10px]">
              {t('dashboard:mySources.categoryCount', { count: categories.length })}
            </Badge>
          </div>
          {major.description && (
            <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">{major.description}</p>
          )}
        </div>
        {mode === 'system' && isUserScope ? (
          <button
            type="button"
            onClick={() => openCreateCategory(major.id)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            {t('dashboard:mySources.addCategory')}
          </button>
        ) : mode !== 'system' && (
          <div className="flex items-center gap-1">
            <IconButton title={t('dashboard:mySources.addCategory')} onClick={() => openCreateCategory(major.id)}>
              <FolderPlus className="h-3.5 w-3.5" />
            </IconButton>
            {!isSystemMajor && (
              <>
                <IconButton title={t('dashboard:sources.actionEdit')} onClick={() => openEditMajor(major)}>
                  <Edit className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton title={t('dashboard:sources.actionDelete')} onClick={() => deleteMajor(major)} danger>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        {categories.length > 0 ? (
          categories.map((category) => renderCategory(category, mode, getSources(category.id)))
        ) : (
          <p className="px-1 py-3 text-xs text-stone-400">{t('dashboard:mySources.emptyCategories')}</p>
        )}
      </div>
    </Card>
  );

  const statsCards = isUserScope && tree
    ? [
        { label: t('dashboard:mySources.mySources'), value: tree.stats.mySources },
        { label: t('dashboard:mySources.myCategories'), value: tree.stats.myCategories },
        { label: t('dashboard:mySources.systemEnabled'), value: `${tree.stats.enabledSystemSources}/${tree.stats.systemSources}` },
      ]
    : adminTree
      ? [
          { label: t('dashboard:mySources.systemSources'), value: adminTree.stats.totalSources },
          { label: t('dashboard:mySources.systemCategories'), value: adminTree.stats.totalCategories },
          { label: t('dashboard:mySources.searchable'), value: adminTree.stats.searchableSources },
        ]
      : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            {isUserScope ? t('dashboard:mySources.title') : t('dashboard:mySources.adminTitle')}
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {isUserScope ? t('dashboard:mySources.subtitle') : t('dashboard:mySources.adminSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isUserScope && (
            <>
              <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => exportSources('json')}>
                {t('dashboard:sources.export')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<FolderPlus className="h-4 w-4" />}
                onClick={() => openCreateCategory('')}
              >
                {t('dashboard:mySources.addCategory')}
              </Button>
            </>
          )}
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreateMajor}>
            {t('dashboard:mySources.addMajor')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {statsCards.map((item) => (
          <div key={item.label} className="rounded-2xl border border-stone-200/70 bg-white px-3 py-2.5 dark:border-stone-700/60 dark:bg-stone-900/70">
            <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400">{item.label}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-stone-900 dark:text-stone-100">{item.value}</p>
          </div>
        ))}
      </div>

      {isUserScope && (
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800/60">
          <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} icon={<Layers className="h-4 w-4" />}>
            {t('dashboard:mySources.tabMine')}
          </TabButton>
          <TabButton active={tab === 'system'} onClick={() => setTab('system')} icon={<Shield className="h-4 w-4" />}>
            {t('dashboard:mySources.tabSystem')}
          </TabButton>
        </div>
      )}

      {isUserScope && tab === 'mine' && (
        <div className="space-y-3">
          {mineGroups.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-12 w-12" />}
              title={t('dashboard:mySources.emptyMineTitle')}
              description={t('dashboard:mySources.emptyMineDesc')}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" onClick={openCreateMajor} leftIcon={<Plus className="h-4 w-4" />}>
                    {t('dashboard:mySources.addMajor')}
                  </Button>
                  <Button variant="secondary" onClick={() => openCreateCategory('')} leftIcon={<FolderPlus className="h-4 w-4" />}>
                    {t('dashboard:mySources.addCategory')}
                  </Button>
                </div>
              }
            />
          ) : (
            mineGroups.map(({ major, categories, isSystemMajor }) =>
              renderMajorBlock(major, categories, 'mine', myCategorySources, isSystemMajor)
            )
          )}
        </div>
      )}

      {isUserScope && tab === 'system' && (
        <div className="space-y-3">
          {(tree?.system.majorCategories || []).map((major) => {
            const categories = (tree?.system.categories || []).filter((item) => item.majorCategoryId === major.id);
            return renderMajorBlock(major, categories, 'system', systemCategorySources);
          })}
          {(tree?.system.majorCategories || []).length === 0 && (
            <EmptyState icon={<Shield className="h-12 w-12" />} title={t('dashboard:mySources.emptySystem')} />
          )}
        </div>
      )}

      {!isUserScope && (
        <div className="space-y-3">
          {adminMajors.map((major) => {
            const categories = adminCategories.filter((item) => item.majorCategoryId === major.id);
            return renderMajorBlock(major, categories, 'admin', adminCategorySources);
          })}
          {adminMajors.length === 0 && (
            <EmptyState
              icon={<Shield className="h-12 w-12" />}
              title={t('dashboard:mySources.emptySystem')}
              action={
                <Button variant="primary" onClick={openCreateMajor} leftIcon={<Plus className="h-4 w-4" />}>
                  {t('dashboard:mySources.addMajor')}
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* 大类表单 */}
      <Modal
        isOpen={majorModal.open}
        onClose={() => setMajorModal({ open: false, mode: 'create', item: null })}
        title={majorModal.mode === 'create' ? t('dashboard:mySources.addMajor') : t('dashboard:mySources.editMajor')}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMajorModal({ open: false, mode: 'create', item: null })}>
              {t('dashboard:sources.cancel')}
            </Button>
            <Button variant="primary" onClick={saveMajor}>
              {majorModal.mode === 'create' ? t('dashboard:sources.create') : t('dashboard:sources.saveChanges')}
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          <Input
            label={t('dashboard:mySources.nameLabel')}
            value={majorForm.name}
            onChange={(event) => setMajorForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t('dashboard:mySources.majorNamePlaceholder')}
            fullWidth
          />
          <Input
            label={t('dashboard:sources.formDescriptionLabel')}
            value={majorForm.description}
            onChange={(event) => setMajorForm((prev) => ({ ...prev, description: event.target.value }))}
            fullWidth
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('dashboard:mySources.iconLabel')}
              value={majorForm.icon}
              onChange={(event) => setMajorForm((prev) => ({ ...prev, icon: event.target.value }))}
              fullWidth
            />
            <Input
              label={t('dashboard:mySources.colorLabel')}
              type="color"
              value={majorForm.color}
              onChange={(event) => setMajorForm((prev) => ({ ...prev, color: event.target.value }))}
              fullWidth
            />
          </div>
        </div>
      </Modal>

      {/* 分类表单 */}
      <Modal
        isOpen={categoryModal.open}
        onClose={() => setCategoryModal({ open: false, mode: 'create', item: null, majorCategoryId: '' })}
        title={categoryModal.mode === 'create' ? t('dashboard:mySources.addCategory') : t('dashboard:mySources.editCategory')}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCategoryModal({ open: false, mode: 'create', item: null, majorCategoryId: '' })}>
              {t('dashboard:sources.cancel')}
            </Button>
            <Button variant="primary" onClick={saveCategory}>
              {categoryModal.mode === 'create' ? t('dashboard:sources.create') : t('dashboard:sources.saveChanges')}
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            {t('dashboard:mySources.parentMajor')}
            <select
              className={`${selectClassName} mt-1.5`}
              value={categoryForm.majorCategoryId}
              onChange={(event) => setCategoryForm((prev) => ({ ...prev, majorCategoryId: event.target.value }))}
            >
              <option value="">{t('dashboard:mySources.selectMajor')}</option>
              {(isUserScope
                ? [...(tree?.system.majorCategories || []), ...(tree?.mine.majorCategories || [])]
                : adminMajors
              ).map((major) => (
                <option key={major.id} value={major.id}>{major.name}</option>
              ))}
            </select>
          </label>
          <Input
            label={t('dashboard:mySources.nameLabel')}
            value={categoryForm.name}
            onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t('dashboard:mySources.categoryNamePlaceholder')}
            fullWidth
          />
          <Input
            label={t('dashboard:sources.formDescriptionLabel')}
            value={categoryForm.description}
            onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))}
            fullWidth
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('dashboard:mySources.iconLabel')}
              value={categoryForm.icon}
              onChange={(event) => setCategoryForm((prev) => ({ ...prev, icon: event.target.value }))}
              fullWidth
            />
            <Input
              label={t('dashboard:mySources.colorLabel')}
              type="color"
              value={categoryForm.color}
              onChange={(event) => setCategoryForm((prev) => ({ ...prev, color: event.target.value }))}
              fullWidth
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('dashboard:mySources.defaultSearchable')}
              <select
                className={`${selectClassName} mt-1.5`}
                value={categoryForm.defaultSearchable ? '1' : '0'}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, defaultSearchable: event.target.value === '1' }))}
              >
                <option value="1">{t('dashboard:sources.enabled')}</option>
                <option value="0">{t('dashboard:sources.disabled')}</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('dashboard:mySources.siteType')}
              <select
                className={`${selectClassName} mt-1.5`}
                value={categoryForm.defaultSiteType}
                onChange={(event) => setCategoryForm((prev) => ({
                  ...prev,
                  defaultSiteType: event.target.value as CategoryFormState['defaultSiteType'],
                }))}
              >
                <option value="search">{t('dashboard:sources.siteTypeSearch')}</option>
                <option value="browse">{t('dashboard:sources.siteTypeBrowse')}</option>
                <option value="reference">{t('dashboard:sources.siteTypeReference')}</option>
              </select>
            </label>
          </div>
        </div>
      </Modal>

      {/* 源表单 */}
      <Modal
        isOpen={sourceModal.open}
        onClose={() => setSourceModal({ open: false, mode: 'create', item: null, categoryId: '' })}
        title={sourceModal.mode === 'create' ? t('dashboard:sources.modalCreate') : t('dashboard:sources.modalEdit')}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSourceModal({ open: false, mode: 'create', item: null, categoryId: '' })}>
              {t('dashboard:sources.cancel')}
            </Button>
            <Button variant="primary" onClick={saveSource}>
              {sourceModal.mode === 'create' ? t('dashboard:sources.create') : t('dashboard:sources.saveChanges')}
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            {t('dashboard:sources.formCategoryLabel')}
            <select
              className={`${selectClassName} mt-1.5`}
              value={sourceForm.categoryId}
              onChange={(event) => setSourceForm((prev) => ({ ...prev, categoryId: event.target.value }))}
            >
              <option value="">{t('dashboard:sources.formCategoryPlaceholder')}</option>
              {(isUserScope ? myCategories : adminCategories).map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <Input
            label={t('dashboard:sources.formNameLabel')}
            value={sourceForm.name}
            onChange={(event) => setSourceForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t('dashboard:sources.formNamePlaceholder')}
            fullWidth
          />
          <Input
            label={t('dashboard:sources.formSubtitleLabel')}
            value={sourceForm.subtitle}
            onChange={(event) => setSourceForm((prev) => ({ ...prev, subtitle: event.target.value }))}
            fullWidth
          />
          <Input
            label={t('dashboard:sources.formUrlTemplateLabel')}
            value={sourceForm.urlTemplate}
            onChange={(event) => setSourceForm((prev) => ({ ...prev, urlTemplate: event.target.value }))}
            placeholder="https://example.com/search?q={keyword}"
            fullWidth
          />
          <Input
            label={t('dashboard:sources.formHomepageUrlLabel')}
            value={sourceForm.homepageUrl}
            onChange={(event) => setSourceForm((prev) => ({ ...prev, homepageUrl: event.target.value }))}
            fullWidth
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('dashboard:mySources.iconLabel')}
              value={sourceForm.icon}
              onChange={(event) => setSourceForm((prev) => ({ ...prev, icon: event.target.value }))}
              fullWidth
            />
            <Input
              label={t('dashboard:sources.formPriorityLabel')}
              type="number"
              min={1}
              max={10}
              value={sourceForm.searchPriority}
              onChange={(event) => setSourceForm((prev) => ({ ...prev, searchPriority: Number(event.target.value) }))}
              fullWidth
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
            <input
              type="checkbox"
              checked={sourceForm.searchable}
              onChange={(event) => setSourceForm((prev) => ({ ...prev, searchable: event.target.checked }))}
              className="h-4 w-4 rounded border-stone-300 text-amber-500"
            />
            {t('dashboard:sources.formSearchableLabel')}
          </label>
        </div>
      </Modal>

      {/* 系统源自定义 */}
      <Modal
        isOpen={configModal.open}
        onClose={() => setConfigModal({ open: false, source: null })}
        title={t('dashboard:mySources.customizeTitle')}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfigModal({ open: false, source: null })}>
              {t('dashboard:sources.cancel')}
            </Button>
            <Button variant="primary" onClick={saveConfig}>
              {t('dashboard:sources.saveChanges')}
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          <Input
            label={t('dashboard:mySources.customName')}
            value={configForm.customName}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, customName: event.target.value }))}
            placeholder={configModal.source?.name}
            fullWidth
          />
          <Input
            label={t('dashboard:mySources.customSubtitle')}
            value={configForm.customSubtitle}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, customSubtitle: event.target.value }))}
            fullWidth
          />
          <Input
            label={t('dashboard:mySources.customIcon')}
            value={configForm.customIcon}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, customIcon: event.target.value }))}
            fullWidth
          />
          <Input
            label={t('dashboard:mySources.notes')}
            value={configForm.notes}
            onChange={(event) => setConfigForm((prev) => ({ ...prev, notes: event.target.value }))}
            fullWidth
          />
        </div>
      </Modal>
    </div>
  );
};

// ── 小组件 ───────────────────────────────────────────

const IconButton: React.FC<{
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, disabled, danger, children }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={clsx(
      'inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
      disabled
        ? 'cursor-not-allowed text-stone-300 dark:text-stone-600'
        : danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
    )}
  >
    {children}
  </button>
);

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ active, onClick, icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
      active
        ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-900 dark:text-stone-100'
        : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
    )}
  >
    {icon}
    {children}
  </button>
);

SourceManagementPage.displayName = 'SourceManagementPage';
