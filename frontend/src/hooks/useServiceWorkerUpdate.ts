/**
 * useServiceWorkerUpdate — 用户确认后再应用的 Service Worker 更新流程。
 *
 * - 新版本安装后停留在 waiting，不自动接管
 * - 同一 waiting worker 只提示一次；「稍后」按版本号持久化，新版本到达时会再次提示
 * - 用户点「立即更新」后进入连续更新链：刷新后若仍有 waiting 版本，自动继续，
 *   直到没有待更新版本；次数 / 时间窗口 / 版本不变会中止，避免刷新死循环
 * - 用户确认时若仍有在途 API 请求，先等待请求结束再 skipWaiting + 刷新
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import i18next from '@/i18n';
import { getInflightRequestCount, waitForInflightRequests } from '@/services/api/client';
import {
  clearPwaUpdateLoop,
  decidePwaUpdateLoop,
  PWA_UPDATE_SETTLE_MS,
  readPwaUpdateLoop,
  startPwaUpdateLoop,
  writePwaUpdateLoop,
} from '@/services/pwaUpdateLoop';

export type SwUpdateStatus = 'idle' | 'available' | 'waiting' | 'applying';

const DISMISS_STORAGE_KEY = 'pwa:update-dismissed-version';
const UNKNOWN_VERSION = '__unknown__';

const getSessionStorage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

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

/** 等一个 installing worker 变成 installed（或失败/被替换） */
const waitForInstalled = (worker: ServiceWorker, timeoutMs: number): Promise<ServiceWorker | null> =>
  new Promise((resolve) => {
    if (worker.state === 'installed') {
      resolve(worker);
      return;
    }
    let done = false;
    let timer = 0;
    const onChange = () => {
      if (worker.state === 'installed') finish(worker);
      else if (worker.state === 'redundant' || worker.state === 'activated') finish(null);
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      worker.removeEventListener('statechange', onChange);
    };
    const finish = (value: ServiceWorker | null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };
    timer = window.setTimeout(() => finish(null), timeoutMs);
    worker.addEventListener('statechange', onChange);
  });

/**
 * 刷新后寻找下一个 waiting worker。
 *
 * 先看当前 registration；没有就主动 update()，并给浏览器一个短暂的
 * settle 窗口等待 updatefound，避免「刚好在这一刻发版」被漏掉。
 */
const findNextWaitingWorker = async (
  registration: ServiceWorkerRegistration,
  timeoutMs: number
): Promise<ServiceWorker | null> => {
  if (registration.waiting) return registration.waiting;
  if (registration.installing) {
    const installed = await waitForInstalled(registration.installing, timeoutMs);
    return installed ?? registration.waiting ?? null;
  }

  try {
    await registration.update();
  } catch {
    // 离线 / 更新检查失败：下面仍会等待一次 updatefound 窗口
  }

  if (registration.waiting) return registration.waiting;
  if (registration.installing) {
    const installed = await waitForInstalled(registration.installing, timeoutMs);
    return installed ?? registration.waiting ?? null;
  }

  return await new Promise<ServiceWorker | null>((resolve) => {
    let done = false;
    let timer = 0;
    const onFound = () => {
      const installing = registration.installing;
      if (!installing) return;
      void waitForInstalled(installing, timeoutMs).then((worker) => {
        finish(worker ?? registration.waiting ?? null);
      });
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      registration.removeEventListener('updatefound', onFound);
    };
    const finish = (value: ServiceWorker | null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };
    timer = window.setTimeout(() => finish(null), timeoutMs);
    registration.addEventListener('updatefound', onFound);
  });
};

export interface ServiceWorkerUpdateState {
  status: SwUpdateStatus;
  applyUpdate: () => void;
  dismissUpdate: () => void;
}

export interface UseServiceWorkerUpdateOptions {
  /** 测试可显式开启；默认跟随生产构建 */
  enabled?: boolean;
}

