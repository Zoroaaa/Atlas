import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Power,
  RefreshCw,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { sourceApi } from '@/services/api';
import type {
  Category,
  MajorCategory,
  SourceBoardStats,
  SourceCatalogItem,
  SourceDetailPayload,
  UserSourceConfig,
} from '@/types';

const PAGE_SIZE = 24;

const siteTypeKey: Record<string, string> = {
  search: 'sourceBoard:siteTypes.search',
  browse: 'sourceBoard:siteTypes.browse',
  reference: 'sourceBoard:siteTypes.reference',
  enriched: 'sourceBoard:siteTypes.enriched',
};

type ScopeValue = 'all' | 'mine' | 'enabled' | 'searchable';
type SortValue = 'default' | 'name' | 'usage';

interface CheckResult {
  available: boolean;
  status: string;
  responseTime: number;
  error: string | null;
}

interface AvailabilitySummary {
  totalChecks: number;
  availableCount: number;
  availabilityRate: number;
  avgResponseTime: number;
}

interface GroupedCategory {
  id: string;
  name: string;
  icon?: string;
  items: SourceCatalogItem[];
}

interface GroupedMajor {
  id: string;
  name: string;
  categories: GroupedCategory[];
}

export interface SourceBoardProps {
  /** 返回搜索：由父级决定回到上一个搜索 Tab，缺省回退到 jav */
  onBackToSearch?: () => void;
}

