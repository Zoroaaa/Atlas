import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServiceWorkerUpdate } from '../useServiceWorkerUpdate';
import {
  PWA_UPDATE_LOOP_KEY,
  readPwaUpdateLoop,
  writePwaUpdateLoop,
} from '@/services/pwaUpdateLoop';

type Listener = (...args: unknown[]) => void;

const createWorker = (version: string) => {
  const listeners = new Map<string, Set<Listener>>();
  const worker = {
    state: 'installed',
    postMessage: vi.fn((message: { type?: string }, ports?: MessagePort[]) => {
      // 模拟 sw.js 对 GET_VERSION 的回复
      if (message?.type === 'GET_VERSION' && ports?.[0]) {
        ports[0].postMessage({ version });
      }
    }),
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatch: (type: string) => {
      listeners.get(type)?.forEach((listener) => listener());
    },
  };
  return worker as unknown as ServiceWorker & { postMessage: ReturnType<typeof vi.fn> };
};

const createRegistration = (waiting: ServiceWorker | null) => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    waiting,
    installing: null,
    update: vi.fn(async () => undefined),
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
  } as unknown as ServiceWorkerRegistration & { update: ReturnType<typeof vi.fn> };
};

let controllerChangeHandler: Listener | null = null;
let reloadSpy: ReturnType<typeof vi.fn>;
const originalLocation = window.location;

function installServiceWorker(registration: ServiceWorkerRegistration) {
  const container = {
    controller: {},
    register: vi.fn(async () => registration),
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (type === 'controllerchange') controllerChangeHandler = listener;
    }),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  });
  return container;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  controllerChangeHandler = null;
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => 'complete',
  });
  // jsdom 的 location.reload 不可 spy，整体替换 location 便于断言刷新
  reloadSpy = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload: reloadSpy },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
  sessionStorage.clear();
  localStorage.clear();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('useServiceWorkerUpdate 连续更新', () => {
  it('点击立即更新：写入连续更新状态并激活 waiting worker', async () => {
    const worker = createWorker('v1');
    installServiceWorker(createRegistration(worker));

    const { result } = renderHook(() => useServiceWorkerUpdate({ enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('available'), { timeout: 5000 });

    act(() => result.current.applyUpdate());

    await waitFor(() => {
      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });
    expect(readPwaUpdateLoop(sessionStorage)?.rounds).toBe(1);

    act(() => controllerChangeHandler?.());
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('刷新后仍有 waiting：无需再次点击，自动继续并在结束后清理状态', async () => {
    writePwaUpdateLoop(sessionStorage, {
      rounds: 1,
      startedAt: Date.now(),
      version: 'v1',
    });
    const worker = createWorker('v2');
    installServiceWorker(createRegistration(worker));

    renderHook(() => useServiceWorkerUpdate({ enabled: true }));

    await waitFor(
      () => expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }),
      { timeout: 5000 }
    );
    expect(readPwaUpdateLoop(sessionStorage)?.rounds).toBe(2);
  });

  it('刷新后已没有 waiting：自动链结束并清空状态', async () => {
    writePwaUpdateLoop(sessionStorage, {
      rounds: 1,
      startedAt: Date.now(),
      version: 'v1',
    });
    const worker = createWorker('v2');
    installServiceWorker(createRegistration(null));

    renderHook(() => useServiceWorkerUpdate({ enabled: true }));

    await waitFor(
      () => expect(sessionStorage.getItem(PWA_UPDATE_LOOP_KEY)).toBeNull(),
      { timeout: 5000 }
    );
    expect(worker.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('达到次数上限：停止自动继续，交回普通提示并清理状态', async () => {
    writePwaUpdateLoop(sessionStorage, {
      rounds: 5,
      startedAt: Date.now(),
      version: 'v5',
    });
    const worker = createWorker('v6');
    installServiceWorker(createRegistration(worker));

    const { result } = renderHook(() => useServiceWorkerUpdate({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('available'), { timeout: 5000 });
    expect(worker.postMessage).not.toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(sessionStorage.getItem(PWA_UPDATE_LOOP_KEY)).toBeNull();
  });
});
