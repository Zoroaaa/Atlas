import React, { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppUpdateStore, selectShouldPrompt } from '@/stores';
import { hapticTap, isAndroidApp } from '@/utils/nativeShell';

/** 全局只调度一次自动检查（StrictMode 下 effect 会执行两次） */
let autoCheckStarted = false;
const AUTO_CHECK_DELAY = 2500;

/**
 * APK 新版本提示：启动后静默检查 GitHub Release，
 * 有新版本时在底部弹一次可关闭的提示，同一版本关闭后不再打扰。
 */
export const AppUpdatePrompt: React.FC = () => {
  const { t } = useTranslation(['update']);
  const shouldPrompt = useAppUpdateStore(selectShouldPrompt);
  const currentVersion = useAppUpdateStore((state) => state.currentVersion);
  const latestVersion = useAppUpdateStore((state) => state.latestVersion);
  const releaseUrl = useAppUpdateStore((state) => state.releaseUrl);
  const check = useAppUpdateStore((state) => state.check);
  const dismiss = useAppUpdateStore((state) => state.dismiss);

  useEffect(() => {
    // 不清理定时器：StrictMode 的 setup→cleanup→setup 不应吞掉唯一一次自动检查
    if (autoCheckStarted || !isAndroidApp()) return;
    autoCheckStarted = true;
    window.setTimeout(() => {
      void check({ silent: true });
    }, AUTO_CHECK_DELAY);
  }, [check]);

  if (!shouldPrompt || !latestVersion || !releaseUrl) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center pointer-events-none md:bottom-6"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      <div
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-amber-200/80 bg-white/95 p-3 shadow-soft-lg backdrop-blur animate-slide-up sm:p-4 dark:border-amber-500/25 dark:bg-surface-800/95"
        role="status"
        aria-live="polite"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Download className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            {t('update:availableTitle', { version: latestVersion })}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            {t('update:availableDescription', { current: currentVersion ?? '—' })}
          </p>

          <div className="mt-2.5 flex items-center gap-2">
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void hapticTap('light')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#d4a853] to-[#f59e0b] px-3 text-xs font-semibold text-stone-900 shadow-sm transition-all active:scale-[0.97]"
            >
              <Download className="h-3.5 w-3.5" />
              {t('update:updateNow')}
            </a>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
            >
              {t('update:later')}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t('update:dismiss')}
          className="shrink-0 rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
