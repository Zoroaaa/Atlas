import { describe, expect, it } from 'vitest';
import {
  clearPwaUpdateLoop,
  decidePwaUpdateLoop,
  PWA_UPDATE_LOOP_KEY,
  PWA_UPDATE_MAX_ROUNDS,
  PWA_UPDATE_WINDOW_MS,
  parsePwaUpdateLoop,
  readPwaUpdateLoop,
  startPwaUpdateLoop,
  writePwaUpdateLoop,
} from '../pwaUpdateLoop';

const createStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
};

describe('PWA 连续更新状态机', () => {
  it('一次点击后的多轮更新：rounds 逐次递增，直到没有待更新版本', () => {
    const startedAt = 1_000_000;
    let state = startPwaUpdateLoop('v1', startedAt);
    expect(state).toEqual({ rounds: 1, startedAt, version: 'v1' });

    const second = decidePwaUpdateLoop(state, 'v2', startedAt + 1_000);
    expect(second.action).toBe('apply');
    if (second.action !== 'apply') return;
    state = second.state;
    expect(state).toEqual({ rounds: 2, startedAt, version: 'v2' });

    const third = decidePwaUpdateLoop(state, 'v3', startedAt + 2_000);
    expect(third.action).toBe('apply');
    if (third.action !== 'apply') return;
    expect(third.state).toEqual({ rounds: 3, startedAt, version: 'v3' });
  });

  it('版本号不再变化时停止，避免原地循环刷新', () => {
    const state = { rounds: 2, startedAt: 1_000, version: 'v2' };
    expect(decidePwaUpdateLoop(state, 'v2', 2_000)).toEqual({
      action: 'stop',
      reason: 'same-version',
    });
  });

  it('达到单轮次数上限后停止', () => {
    const state = {
      rounds: PWA_UPDATE_MAX_ROUNDS,
      startedAt: 1_000,
      version: 'v5',
    };
    expect(decidePwaUpdateLoop(state, 'v6', 2_000)).toEqual({
      action: 'stop',
      reason: 'rounds',
    });
  });

  it('超过时间窗口后停止', () => {
    const state = { rounds: 1, startedAt: 1_000, version: 'v1' };
    expect(
      decidePwaUpdateLoop(state, 'v2', 1_000 + PWA_UPDATE_WINDOW_MS + 1)
    ).toEqual({ action: 'stop', reason: 'window' });
  });
});

describe('PWA 连续更新状态持久化', () => {
  it('读写与清理 sessionStorage', () => {
    const storage = createStorage();
    writePwaUpdateLoop(storage, { rounds: 3, startedAt: 123, version: 'v3' });
    expect(storage.getItem(PWA_UPDATE_LOOP_KEY)).toBeTruthy();
    expect(readPwaUpdateLoop(storage)).toEqual({ rounds: 3, startedAt: 123, version: 'v3' });

    clearPwaUpdateLoop(storage);
    expect(readPwaUpdateLoop(storage)).toBeNull();
  });

  it('损坏或结构不完整的 JSON 视为没有更新链', () => {
    expect(parsePwaUpdateLoop(null)).toBeNull();
    expect(parsePwaUpdateLoop('not-json')).toBeNull();
    expect(parsePwaUpdateLoop('{"rounds":"x"}')).toBeNull();
    expect(parsePwaUpdateLoop('{"rounds":1}')).toBeNull();
  });
});
