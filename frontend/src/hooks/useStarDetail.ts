import { useState, useCallback } from 'react';
import { apiClient } from '@/services/api';
import type { StarDetail } from '@/types/jav';

type StarStatus = 'idle' | 'loading' | 'success' | 'error';

export function useStarDetail() {
  const [detail, setDetail] = useState<StarDetail | null>(null);
  const [status, setStatus] = useState<StarStatus>('idle');

  const fetch = useCallback(async (key: string) => {
    if (!key) return;
    setStatus('loading');
    setDetail(null);

    try {
      const resp = await apiClient.get<{ success: boolean; data: StarDetail }>(`/jav/star/${key}`);
      if (resp.success && resp.data) {
        setDetail(resp.data);
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setDetail(null);
    setStatus('idle');
  }, []);

  return { detail, status, fetch, reset };
}
