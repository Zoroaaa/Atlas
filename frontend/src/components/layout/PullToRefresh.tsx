import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useNotification';
import { hapticSuccess, hapticTap } from '@/utils/nativeShell';

type RefreshHandler = () => Promise<unknown> | unknown;
type RegisterHandler = (handler: RefreshHandler) => () => void;

const PullToRefreshContext = createContext<RegisterHandler>(() => () => {});

const THRESHOLD = 56;
const MAX_PULL = 84;

/** 页面注册一个下拉刷新回调；页面内多个面板可以同时注册。 */
export function usePullToRefresh(handler: RefreshHandler): void {
  const register = useContext(PullToRefreshContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => register(() => handlerRef.current()), [register]);
}

/**
 * 全局下拉刷新：只在页面顶部、无弹层、单指下滑时触发。
 * 使用 passive 监听，不拦截正常滚动；配合 overscroll-behavior 防止系统回弹。
 */
export const PullToRefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation(['refresh']);
  const queryClient = useQueryClient();
  const toast = useToast();

  const handlers = useRef(new Set<RefreshHandler>());
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const armedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const pullRef = useRef(0);

  const register = useCallback<RegisterHandler>((handler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  const canStart = useCallback((): boolean => {
    if (refreshingRef.current) return false;
    if (window.scrollY > 0) return false;
    const scroller = document.querySelector<HTMLElement>('[data-scroll-container]');
    if (scroller && scroller.scrollTop > 0) return false;
    if (document.querySelector('[role="dialog"]')) return false;
    return true;
  }, []);

  const finishRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    setPull(0);
    pullRef.current = 0;
    void hapticTap('medium');

    // 页面没有注册刷新回调时，至少让全局查询重新校验一次
    const tasks =
      handlers.current.size > 0
        ? Array.from(handlers.current).map((handler) => Promise.resolve().then(handler))
        : [queryClient.invalidateQueries()];

    const results = await Promise.allSettled(tasks);
    // 短请求也保留一个最小可见时长，避免指示器一闪而过
    await new Promise((resolve) => window.setTimeout(resolve, 500));

    const failed = results.some((result) => result.status === 'rejected');
    if (failed) {
      toast.error(t('refresh:failed'));
    } else {
      toast.success(t('refresh:done'));
      void hapticSuccess();
    }

    refreshingRef.current = false;
    armedRef.current = false;
    setRefreshing(false);
  }, [queryClient, t, toast]);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !canStart()) return;
      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY, active: true };
    };

    const onTouchMove = (event: TouchEvent) => {
      const start = startRef.current;
      if (!start?.active) return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        pullRef.current = 0;
        setPull(0);
        return;
      }

      const damped = Math.min(MAX_PULL, dy * 0.45);
      pullRef.current = damped;
      setPull(damped);

      if (damped >= THRESHOLD && !armedRef.current) {
        armedRef.current = true;
        void hapticTap('light');
      } else if (damped < THRESHOLD) {
        armedRef.current = false;
      }
    };

    const onTouchEnd = () => {
      const start = startRef.current;
      if (!start?.active) return;
      start.active = false;

      const distance = pullRef.current;

      if (distance >= THRESHOLD) {
        void finishRefresh();
      } else {
        armedRef.current = false;
        pullRef.current = 0;
        setPull(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [canStart, finishRefresh]);

  const active = pull > 0 || refreshing;
  const armed = pull >= THRESHOLD;

  return (
    <PullToRefreshContext.Provider value={register}>
      {children}
      {/* 始终挂载，松手后才能看到回弹；空闲时仅透明隐藏 */}
      <div
        className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center"
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
        aria-hidden={!active}
      >
        <div
          className={clsx(
            'flex h-9 w-9 items-center justify-center rounded-full border shadow-soft backdrop-blur',
            armed || refreshing
              ? 'border-amber-400/90 bg-white text-amber-600 dark:border-amber-400/50 dark:bg-surface-800 dark:text-amber-300'
              : 'border-stone-200/80 bg-white/95 text-stone-400 dark:border-stone-700/70 dark:bg-surface-800/95 dark:text-stone-500'
          )}
          style={{
            opacity: active ? 1 : 0,
            transform: `translateY(${refreshing ? 10 : Math.min(pull * 0.6, 36)}px) scale(${
              active ? (armed || refreshing ? 1.05 : 1) : 0.9
            })`,
            transition:
              pull > 0 && !refreshing
                ? 'none'
                : 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 180ms ease',
          }}
        >
          <RefreshCw
            className={clsx('h-4 w-4', refreshing && 'animate-spin')}
            style={!refreshing ? { transform: `rotate(${pull * 3}deg)` } : undefined}
          />
        </div>
      </div>
    </PullToRefreshContext.Provider>
  );
};
