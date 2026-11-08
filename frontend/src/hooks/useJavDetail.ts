import { useState, useCallback, useRef } from 'react';
import { isJavCodeLike, normalizeJavCode } from '@codeseek/shared/utils';
import { apiClient, ApiError } from '@/services/api';
import type { JavDetail } from '@/types';

type Status = 'idle' | 'loading' | 'success' | 'error' | 'not_found';

export function useJavDetail() {
  const [detail, setDetail]   = useState<JavDetail | null>(null);
  const [status, setStatus]   = useState<Status>('idle');
  const [lastCode, setLastCode] = useState<string>('');
  // 请求序号：只接受最后一次请求的响应，避免旧响应覆盖新番号状态
  const requestIdRef = useRef(0);

  const fetch = useCallback(async (code: string) => {
    const normalized = normalizeJavCode(code);
    if (!normalized || !isJavCodeLike(normalized)) return;
    if (normalized === lastCode && status === 'success') return; // 防重复

    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setLastCode(normalized);
    setDetail(null);
    try {
      const res = await apiClient.get(`/jav/detail?code=${encodeURIComponent(normalized)}`) as {
        success: boolean;
        data?: JavDetail;
      };
      if (requestId !== requestIdRef.current) return;
      if (res.success && res.data) {
        setDetail(res.data);
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      // client 对非 2xx 会抛 ApiError，错误码在 data.error.code 上
      const code = error instanceof ApiError ? error.code : undefined;
      setStatus(code === 'NOT_FOUND' ? 'not_found' : 'error');
    }
  }, [lastCode, status]);

  /** 重试上次请求的番号详情（失败态专用；成功态由 fetch 内部去重拦截） */
  const retry = useCallback(() => {
    if (lastCode) fetch(lastCode);
  }, [lastCode, fetch]);

  const reset = useCallback(() => {
    setDetail(null);
    setStatus('idle');
    setLastCode('');
  }, []);

  return { detail, status, lastCode, fetch, retry, reset };
}
