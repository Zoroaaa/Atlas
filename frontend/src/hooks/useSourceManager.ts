import { useState, useRef, useEffect } from 'react';
import { useMajorCategories, useCategories, useSourcesWithUserConfig } from '@/hooks';
import { sourceApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import i18next from '@/i18n';
import type { MajorCategory, Category, SearchSource, UserSourceConfig } from '@/types';

interface SourceWithUserConfig extends SearchSource {
  userConfig?: UserSourceConfig | null;
}

interface CategoryWithSources extends Category {
  sources: SourceWithUserConfig[];
}

interface MajorCategoryWithCategories extends MajorCategory {
  categories: CategoryWithSources[];
}

export function useSourceManager() {
  const toast = useToast();
  const { data: majorCategories = [] } = useMajorCategories();
  const { data: categories = [] } = useCategories();
  const { data: allSourcesData = [] } = useSourcesWithUserConfig();

  const [expandedMajorCategories, setExpandedMajorCategories] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const [batchCheckResults, setBatchCheckResults] = useState<Record<string, {
    status: string;
    available: boolean;
    responseTime: number;
    error: string | null;
  }>>({});

  // 源数据加载后初始化展开状态
  const sourcesInitializedRef = useRef(false);
  useEffect(() => {
    if (!sourcesInitializedRef.current && majorCategories.length > 0) {
      setExpandedMajorCategories(new Set(majorCategories.map(c => c.id)));
      sourcesInitializedRef.current = true;
    }
  }, [majorCategories]);

  const categoriesInitializedRef = useRef(false);
  useEffect(() => {
    if (!categoriesInitializedRef.current && categories.length > 0) {
      setExpandedCategories(new Set(categories.map(c => c.id)));
      categoriesInitializedRef.current = true;
    }
  }, [categories]);

  const allSources: SourceWithUserConfig[] = allSourcesData;

  const toggleMajorCategory = (id: string) => {
    const next = new Set(expandedMajorCategories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedMajorCategories(next);
  };

  const toggleCategory = (id: string) => {
    const next = new Set(expandedCategories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedCategories(next);
  };

  const getMajorCategoriesWithCategories = (): MajorCategoryWithCategories[] =>
    majorCategories.map(mc => {
      const cats = categories.filter(c => c.majorCategoryId === mc.id);
      const categoriesWithSources: CategoryWithSources[] = cats.map(cat => ({
        ...cat,
        sources: allSources.filter(s => s.categoryId === cat.id),
      })).filter(c => c.sources.length > 0);
      return { ...mc, categories: categoriesWithSources };
    }).filter(mc => mc.categories.length > 0);

  const handleBatchCheckSources = async () => {
    const checkableSources = allSources.filter(s => s.searchable || s.homepageUrl);
    if (checkableSources.length === 0) { toast.warning(i18next.t('errors:hooks.source.noCheckableSourcesTitle')); return; }
    setIsBatchChecking(true);
    setBatchCheckResults({});
    let totalAvailable = 0;
    let totalChecked = 0;
    try {
      const sourceIds = checkableSources.map(s => s.id);
      for (let i = 0; i < sourceIds.length; i += 20) {
        const batch = sourceIds.slice(i, i + 20);
        try {
          const response = await sourceApi.batchCheckSourceStatus(batch);
          if (response.success && response.data) {
            const newResults: typeof batchCheckResults = {};
            response.data.results.forEach(result => {
              newResults[result.sourceId] = { status: result.status, available: result.available, responseTime: result.responseTime, error: result.error };
              if (result.available) totalAvailable++;
              totalChecked++;
            });
            setBatchCheckResults(prev => ({ ...prev, ...newResults }));
          }
        } catch { /* 单批失败不中断 */ }
      }
      const unavailable = totalChecked - totalAvailable;
      if (unavailable === 0) {
        toast.success(i18next.t('errors:hooks.source.batchCheckAllSuccessTitle', { count: totalChecked }));
      } else {
        toast.warning(i18next.t('errors:hooks.source.batchCheckPartialTitle', { available: totalAvailable, total: totalChecked, unavailable }));
      }
    } catch { toast.error(i18next.t('errors:hooks.source.batchCheckFailedTitle'), i18next.t('errors:hooks.source.batchCheckFailedMessage')); }
    finally { setIsBatchChecking(false); }
  };

  const handleCheckSingleSource = async (sourceId: string) => {
    try {
      const response = await sourceApi.checkSourceStatus(sourceId);
      if (response.success && response.data) {
        setBatchCheckResults(prev => ({
          ...prev,
          [sourceId]: { status: response.data.status, available: response.data.available, responseTime: response.data.responseTime, error: response.data.error },
        }));
        const { status, available, responseTime, error } = response.data;
        if (available) {
          toast.success(status === 'restricted' ? i18next.t('errors:hooks.source.onlineRestrictedTitle') : i18next.t('errors:hooks.source.onlineTitle'), i18next.t('errors:hooks.source.responseTimeMessage', { time: responseTime }));
        } else {
          toast.error(i18next.t('errors:hooks.source.checkFailedTitle'), status === 'timeout' ? i18next.t('errors:hooks.source.timeoutMessage') : error || i18next.t('errors:hooks.source.unavailableMessage'));
        }
      }
    } catch { toast.error(i18next.t('errors:hooks.source.checkFailedTitle'), i18next.t('errors:hooks.source.checkFailedMessage')); }
  };

  return {
    majorCategories,
    categories,
    allSources,
    expandedMajorCategories,
    expandedCategories,
    isBatchChecking,
    batchCheckResults,
    toggleMajorCategory,
    toggleCategory,
    getMajorCategoriesWithCategories,
    handleBatchCheckSources,
    handleCheckSingleSource,
  };
}
