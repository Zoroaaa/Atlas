/**
 * 源管理状态：源树的展开态、批量/单个健康检查与检查结果。
 *
 * 约束：展开态只在首次拿到数据时初始化一次，此后由用户操作决定，避免数据刷新把折叠状态重置。
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useUserSourceTree } from '@/hooks';
import { sourceApi } from '@/services/api';
import { useToast } from '@/hooks/useNotification';
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

/** 源管理：展开态、源树组装与健康检查 */
export function useSourceManager() {
  const toast = useToast();
  const { data: tree } = useUserSourceTree();

  // 搜索工作台的源树需要同时包含系统树与个人私有树，否则自建源不会出现在侧栏
  const majorCategories = useMemo(
    () => [...(tree?.system.majorCategories || []), ...(tree?.mine.majorCategories || [])],
    [tree]
  );
  const categories = useMemo(
    () => [...(tree?.system.categories || []), ...(tree?.mine.categories || [])],
    [tree]
  );
  const allSources: SourceWithUserConfig[] = useMemo(
    () => [
      ...(tree?.system.sources || []),
      ...(tree?.mine.sources || []).map(source => ({ ...source, userConfig: null })),
    ],
    [tree]
  );

  const [expandedMajorCategories, setExpandedMajorCategories] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const [batchCheckResults, setBatchCheckResults] = useState<Record<string, {
    status: string;
    available: boolean;
    responseTime: number;
    note: string;
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

  // 空分类与空大类不进入树，避免展示没有任何源的空节点
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
    // 只有可搜索或有主页地址的源才有可探测目标，其余直接跳过
    const checkableSources = allSources.filter(s => s.searchable || s.homepageUrl);
    if (checkableSources.length === 0) { toast.warning(i18next.t('errors:hooks.source.noCheckableSourcesTitle')); return; }
    setIsBatchChecking(true);
    setBatchCheckResults({});
    let totalAvailable = 0;
    let totalChecked = 0;
    let quotaMessage: string | null = null;
    try {
      const sourceIds = checkableSources.map(s => s.id);
      // 每批 20 条：健康检查耗时长，分批降低超时风险；单批失败不中断后续批次
      for (let i = 0; i < sourceIds.length; i += 20) {
        const batch = sourceIds.slice(i, i + 20);
        try {
          const response = await sourceApi.batchCheckSourceStatus(batch);
          if (response.success && response.data) {
            const newResults: typeof batchCheckResults = {};
            response.data.results.forEach(result => {
              newResults[result.sourceId] = {
                status: result.status,
                available: result.available,
                responseTime: result.responseTime,
                note: result.note,
              };
              if (result.available) totalAvailable++;
              totalChecked++;
            });
            setBatchCheckResults(prev => ({ ...prev, ...newResults }));
          }
        } catch (err) {
          // 配额用完后再继续只会让剩余批次全部失败，直接停止并提示剩余数量
          quotaMessage = err instanceof Error ? err.message : i18next.t('errors:hooks.source.batchCheckFailedTitle');
          break;
        }
      }
      const unavailable = totalChecked - totalAvailable;
      if (quotaMessage) {
        toast.warning(i18next.t('errors:hooks.source.batchCheckQuotaTitle'), quotaMessage);
      } else if (unavailable === 0) {
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
          [sourceId]: {
            status: response.data.status,
            available: response.data.available,
            responseTime: response.data.responseTime,
            note: response.data.note,
          },
        }));
        const { available, note } = response.data;
        if (available) {
          toast.success(i18next.t('errors:hooks.source.onlineTitle'), note);
        } else {
          toast.error(i18next.t('errors:hooks.source.checkFailedTitle'), note);
        }
      }
    } catch (err) {
      toast.error(
        i18next.t('errors:hooks.source.checkFailedTitle'),
        err instanceof Error ? err.message : i18next.t('errors:hooks.source.checkFailedMessage')
      );
    }
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
