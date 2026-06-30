import { useState } from 'react';
import { useJavDetail } from '@/hooks';
import type { JavDetail } from '@/types/jav';

export function useJavSearchFlow() {
  const { detail: fetchedDetail, status: javDetailStatus, fetch: fetchJavDetail, reset: resetJavDetail } = useJavDetail();
  const [javEnrichedDetail, setJavEnrichedDetail] = useState<JavDetail | null>(null);

  // 合并 detail：优先使用 enriched（搜索接口直接返回），fallback 到 fetched（二次请求）
  const javDetail = javEnrichedDetail || fetchedDetail;
  const combinedStatus = javEnrichedDetail ? 'success' as const : javDetailStatus;

  const resetAll = () => {
    resetJavDetail();
    setJavEnrichedDetail(null);
  };

  return {
    javDetail,
    javDetailStatus: combinedStatus,
    javEnrichedDetail,
    fetchJavDetail,
    resetJavDetail: resetAll,
    setJavEnrichedDetail,
  };
}
