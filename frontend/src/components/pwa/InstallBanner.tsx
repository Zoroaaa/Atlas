import React from 'react';
import { Download, Share2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import type { InstallBannerMode } from '@/hooks/useInstallPrompt';

interface InstallBannerProps {
  mode: Exclude<InstallBannerMode, 'none'>;
  onInstall: () => void;
  onDismiss: () => void;
}

export const InstallBanner: React.FC<InstallBannerProps> = ({ mode, onInstall, onDismiss }) => {
  const { t } = useTranslation(['pwa']);
  const isIos = mode === 'ios';

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-40 flex justify-center pointer-events-none"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      <div
        className={clsx(
          'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-3 sm:p-4',
          'border-stone-200/70 bg-white/95 shadow-soft-lg backdrop-blur',
          'dark:border-stone-700/70 dark:bg-surface-800/95',
          'animate-slide-up'
        )}
        role="dialog"
        aria-live="polite"
        data-testid="pwa-install-banner"
        data-mode={mode}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#d4a853] to-[#f59e0b] text-white shadow-sm">
          {isIos ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            {t(isIos ? 'pwa:iosTitle' : 'pwa:installTitle')}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            {t(isIos ? 'pwa:iosDescription' : 'pwa:installDescription')}
          </p>

          <div className="mt-2.5">
            {isIos ? (
              <Button size="sm" variant="secondary" onClick={onDismiss}>
                {t('pwa:iosAction')}
              </Button>
            ) : (
              <Button size="sm" onClick={onInstall}>
                {t('pwa:installAction')}
              </Button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('pwa:installDismissLabel')}
          className="shrink-0 rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
