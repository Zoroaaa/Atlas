import { useSearchHistory, useClearSearchHistory } from '@/hooks';
import { useToast } from '@/components/ui/Toast';
import { userApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { searchHistoryKeys } from './useSearchHistoryQuery';

export function useSearchHistoryManager() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: searchHistory = [], isLoading: isLoadingHistory } = useSearchHistory(20);
  const clearHistoryMutation = useClearSearchHistory();

  const handleClearHistory = async () => {
    if (!confirm('确定要清空所有搜索历史吗？')) return;
    try {
      await clearHistoryMutation.mutateAsync();
      toast.success('历史已清空');
    } catch { toast.error('清空失败', '请稍后重试'); }
  };

  const handleDeleteSelected = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const result = await userApi.batchDeleteSearchHistory(ids);
      if (result.success) {
        toast.success('删除成功', result.message);
        queryClient.invalidateQueries({ queryKey: searchHistoryKeys.all });
      }
    } catch {
      toast.error('删除失败', '请稍后重试');
    }
  };

  return {
    searchHistory,
    isLoadingHistory,
    handleClearHistory,
    handleDeleteSelected,
  };
}
