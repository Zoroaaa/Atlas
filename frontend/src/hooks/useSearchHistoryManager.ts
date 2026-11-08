import { useEffect, useState } from 'react';
import { useSearchHistoryPage, useClearSearchHistory, useBatchDeleteSearchHistory, SEARCH_HISTORY_PAGE_SIZE } from '@/hooks';
import { useToast } from '@/hooks/useNotification';
import i18next from '@/i18n';

export function useSearchHistoryManager() {
  const toast = useToast();
  const [historyPageNo, setHistoryPageNo] = useState(1);
  const pageQuery = useSearchHistoryPage(historyPageNo);
  const searchHistory = pageQuery.data?.history ?? [];
  const historyTotal = pageQuery.data?.total ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / SEARCH_HISTORY_PAGE_SIZE));
  const isLoadingHistory = pageQuery.isLoading;

  // 删除/清空后当前页可能越界，回退到最后一页
  useEffect(() => {
    if (!pageQuery.isPlaceholderData && pageQuery.data && historyPageNo > historyTotalPages) {
      setHistoryPageNo(historyTotalPages);
    }
  }, [pageQuery.data, pageQuery.isPlaceholderData, historyPageNo, historyTotalPages]);
  const clearHistoryMutation = useClearSearchHistory();
  const batchDeleteMutation = useBatchDeleteSearchHistory();

  const handleClearHistory = async () => {
    if (!confirm(i18next.t('errors:hooks.search.confirmClearAll'))) return;
    try {
      await clearHistoryMutation.mutateAsync();
      toast.success(i18next.t('errors:hooks.search.historyClearedTitle'));
    } catch { toast.error(i18next.t('errors:hooks.search.clearHistoryFailedTitle'), i18next.t('errors:hooks.search.retryDefault')); }
  };

  const handleDeleteSelected = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const result = await batchDeleteMutation.mutateAsync(ids);
      if (result.success) {
        toast.success(i18next.t('errors:hooks.search.deleteSuccessTitle'), result.message);
      }
    } catch {
      toast.error(i18next.t('errors:hooks.search.deleteFailedTitle'), i18next.t('errors:hooks.search.retryDefault'));
    }
  };

  return {
    searchHistory,
    historyTotal,
    historyTotalPages,
    historyPageNo,
    setHistoryPageNo,
    isLoadingHistory,
    handleClearHistory,
    handleDeleteSelected,
  };
}
