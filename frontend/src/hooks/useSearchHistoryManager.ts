import { useSearchHistory, useClearSearchHistory } from '@/hooks';
import { useToast } from '@/components/ui/Toast';
import { userApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import i18next from '@/i18n';
import { searchHistoryKeys } from './useSearchHistoryQuery';

export function useSearchHistoryManager() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: searchHistory = [], isLoading: isLoadingHistory } = useSearchHistory(20);
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
    isLoadingHistory,
    handleClearHistory,
    handleDeleteSelected,
  };
}
