import { create } from 'zustand';
import { compareVersions, fetchLatestAndroidRelease, getInstalledAppVersion } from '@/services/appUpdate';
import { isAndroidApp } from '@/utils/nativeShell';

export type AppUpdateStatus = 'idle' | 'checking' | 'available' | 'latest' | 'error' | 'unsupported';

interface CheckOptions {
  silent?: boolean;
  force?: boolean;
}

interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
  dismissedVersion: string | null;
  lastCheckedAt: number | null;
  check: (options?: CheckOptions) => Promise<void>;
  dismiss: () => void;
}

const DISMISS_KEY = 'atlas:app-update-dismissed';

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  status: 'idle',
  currentVersion: null,
  latestVersion: null,
  releaseUrl: null,
  dismissedVersion: readDismissedVersion(),
  lastCheckedAt: null,

  check: async ({ silent = false, force = false }: CheckOptions = {}) => {
    if (!isAndroidApp()) {
      if (!silent) set({ status: 'unsupported' });
      return;
    }

    const currentStatus = get().status;
    if (currentStatus === 'checking') return;
    // 自动检查不重复请求已经完成的会话；手动检查（force）始终放行
    if (!force && (currentStatus === 'available' || currentStatus === 'latest')) return;

    set({ status: 'checking' });
    try {
      const [currentVersion, release] = await Promise.all([
        getInstalledAppVersion(),
        fetchLatestAndroidRelease(force),
      ]);

      if (!currentVersion) {
        set({ status: 'error' });
        return;
      }

      const hasUpdate = Boolean(release && compareVersions(release.version, currentVersion) > 0);
      set({
        status: hasUpdate ? 'available' : 'latest',
        currentVersion,
        latestVersion: release?.version ?? null,
        releaseUrl: release?.releaseUrl ?? null,
        lastCheckedAt: Date.now(),
      });
    } catch {
      set({ status: 'error' });
    }
  },

  dismiss: () => {
    const latestVersion = get().latestVersion;
    if (latestVersion) {
      try {
        localStorage.setItem(DISMISS_KEY, latestVersion);
      } catch {
        // 忽略存储失败
      }
    }
    set({ dismissedVersion: latestVersion });
  },
}));

export function selectShouldPrompt(state: AppUpdateState): boolean {
  return (
    state.status === 'available' &&
    Boolean(state.latestVersion) &&
    state.latestVersion !== state.dismissedVersion
  );
}
