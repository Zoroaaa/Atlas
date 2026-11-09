/**
 * useServiceWorkerUpdate — 用户确认后再应用的 Service Worker 更新流程。
 *
 * - 新版本安装后停留在 waiting，不自动接管
 * - 同一 waiting worker 只提示一次；「稍后」按版本号持久化，新版本到达时会再次提示
 * - 用户确认时若仍有在途 API 请求，先等待请求结束再 skipWaiting + 刷新
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import i18next from '@/i18n';
import { getInflightRequestCount, waitForInflightRequests } from '@/services/api/client';

export type SwUpdateStatus = 'idle' | 'available' | 'waiting' | 'applying';

const DISMISS_STORAGE_KEY = 'pwa:update-dismissed-version';
const UNKNOWN_VERSION = '__unknown__';

const readDismissedVersion = (): string | null => {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeDismissedVersion = (version: string): void => {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, version);
  } catch {
    // 隐私模式下 localStorage 不可写，忽略即可（仅失去跨会话去重）
  }
};

/** 向 waiting 中的 SW 查询构建版本号，用于区分不同更新 */
const getWorkerVersion = (worker: ServiceWorker): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      const channel = new MessageChannel();
      const timer = window.setTimeout(() => {
        channel.port1.close();
        resolve(null);
      }, 1500);
      channel.port1.onmessage = (event: MessageEvent) => {
        window.clearTimeout(timer);
        channel.port1.close();
        resolve(typeof event.data?.version === 'string' ? event.data.version : null);
      };
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      resolve(null);
    }
  });

export interface ServiceWorkerUpdateState {
  status: SwUpdateStatus;
  applyUpdate: () => void;
  dismissUpdate: () => void;
}

export const useServiceWorkerUpdate = (): ServiceWorkerUpdateState => {
  const [status, setStatus] = useState<SwUpdateStatus>('idle');
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const notifiedWorkerRef = useRef<ServiceWorker | null>(null);
  const waitingVersionRef = useRef<string | null>(null);
  const reloadRequestedRef = useRef(false);

  const announce = useCallback(async (worker: ServiceWorker | null) => {
    if (!worker || notifiedWorkerRef.current === worker) return;
    notifiedWorkerRef.current = worker;

    const version = await getWorkerVersion(worker);
    // 用户对同一版本选择过「稍后」，不再重复打扰；新版本版本号变化后会再次提示
    if ((version ?? UNKNOWN_VERSION) === readDismissedVersion()) return;

    waitingWorkerRef.current = worker;
    waitingVersionRef.current = version;
    setStatus('available');
  }, []);

  useEffect(() => {
    // 开发环境不注册 SW：缓存会遮蔽 HMR 与最新代码
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          // 绕过 HTTP 缓存，确保每次都能拿到最新的 SW
          updateViaCache: 'none',
        });
        if (cancelled) return;
        registrationRef.current = registration;

        // 页面加载时已有等待中的新版本（例如上次未确认就关闭了页面）
        if (registration.waiting && navigator.serviceWorker.controller) {
          void announce(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              void announce(registration.waiting || installing);
            }
          });
        });
      } catch (error) {
        console.error(i18next.t('sw:registerFailed', { error: String(error) }));
      }
    };

    if (document.readyState === 'complete') {
      void register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    // 长期停留的页面：定时与回到前台时主动检查更新
    const checkForUpdates = () => {
      void registrationRef.current?.update().catch(() => {});
    };
    const interval = window.setInterval(checkForUpdates, 60 * 60 * 1000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdates();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('load', register);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [announce]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      // 仅在用户本轮确认过更新时刷新，避免其它标签页触发接管导致当前页面被强制刷新
      if (!reloadRequestedRef.current) return;
      if (getInflightRequestCount() > 0) {
        setStatus('waiting');
        void waitForInflightRequests().then(() => window.location.reload());
        return;
      }
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  const applyUpdate = useCallback(async () => {
    const worker = waitingWorkerRef.current;
    if (!worker) return;

    reloadRequestedRef.current = true;
    setStatus('applying');

    if (getInflightRequestCount() > 0) {
      setStatus('waiting');
      await waitForInflightRequests();
    }

    worker.postMessage({ type: 'SKIP_WAITING' });

    // 兜底：极少数情况下 controllerchange 未触发时避免一直停留在更新中；
    // 仍会先等在途请求结束，不打断正在进行的后端操作
    window.setTimeout(() => {
      const reload = async () => {
        if (getInflightRequestCount() > 0) await waitForInflightRequests();
        window.location.reload();
      };
      void reload();
    }, 4000);
  }, []);

  const dismissUpdate = useCallback(() => {
    writeDismissedVersion(waitingVersionRef.current ?? UNKNOWN_VERSION);
    setStatus('idle');
  }, []);

  return { status, applyUpdate, dismissUpdate };
};
