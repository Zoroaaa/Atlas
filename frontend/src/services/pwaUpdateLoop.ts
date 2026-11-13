/**
 * PWA 多版本连续更新的状态机（纯函数）。
 *
 * 一次点击后，页面会因 SW 接管而刷新；刷新后若仍有 waiting worker，
 * 需要自动继续，而不是再次弹提示。状态存放在 sessionStorage：
 * - rounds：本轮已经应用了几次更新；
 * - startedAt：本轮开始时间；
 * - version：最近一次应用的 SW 版本，用于检测「版本不再变化」。
 *
 * 任何一步命中上限/超时/版本未变化都必须停止自动链，交回用户手动确认。
 */

export const PWA_UPDATE_LOOP_KEY = 'pwa:update-loop';
/** 一轮连续更新最多应用的版本数 */
export const PWA_UPDATE_MAX_ROUNDS = 5;
/** 一轮连续更新的时间窗口（毫秒） */
export const PWA_UPDATE_WINDOW_MS = 2 * 60 * 1000;
/** 刷新后等待浏览器发现下一个等待版本的时长（毫秒） */
export const PWA_UPDATE_SETTLE_MS = 2000;

export interface PwaUpdateLoopState {
  rounds: number;
  startedAt: number;
  version: string | null;
}

export type PwaUpdateLoopDecision =
  | { action: 'apply'; state: PwaUpdateLoopState }
  | { action: 'stop'; reason: 'rounds' | 'window' | 'same-version' };

export const parsePwaUpdateLoop = (raw: string | null): PwaUpdateLoopState | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PwaUpdateLoopState> | null;
    if (!parsed || typeof parsed.rounds !== 'number' || typeof parsed.startedAt !== 'number') {
      return null;
    }
    if (!Number.isFinite(parsed.rounds) || !Number.isFinite(parsed.startedAt)) return null;
    return {
      rounds: Math.max(0, Math.floor(parsed.rounds)),
      startedAt: parsed.startedAt,
      version: typeof parsed.version === 'string' ? parsed.version : null,
    };
  } catch {
    return null;
  }
};

/** 用户第一次点击「立即更新」时创建本轮状态 */
export const startPwaUpdateLoop = (
  version: string | null,
  now = Date.now()
): PwaUpdateLoopState => ({ rounds: 1, startedAt: now, version });

/**
 * 刷新后决定是否自动继续下一轮更新。
 *
 * - 超过时间窗口 → 停止（window）
 * - 已达到次数上限 → 停止（rounds）
 * - 等待版本与刚应用的版本相同 → 停止（same-version，防止原地循环刷新）
 * - 其余情况 → 应用并让 rounds + 1
 */
export const decidePwaUpdateLoop = (
  state: PwaUpdateLoopState,
  waitingVersion: string | null,
  now = Date.now()
): PwaUpdateLoopDecision => {
  if (now - state.startedAt > PWA_UPDATE_WINDOW_MS) {
    return { action: 'stop', reason: 'window' };
  }
  if (state.rounds >= PWA_UPDATE_MAX_ROUNDS) {
    return { action: 'stop', reason: 'rounds' };
  }
  if (state.version && waitingVersion && state.version === waitingVersion) {
    return { action: 'stop', reason: 'same-version' };
  }
  return {
    action: 'apply',
    state: {
      rounds: state.rounds + 1,
      startedAt: state.startedAt,
      version: waitingVersion ?? state.version,
    },
  };
};

export const readPwaUpdateLoop = (storage: Storage): PwaUpdateLoopState | null => {
  try {
    return parsePwaUpdateLoop(storage.getItem(PWA_UPDATE_LOOP_KEY));
  } catch {
    return null;
  }
};

export const writePwaUpdateLoop = (storage: Storage, state: PwaUpdateLoopState): void => {
  try {
    storage.setItem(PWA_UPDATE_LOOP_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式下 sessionStorage 不可写，仅失去跨刷新的自动续更
  }
};

export const clearPwaUpdateLoop = (storage: Storage): void => {
  try {
    storage.removeItem(PWA_UPDATE_LOOP_KEY);
  } catch {
    // 忽略不可写场景
  }
};