/** 源看板：只读浏览已收录源、按分类分组、查看详情与状态，不参与搜索链路 */
export const SourceBoard: React.FC<SourceBoardProps> = ({ onBackToSearch }) => {
  const { t } = useTranslation(['sourceBoard', 'tabs']);
  const navigate = useNavigate();

  const [stats, setStats] = useState<SourceBoardStats | null>(null);
  const [majorCategories, setMajorCategories] = useState<MajorCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [majorCategoryId, setMajorCategoryId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [siteType, setSiteType] = useState('');
  const [scope, setScope] = useState<ScopeValue>('all');
  const [sort, setSort] = useState<SortValue>('default');

  const [items, setItems] = useState<SourceCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [checkMap, setCheckMap] = useState<Record<string, CheckResult>>({});
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SourceDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailChecking, setDetailChecking] = useState(false);
  const [detailCheck, setDetailCheck] = useState<CheckResult | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchToggling, setBatchToggling] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftSubtitle, setDraftSubtitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);
  const [customSaved, setCustomSaved] = useState(false);

  const requestIdRef = useRef(0);

  const loadStats = useCallback(async () => {
    const response = await sourceApi.getSourceStats();
    if (response.success && response.data) setStats(response.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [majorRes] = await Promise.all([
        sourceApi.getMajorCategories(),
        loadStats(),
      ]);
      if (cancelled) return;
      if (majorRes.success) setMajorCategories(majorRes.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStats]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await sourceApi.getCategories(majorCategoryId || undefined);
      if (cancelled) return;
      if (response.success) setCategories(response.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [majorCategoryId]);

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  const fetchPage = useCallback(
    async (targetPage: number) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const response = await sourceApi.getSourceCatalog({
          keyword: keyword || undefined,
          majorCategoryId: majorCategoryId || undefined,
          categoryId: categoryId || undefined,
          siteType: siteType || undefined,
          scope,
          sort,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        if (!response.success) {
          setError(t('sourceBoard:list.error'));
          return;
        }
        setItems((prev) =>
          targetPage === 1 ? response.data.items : [...prev, ...response.data.items]
        );
        setTotal(response.data.total);
        setHasMore(response.data.hasMore);
        setPage(targetPage);
      } catch {
        if (requestId === requestIdRef.current) setError(t('sourceBoard:list.error'));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [keyword, majorCategoryId, categoryId, siteType, scope, sort, t]
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage, refreshKey]);

  const groups = useMemo<GroupedMajor[]>(() => {
    const majors = new Map<string, GroupedMajor>();
    items.forEach((item) => {
      const majorKey = item.majorCategoryId || 'uncategorized';
      let major = majors.get(majorKey);
      if (!major) {
        major = {
          id: majorKey,
          name: item.majorCategoryName || t('sourceBoard:uncategorized'),
          categories: [],
        };
        majors.set(majorKey, major);
      }
      const categoryKey = item.categoryId;
      let category = major.categories.find((c) => c.id === categoryKey);
      if (!category) {
        category = {
          id: categoryKey,
          name: item.categoryName || t('sourceBoard:uncategorized'),
          icon: item.categoryIcon,
          items: [],
        };
        major.categories.push(category);
      }
      category.items.push(item);
    });
    return Array.from(majors.values());
  }, [items, t]);

  const handleRefresh = useCallback(() => {
    void loadStats();
    setRefreshKey((key) => key + 1);
  }, [loadStats]);

  const openDetail = useCallback(async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailCheck(null);
    setAvailability(null);
    setDetailLoading(true);
    setAvailabilityLoading(true);
    setCustomSaved(false);
    try {
      const response = await sourceApi.getSourceById(id);
      if (response.success) {
        setDetail(response.data);
        setDraftName(response.data.userConfig?.customName || '');
        setDraftSubtitle(response.data.userConfig?.customSubtitle || '');
        setDraftNotes(response.data.userConfig?.notes || '');
      }
    } finally {
      setDetailLoading(false);
    }
    try {
      const history = await sourceApi.getSourceStatusHistory(id, 50, 24);
      if (history.success && history.data) setAvailability(history.data.summary);
    } finally {
      setAvailabilityLoading(false);
    }
  }, []);

  const handleDetailCheck = useCallback(async () => {
    if (!detailId) return;
    setDetailChecking(true);
    try {
      const response = await sourceApi.checkSourceStatus(detailId);
      if (response.success && response.data) setDetailCheck(response.data);
    } finally {
      setDetailChecking(false);
    }
  }, [detailId]);

  const handleInlineCheck = useCallback(async (id: string) => {
    setCheckingIds((prev) => new Set(prev).add(id));
    try {
      const response = await sourceApi.checkSourceStatus(id);
      if (response.success && response.data) {
        setCheckMap((prev) => ({ ...prev, [id]: response.data }));
      }
    } finally {
      setCheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      setTogglingIds((prev) => new Set(prev).add(id));
      try {
        const response = await sourceApi.updateUserSourceConfig(id, { isEnabled: !enabled });
        if (response.success) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    enabled: !enabled,
                    userConfig: item.userConfig
                      ? { ...item.userConfig, isEnabled: !enabled }
                      : item.userConfig,
                  }
                : item
            )
          );
          setDetail((prev) =>
            prev && prev.source.id === id
              ? {
                  ...prev,
                  enabled: !enabled,
                  userConfig: prev.userConfig
                    ? { ...prev.userConfig, isEnabled: !enabled }
                    : prev.userConfig,
                }
              : prev
          );
          void loadStats();
        }
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [loadStats]
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatchToggle = useCallback(
    async (enabled: boolean) => {
      if (selectedIds.size === 0) return;
      setBatchToggling(true);
      try {
        const response = await sourceApi.batchUpdateUserSourceConfigs({
          configs: Array.from(selectedIds).map((sourceId) => ({ sourceId, isEnabled: enabled })),
        });
        if (response.success) {
          setItems((prev) =>
            prev.map((item) =>
              selectedIds.has(item.id)
                ? {
                    ...item,
                    enabled,
                    userConfig: item.userConfig
                      ? { ...item.userConfig, isEnabled: enabled }
                      : item.userConfig,
                  }
                : item
            )
          );
          setSelectedIds(new Set());
          void loadStats();
        }
      } finally {
        setBatchToggling(false);
      }
    },
    [selectedIds, loadStats]
  );

  const handleSaveCustom = useCallback(async () => {
    if (!detail) return;
    setSavingCustom(true);
    try {
      const response = await sourceApi.updateUserSourceConfig(detail.source.id, {
        customName: draftName.trim() || undefined,
        customSubtitle: draftSubtitle.trim() || undefined,
        notes: draftNotes.trim() || undefined,
      });
      if (response.success) {
        const base: UserSourceConfig = detail.userConfig ?? {
          id: '',
          userId: '',
          sourceId: detail.source.id,
          isEnabled: detail.enabled,
          customPriority: null,
          customName: null,
          customSubtitle: null,
          customIcon: null,
          notes: null,
        };
        const nextConfig: UserSourceConfig = {
          ...base,
          customName: draftName.trim() || null,
          customSubtitle: draftSubtitle.trim() || null,
          notes: draftNotes.trim() || null,
        };
        setDetail({ ...detail, userConfig: nextConfig });
        setItems((prev) =>
          prev.map((item) =>
            item.id === detail.source.id ? { ...item, userConfig: nextConfig } : item
          )
        );
        setCustomSaved(true);
      }
    } finally {
      setSavingCustom(false);
    }
  }, [detail, draftName, draftSubtitle, draftNotes]);

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setMajorCategoryId('');
    setCategoryId('');
    setSiteType('');
    setScope('all');
    setSort('default');
  };

  const statCards = [
    { key: 'total', label: t('sourceBoard:stats.total'), value: stats?.totalSources ?? 0 },
    { key: 'categories', label: t('sourceBoard:stats.categories'), value: stats?.totalCategories ?? 0 },
    { key: 'enabled', label: t('sourceBoard:stats.enabled'), value: stats?.enabledSources ?? 0 },
    { key: 'available', label: t('sourceBoard:stats.available'), value: stats?.availableSources ?? 0 },
  ];

  return (
    <div className="border-t border-surface-100 dark:border-surface-800/70">
      {/* 页头统计 */}
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => (onBackToSearch ? onBackToSearch() : navigate('/main?tab=jav'))}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('sourceBoard:backToSearch')}
              </button>
            </div>
            <h2 className="mt-1 text-lg font-bold text-heading">{t('sourceBoard:title')}</h2>
            <p className="type-meta mt-1">{t('sourceBoard:subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
              {t('sourceBoard:refresh')}
            </button>
            <button
              onClick={() => navigate('/dashboard/sources')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <Settings2 className="h-4 w-4" />
              {t('sourceBoard:manage')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900/40"
            >
              <div className="text-xl font-bold text-stone-800 dark:text-stone-100">{card.value}</div>
              <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{card.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-4 py-3 dark:border-stone-800 sm:px-5">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder={t('sourceBoard:filters.keywordPlaceholder')}
            aria-label={t('sourceBoard:filters.keyword')}
            className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-700 outline-none transition-colors focus:border-amber-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
          />
        </div>

        <select
          value={majorCategoryId}
          aria-label={t('sourceBoard:filters.majorCategory')}
          onChange={(event) => {
            setMajorCategoryId(event.target.value);
            setCategoryId('');
          }}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
        >
          <option value="">{t('sourceBoard:filters.allMajorCategories')}</option>
          {majorCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={categoryId}
          aria-label={t('sourceBoard:filters.category')}
          onChange={(event) => setCategoryId(event.target.value)}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
        >
          <option value="">{t('sourceBoard:filters.allCategories')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={siteType}
          aria-label={t('sourceBoard:filters.siteType')}
          onChange={(event) => setSiteType(event.target.value)}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
        >
          <option value="">{t('sourceBoard:filters.allSiteTypes')}</option>
          <option value="search">{t('sourceBoard:siteTypes.search')}</option>
          <option value="browse">{t('sourceBoard:siteTypes.browse')}</option>
          <option value="reference">{t('sourceBoard:siteTypes.reference')}</option>
          <option value="enriched">{t('sourceBoard:siteTypes.enriched')}</option>
        </select>

        <select
          value={scope}
          aria-label={t('sourceBoard:filters.scope')}
          onChange={(event) => setScope(event.target.value as ScopeValue)}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
        >
          <option value="all">{t('sourceBoard:filters.scopeAll')}</option>
          <option value="mine">{t('sourceBoard:filters.scopeMine')}</option>
          <option value="enabled">{t('sourceBoard:filters.scopeEnabled')}</option>
          <option value="searchable">{t('sourceBoard:filters.scopeSearchable')}</option>
        </select>

        <select
          value={sort}
          aria-label={t('sourceBoard:filters.sort')}
          onChange={(event) => setSort(event.target.value as SortValue)}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
        >
          <option value="default">{t('sourceBoard:filters.sortDefault')}</option>
          <option value="name">{t('sourceBoard:filters.sortName')}</option>
          <option value="usage">{t('sourceBoard:filters.sortUsage')}</option>
        </select>

        <button
          onClick={resetFilters}
          className="rounded-lg px-2.5 py-2 text-sm text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          {t('sourceBoard:filters.reset')}
        </button>
      </div>

      {/* 列表 */}
      <div className="border-t border-stone-100 px-4 py-4 dark:border-stone-800 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-stone-500 dark:text-stone-400">
            {t('sourceBoard:list.total', { count: total })}
          </div>
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 px-2 py-1.5 dark:border-amber-800/60 dark:bg-amber-900/20">
              <span className="px-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                {t('sourceBoard:batch.selected', { count: selectedIds.size })}
              </span>
              <button
                onClick={() => void handleBatchToggle(true)}
                disabled={batchToggling}
                className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-60 dark:bg-stone-900 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
              >
                {t('sourceBoard:batch.enable')}
              </button>
              <button
                onClick={() => void handleBatchToggle(false)}
                disabled={batchToggling}
                className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-60 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                {t('sourceBoard:batch.disable')}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={batchToggling}
                className="rounded-lg px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-white disabled:opacity-60 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                {t('sourceBoard:batch.clear')}
              </button>
              {batchToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" /> : null}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-600 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {!error && !loading && items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {scope === 'mine' ? t('sourceBoard:list.emptyMine') : t('sourceBoard:list.empty')}
          </div>
        ) : null}

        <div className="space-y-5">
          {groups.map((major) => (
            <section key={major.id}>
              <h3 className="mb-2 text-sm font-bold text-stone-700 dark:text-stone-200">{major.name}</h3>
              <div className="space-y-3">
                {major.categories.map((category) => (
                  <div key={category.id}>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
                      {category.icon ? <span>{category.icon}</span> : null}
                      <span>{category.name}</span>
                      <span className="text-stone-400 dark:text-stone-500">· {category.items.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {category.items.map((item) => {
                        const inlineCheck = checkMap[item.id];
                        const isChecking = checkingIds.has(item.id);
                        const isToggling = togglingIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className="group relative flex flex-col rounded-xl border border-stone-200 bg-white transition-all hover:border-amber-300 hover:shadow-sm dark:border-stone-800 dark:bg-stone-900/50 dark:hover:border-amber-700/60"
                          >
                            <label className="absolute right-2 top-2 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-stone-200 bg-white/90 dark:border-stone-700 dark:bg-stone-900/90">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(item.id)}
                                onChange={() => toggleSelected(item.id)}
                                aria-label={t('sourceBoard:batch.select', {
                                  name: item.userConfig?.customName || item.name,
                                })}
                                className="h-3.5 w-3.5 cursor-pointer accent-amber-500"
                              />
                            </label>
                            <button
                              onClick={() => void openDetail(item.id)}
                              className="flex items-start gap-2.5 px-3 pt-2.5 pr-7 text-left"
                            >
                              <span className="mt-0.5 text-lg leading-none">
                                {item.userConfig?.customIcon || item.icon || '🔗'}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
                                    {item.userConfig?.customName || item.name}
                                  </span>
                                  {!item.isSystem ? (
                                    <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                      {t('sourceBoard:badges.custom')}
                                    </span>
                                  ) : null}
                                  {!item.enabled ? (
                                    <span className="shrink-0 rounded bg-stone-200 px-1 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-stone-700 dark:text-stone-300">
                                      {t('sourceBoard:badges.disabled')}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-stone-400">
                                  {item.userConfig?.customSubtitle || item.subtitle || item.description}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-stone-400 dark:text-stone-500">
                                  <span className="rounded bg-stone-100 px-1 py-0.5 dark:bg-stone-800">
                                    {t(siteTypeKey[item.siteType] || siteTypeKey.browse)}
                                  </span>
                                  {item.searchable ? (
                                    <span className="rounded bg-emerald-50 px-1 py-0.5 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                                      {t('sourceBoard:badges.searchable')}
                                    </span>
                                  ) : null}
                                  <span>{t('sourceBoard:usage', { count: item.usageCount })}</span>
                                  {inlineCheck ? (
                                    <span
                                      className={clsx(
                                        'rounded px-1 py-0.5',
                                        inlineCheck.available
                                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                                          : 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-300'
                                      )}
                                    >
                                      {inlineCheck.available
                                        ? t('sourceBoard:detail.statusAvailable')
                                        : t('sourceBoard:detail.statusUnavailable')}
                                      {` · ${inlineCheck.responseTime}ms`}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                            </button>

                            {/* 行内操作 */}
                            <div className="mt-2 flex items-center justify-between gap-1 border-t border-stone-100 px-2 py-1.5 dark:border-stone-800">
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => void handleInlineCheck(item.id)}
                                  disabled={isChecking}
                                  title={t('sourceBoard:actions.check')}
                                  aria-label={t('sourceBoard:actions.check')}
                                  className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-60 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                                >
                                  {isChecking ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Activity className="h-4 w-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => void handleToggle(item.id, item.enabled)}
                                  disabled={isToggling}
                                  title={
                                    item.enabled
                                      ? t('sourceBoard:actions.disable')
                                      : t('sourceBoard:actions.enable')
                                  }
                                  aria-label={
                                    item.enabled
                                      ? t('sourceBoard:actions.disable')
                                      : t('sourceBoard:actions.enable')
                                  }
                                  className={clsx(
                                    'rounded-lg p-1.5 transition-colors disabled:opacity-60',
                                    item.enabled
                                      ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                      : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800'
                                  )}
                                >
                                  {isToggling ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Power className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                              <a
                                href={item.homepageUrl || item.urlTemplate.replace('{keyword}', '')}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={t('sourceBoard:actions.open')}
                                aria-label={t('sourceBoard:actions.open')}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {t('sourceBoard:actions.open')}
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('sourceBoard:list.loading')}
          </div>
        ) : null}

        {!loading && hasMore ? (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => void fetchPage(page + 1)}
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {t('sourceBoard:list.loadMore')}
            </button>
          </div>
        ) : null}
      </div>

      {/* 详情抽屉 */}
      {detailId ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailId(null)}
            aria-hidden="true"
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl dark:bg-stone-900">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
              <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">
                {t('sourceBoard:detail.title')}
              </span>
              <button
                onClick={() => setDetailId(null)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                aria-label={t('sourceBoard:detail.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('sourceBoard:list.loading')}
              </div>
            ) : detail ? (
              <div className="flex-1 space-y-4 px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">
                    {detail.userConfig?.customIcon || detail.source.icon || '🔗'}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-stone-800 dark:text-stone-100">
                      {detail.userConfig?.customName || detail.source.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      {detail.userConfig?.customSubtitle || detail.source.subtitle || detail.source.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {detail.categoryPath.map((node) => (
                    <span
                      key={`${node.type}-${node.id}`}
                      className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                    >
                      {node.name}
                    </span>
                  ))}
                  <span
                    className={clsx(
                      'rounded px-1.5 py-0.5',
                      detail.enabled
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                    )}
                  >
                    {detail.enabled
                      ? t('sourceBoard:badges.enabled')
                      : t('sourceBoard:badges.disabled')}
                  </span>
                </div>

                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500 dark:text-stone-400">{t('sourceBoard:detail.siteType')}</dt>
                    <dd className="text-stone-700 dark:text-stone-200">
                      {t(siteTypeKey[detail.source.siteType] || siteTypeKey.browse)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500 dark:text-stone-400">{t('sourceBoard:detail.usage')}</dt>
                    <dd className="text-stone-700 dark:text-stone-200">
                      {t('sourceBoard:detail.usageValue', { count: detail.source.usageCount })}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500 dark:text-stone-400">{t('sourceBoard:detail.status')}</dt>
                    <dd
                      className={clsx(
                        detailCheck
                          ? detailCheck.available
                            ? 'text-emerald-600 dark:text-emerald-300'
                            : 'text-red-500 dark:text-red-300'
                          : detail.status
                            ? detail.status.available
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : 'text-red-500 dark:text-red-300'
                            : 'text-stone-400 dark:text-stone-500'
                      )}
                    >
                      {detailCheck
                        ? detailCheck.available
                          ? t('sourceBoard:detail.statusAvailable')
                          : t('sourceBoard:detail.statusUnavailable')
                        : detail.status
                          ? detail.status.available
                            ? t('sourceBoard:detail.statusAvailable')
                            : t('sourceBoard:detail.statusUnavailable')
                          : t('sourceBoard:detail.statusUnknown')}
                      {detailCheck ? ` · ${detailCheck.responseTime}ms` : null}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500 dark:text-stone-400">{t('sourceBoard:detail.availability')}</dt>
                    <dd className="text-stone-700 dark:text-stone-200">
                      {availabilityLoading
                        ? t('sourceBoard:detail.availabilityLoading')
                        : availability && availability.totalChecks > 0
                          ? t('sourceBoard:detail.availabilityValue', {
                              rate: availability.availabilityRate,
                              count: availability.totalChecks,
                            })
                          : t('sourceBoard:detail.availabilityNone')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-500 dark:text-stone-400">{t('sourceBoard:detail.urlTemplate')}</dt>
                    <dd className="mt-0.5 break-all rounded bg-stone-100 px-2 py-1 font-mono text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                      {detail.source.urlTemplate}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500 dark:text-stone-400">{t('sourceBoard:detail.homepage')}</dt>
                    <dd className="min-w-0 truncate text-right">
                      {detail.source.homepageUrl ? (
                        <a
                          href={detail.source.homepageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-600 hover:underline dark:text-amber-400"
                        >
                          {detail.source.homepageUrl}
                        </a>
                      ) : (
                        <span className="text-stone-400 dark:text-stone-500">-</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="space-y-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
                  <div className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                    {t('sourceBoard:detail.customize')}
                  </div>
                  <input
                    value={draftName}
                    onChange={(event) => {
                      setDraftName(event.target.value);
                      setCustomSaved(false);
                    }}
                    placeholder={t('sourceBoard:detail.customName')}
                    aria-label={t('sourceBoard:detail.customName')}
                    className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                  />
                  <input
                    value={draftSubtitle}
                    onChange={(event) => {
                      setDraftSubtitle(event.target.value);
                      setCustomSaved(false);
                    }}
                    placeholder={t('sourceBoard:detail.customSubtitle')}
                    aria-label={t('sourceBoard:detail.customSubtitle')}
                    className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                  />
                  <textarea
                    value={draftNotes}
                    onChange={(event) => {
                      setDraftNotes(event.target.value);
                      setCustomSaved(false);
                    }}
                    rows={2}
                    placeholder={t('sourceBoard:detail.notesPlaceholder')}
                    aria-label={t('sourceBoard:detail.notes')}
                    className="w-full resize-none rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-700 outline-none focus:border-amber-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleSaveCustom()}
                      disabled={savingCustom}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
                    >
                      {savingCustom ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {savingCustom
                        ? t('sourceBoard:detail.saving')
                        : t('sourceBoard:detail.save')}
                    </button>
                    {customSaved ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-300">
                        {t('sourceBoard:detail.saved')}
                      </span>
                    ) : null}
                  </div>
                </div>

                {detail.source.description ? (
                  <div>
                    <div className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">
                      {t('sourceBoard:detail.description')}
                    </div>
                    <p className="text-sm text-stone-700 dark:text-stone-200">{detail.source.description}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => void handleDetailCheck()}
                    disabled={detailChecking}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  >
                    {detailChecking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Activity className="h-4 w-4" />
                    )}
                    {detailChecking
                      ? t('sourceBoard:detail.checking')
                      : t('sourceBoard:detail.check')}
                  </button>
                  <button
                    onClick={() => void handleToggle(detail.source.id, detail.enabled)}
                    disabled={togglingIds.has(detail.source.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  >
                    {togglingIds.has(detail.source.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                    {detail.enabled
                      ? t('sourceBoard:actions.disable')
                      : t('sourceBoard:actions.enable')}
                  </button>
                  <a
                    href={
                      detail.source.homepageUrl ||
                      detail.source.urlTemplate.replace('{keyword}', '')
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t('sourceBoard:detail.visit')}
                  </a>
                  <button
                    onClick={() => navigate('/dashboard/sources')}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-stone-500 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                  >
                    <Settings2 className="h-4 w-4" />
                    {t('sourceBoard:detail.manage')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-stone-500">
                {t('sourceBoard:list.error')}
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
};

SourceBoard.displayName = 'SourceBoard';
