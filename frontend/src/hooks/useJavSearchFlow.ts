/**
 * JAV 搜索详情流程：合并「搜索响应内联详情」与「单独请求的详情」，并处理手动回源。
 *
 * 约束：内联详情优先级高于二次请求结果；回源使用 refresh=1，后端会跳过缓存并同步写回本地库。
 */
import { useState, useCallback } from 'react';
import { useJavDetail } from '@/hooks';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/useNotification';
import i18next from '@/i18n';
import type { JavDetail } from '@/types/jav';

/** JAV 详情流程：合并内联与二次请求的详情，提供回源刷新与整体重置 */
export function useJavSearchFlow() {
  const toast = useToast();
  const { detail: fetchedDetail, status: javDetailStatus, fetch: fetchJavDetail, retry: retryJavDetail, reset: resetJavDetail } = useJavDetail();
  const [javEnrichedDetail, setJavEnrichedDetail] = useState<JavDetail | null>(null);
  // 本地库命中后，用户手动回源 JavBus 的请求状态
  const [isPullingExternal, setPullingExternal] = useState(false);

  // 合并 detail：优先使用 enriched（搜索接口直接返回），fallback 到 fetched（二次请求）
  const javDetail = javEnrichedDetail || fetchedDetail;
  const combinedStatus = javEnrichedDetail ? 'success' as const : javDetailStatus;

  /**
   * 回源 JavBus 拉取最新详情（本地库命中时使用）。
   * 后端 refresh=1 会跳过缓存、同步写回本地库，因此这里拿到的是最新数据。
   */
  const pullExternalDetail = useCallback(async () => {
    const code = javDetail?.code;
    if (!code || isPullingExternal) return;
    setPullingExternal(true);
    try {
      const res = await apiClient.get<{ success: boolean; data?: JavDetail; message?: string }>(
        `/jav/detail?code=${encodeURIComponent(code)}&refresh=1`
      );
      if (res.success && res.data) {
        setJavEnrichedDetail(res.data);
        toast.success(i18next.t('jav:detail.pullExternalSuccess'));
      } else {
        toast.error(i18next.t('jav:detail.pullExternalFailed'));
      }
    } catch (err) {
      toast.error(
        i18next.t('jav:detail.pullExternalFailed'),
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setPullingExternal(false);
    }
  }, [javDetail?.code, isPullingExternal, setJavEnrichedDetail, toast]);

  const resetAll = () => {
    resetJavDetail();
    setJavEnrichedDetail(null);
  };

  return {
    javDetail,
    javDetailStatus: combinedStatus,
    javEnrichedDetail,
    fetchJavDetail,
    retryJavDetail,
    resetJavDetail: resetAll,
    setJavEnrichedDetail,
    pullExternalDetail,
    isPullingExternal,
  };
}