export const useServiceWorkerUpdate = (
  options: UseServiceWorkerUpdateOptions = {}
): ServiceWorkerUpdateState => {
  const enabled = options.enabled ?? import.meta.env.PROD;
  const [status, setStatus] = useState<SwUpdateStatus>('idle');
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const notifiedWorkerRef = useRef<ServiceWorker | null>(null);
  const waitingVersionRef = useRef<string | null>(null);
  const reloadRequestedRef = useRef(false);
  const applyingRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);

  const clearFallbackTimer = () => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  /** 普通提示：同一 worker 只提示一次，已「稍后」的版本不再打扰 */
  const announce = useCallback(async (worker: ServiceWorker | null, knownVersion?: string | null) => {
    if (!worker || notifiedWorkerRef.current === worker) return;
    notifiedWorkerRef.current = worker;

    const version = knownVersion !== undefined ? knownVersion : await getWorkerVersion(worker);
    // 用户对同一版本选择过「稍后」，不再重复打扰；新版本版本号变化后会再次提示
    if ((version ?? UNKNOWN_VERSION) === readDismissedVersion()) return;

    waitingWorkerRef.current = worker;
    waitingVersionRef.current = version;
    setStatus('available');
  }, []);

  /** 应用一个 waiting worker：等在途请求 → skipWaiting；超时兜底刷新 */
  const applyWorker = useCallback(async (worker: ServiceWorker, version: string | null) => {
    // 防止连续更新链与手动点击同时触发同一次接管
    if (applyingRef.current) return;
    applyingRef.current = true;

    waitingWorkerRef.current = worker;
    waitingVersionRef.current = version;
    reloadRequestedRef.current = true;
    setStatus('applying');

    if (getInflightRequestCount() > 0) {
      setStatus('waiting');
      await waitForInflightRequests();
    }

    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      applyingRef.current = false;
      setStatus('available');
      return;
    }

    // 兜底：极少数情况下 controllerchange 未触发时避免一直停留在更新中；
    // 仍会先等在途请求结束，不打断正在进行的后端操作
    clearFallbackTimer();
    fallbackTimerRef.current = window.setTimeout(() => {
      fallbackTimerRef.current = null;
      const reload = async () => {
        if (getInflightRequestCount() > 0) await waitForInflightRequests();
        window.location.reload();
      };
      void reload();
    }, 4000);
  }, []);

  /**
   * 处理一个 waiting worker：
   * - 有连续更新链 → 按状态机决定自动继续或停止；
   * - 无连续更新链 → 走原有的一次性提示。
   */
  const handleWaitingWorker = useCallback(async (worker: ServiceWorker) => {
    const storage = getSessionStorage();
    const loop = storage ? readPwaUpdateLoop(storage) : null;
    if (!loop) {
      await announce(worker);
      return;
    }

    const version = await getWorkerVersion(worker);
    const decision = decidePwaUpdateLoop(loop, version);
    if (decision.action === 'apply') {
      if (storage) writePwaUpdateLoop(storage, decision.state);
      void applyWorker(worker, version);
      return;
    }

    if (storage) clearPwaUpdateLoop(storage);
    // 版本不变说明自动链已无法推进：直接停住，避免反复弹同一个提示
    if (decision.reason === 'same-version') {
      setStatus('idle');
      return;
    }
    // 次数 / 时间窗口到顶：停止自动链，但把控制权交回用户
    await announce(worker, version);
  }, [announce, applyWorker]);

  useEffect(() => {
    // 开发环境不注册 SW：缓存会遮蔽 HMR 与最新代码
    if (!('serviceWorker' in navigator) || !enabled) return;

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

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              void handleWaitingWorker(registration.waiting || installing);
            }
          });
        });

        const storage = getSessionStorage();
        const loop = storage ? readPwaUpdateLoop(storage) : null;

        // 用户上一轮点击过更新：刷新后自动继续，直到没有待更新版本
        if (loop) {
          const next = await findNextWaitingWorker(registration, PWA_UPDATE_SETTLE_MS);
          if (cancelled) return;
          if (next) {
            void handleWaitingWorker(next);
            return;
          }
          if (storage) clearPwaUpdateLoop(storage);
          setStatus('idle');
          return;
        }

        // 页面加载时已有等待中的新版本（例如上次未确认就关闭了页面）
        if (registration.waiting && navigator.serviceWorker.controller) {
          void handleWaitingWorker(registration.waiting);
        }
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
  }, [enabled, handleWaitingWorker]);

  useEffect(() => () => clearFallbackTimer(), []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      // 仅在用户本轮确认过更新时刷新，避免其它标签页触发接管导致当前页面被强制刷新
      if (!reloadRequestedRef.current) return;
      clearFallbackTimer();
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

  const applyUpdate = useCallback(() => {
    const worker = waitingWorkerRef.current;
    if (!worker || applyingRef.current) return;

    // 记录本轮连续更新的起点；刷新后 handleWaitingWorker 会据此自动续跑
    const storage = getSessionStorage();
    if (storage) {
      writePwaUpdateLoop(storage, startPwaUpdateLoop(waitingVersionRef.current));
    }
    void applyWorker(worker, waitingVersionRef.current);
  }, [applyWorker]);

  const dismissUpdate = useCallback(() => {
    const storage = getSessionStorage();
    if (storage) clearPwaUpdateLoop(storage);
    writeDismissedVersion(waitingVersionRef.current ?? UNKNOWN_VERSION);
    setStatus('idle');
  }, []);

  return { status, applyUpdate, dismissUpdate };
};
