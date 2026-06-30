import { useSearchHistory, useClearSearchHistory } from '@/hooks';
import { useToast } from '@/components/ui/Toast';

export function useSearchHistoryManager() {
  const toast = useToast();
  const { data: searchHistory = [], isLoading: isLoadingHistory } = useSearchHistory(20);
  const clearHistoryMutation = useClearSearchHistory();

  const handleClearHistory = async () => {
    if (!confirm('确定要清空所有搜索历史吗？')) return;
    try {
      await clearHistoryMutation.mutateAsync();
      toast.success('历史已清空');
    } catch { toast.error('清空失败', '请稍后重试'); }
  };

  return {
    searchHistory,
    isLoadingHistory,
    handleClearHistory,
  };
}
