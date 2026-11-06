import { useEffect, useState } from 'react';
import { useSearchHistoryPage, useClearSearchHistory, SEARCH_HISTORY_PAGE_SIZE } from '@/hooks';
import { useToast } from '@/components/ui/Toast';
import { userApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import i18next from '@/i18n';
import { searchHistoryKeys } from './useSearchHistoryQuery';

export function useSearchHistoryManager() {
  const toast = useToast();
  const queryClient = useQueryClient();
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
      const result = await userApi.batchDeleteSearchHistory(ids);
      if (result.success) {
        toast.success(i18next.t('errors:hooks.search.deleteSuccessTitle'), result.message);
        queryClient.invalidateQueries({ queryKey: searchHistoryKeys.all });
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
