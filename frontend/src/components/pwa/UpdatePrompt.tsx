import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import type { SwUpdateStatus } from '@/hooks/useServiceWorkerUpdate';

interface UpdatePromptProps {
  status: Exclude<SwUpdateStatus, 'idle'>;
  onConfirm: () => void;
  onDismiss: () => void;
}

const COPY_KEYS: Record<
  Exclude<SwUpdateStatus, 'idle'>,
  { title: string; description: string }
> = {
  available: { title: 'sw:updateTitle', description: 'sw:updateDescription' },
  waiting: { title: 'sw:updateWaitingTitle', description: 'sw:updateWaitingDescription' },
  applying: { title: 'sw:updateApplyingTitle', description: 'sw:updateApplyingDescription' },
};

export const UpdatePrompt: React.FC<UpdatePromptProps> = ({ status, onConfirm, onDismiss }) => {
  const { t } = useTranslation(['sw']);
  const busy = status !== 'available';
  const copy = COPY_KEYS[status];

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
        role="status"
        aria-live="polite"
        data-testid="pwa-update-prompt"
        data-status={status}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <RefreshCw className={clsx('h-5 w-5', busy && 'animate-spin')} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            {t(copy.title)}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            {t(copy.description)}
          </p>

          {status === 'available' && (
            <div className="mt-2.5 flex items-center gap-2">
              <Button size="sm" onClick={onConfirm}>
                {t('sw:updateNow')}
              </Button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
              >
                {t('sw:updateLater')}
              </button>
            </div>
          )}
        </div>

        {status === 'available' && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('sw:updateDismissLabel')}
            className="shrink-0 rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
