import { useState, useCallback } from 'react';
import { apiClient } from '@/services/api';
import type { JavDetail } from '@/types';

type Status = 'idle' | 'loading' | 'success' | 'error' | 'not_found';

export function useJavDetail() {
  const [detail, setDetail]   = useState<JavDetail | null>(null);
  const [status, setStatus]   = useState<Status>('idle');
  const [lastCode, setLastCode] = useState<string>('');

  const fetch = useCallback(async (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || !/^[A-Z0-9]+-?\d+$/.test(normalized)) return;
    if (normalized === lastCode && status === 'success') return; // 防重复

    setStatus('loading');
    setLastCode(normalized);
    setDetail(null);
    try {
      const res = await apiClient.get(`/jav/detail?code=${encodeURIComponent(normalized)}`) as {
        success: boolean;
        data?: JavDetail;
        error?: { code: string; message: string };
      };
      if (res.success && res.data) {
        setDetail(res.data);
        setStatus('success');
      } else if (res.error?.code === 'NOT_FOUND') {
        setStatus('not_found');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [lastCode, status]);

  const reset = useCallback(() => {
    setDetail(null);
    setStatus('idle');
    setLastCode('');
  }, []);

  return { detail, status, fetch, reset };
}
