import React, { useEffect, useState, useRef } from 'react';
import { clsx } from 'clsx';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores';
import type { ToastType, ToastPosition, Toast } from '@/types';

const ToastIcon: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-success-500" />,
  error: <AlertCircle className="w-5 h-5 text-error-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-warning-500" />,
  info: <Info className="w-5 h-5 text-primary-500" />,
};

const ProgressBarStyles: Record<ToastType, string> = {
  success: 'bg-success-500',
  error: 'bg-error-500',
  warning: 'bg-warning-500',
  info: 'bg-primary-500',
};

const PositionStyles: Record<ToastPosition, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const { t } = useTranslation(['ui']);
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (toast.duration <= 0 || !toast.showProgress || isPaused) return;

    const startTime = Date.now();
    const remainingTime = toast.duration;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.max(0, 100 - (elapsed / remainingTime) * 100);
      setProgress(newProgress);
    }, 50);

    return () => clearInterval(interval);
  }, [toast.duration, toast.showProgress, isPaused]);

  const handleClick = () => {
    if (toast.onClick) {
      toast.onClick();
    }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(toast.id);
  };

  return (
    <div
      className={clsx(
        'relative flex items-start gap-3 px-4 py-3 rounded-lg border shadow-soft',
        'min-w-[280px] max-w-[400px] w-full sm:w-auto',
        'transition-all duration-300 ease-out',
        toast.isExiting 
          ? 'opacity-0 translate-x-4 scale-95' 
          : 'opacity-100 translate-x-0 scale-100',
        'hover:shadow-soft-lg',
        toast.onClick && 'cursor-pointer'
      )}
      style={{
        animation: toast.isExiting 
          ? 'slideOutRight 0.3s ease-out forwards' 
          : 'slideInRight 0.3s ease-out forwards',
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={clsx(
        'flex-shrink-0 mt-0.5',
        'animate-scale-in'
      )}>
        {ToastIcon[toast.type]}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-surface-900 dark:text-surface-100 text-sm">
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-sm text-surface-600 dark:text-surface-400 mt-0.5 leading-relaxed">
            {toast.message}
          </p>
        )}
      </div>
      
      {toast.showCloseButton && (
        <button
          onClick={handleClose}
          className={clsx(
            'flex-shrink-0 p-1 rounded-md',
            'text-surface-400 hover:text-surface-600',
            'hover:bg-surface-100 dark:hover:bg-surface-700 dark:hover:text-surface-300',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
          )}
          aria-label={t('ui:toast.closeLabel')}
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {toast.showProgress && toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-200 dark:bg-surface-700 rounded-b-lg overflow-hidden">
          <div
            className={clsx(
              'h-full transition-all duration-100 ease-linear',
              ProgressBarStyles[toast.type]
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const { t } = useTranslation(['ui']);
  const { toasts, removeToast, toastPosition } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className={clsx(
        'fixed z-50 flex flex-col gap-2',
        'pointer-events-none',
        PositionStyles[toastPosition]
      )}
      role="region"
      aria-label={t('ui:toast.regionLabel')}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={removeToast} />
        </div>
      ))}
    </div>
  );
};

export const useToast = () => {
  const { addToast, removeToast, clearToasts } = useUIStore();
  const toastRef = useRef<{ success: (title: string, message?: string) => void; error: (title: string, message?: string) => void; warning: (title: string, message?: string) => void; info: (title: string, message?: string) => void; show: (options: Parameters<typeof addToast>[0]) => void; remove: (id: string) => void; clear: () => void } | null>(null);

  if (!toastRef.current) {
    toastRef.current = {
      success: (title: string, message?: string) =>
        addToast({ type: 'success', title, message }),
      error: (title: string, message?: string) =>
        addToast({ type: 'error', title, message }),
      warning: (title: string, message?: string) =>
        addToast({ type: 'warning', title, message }),
      info: (title: string, message?: string) =>
        addToast({ type: 'info', title, message }),
      show: (options: Parameters<typeof addToast>[0]) => addToast(options),
      remove: (id: string) => removeToast(id),
      clear: () => clearToasts(),
    };
  }

  return toastRef.current;
};

export type { ToastType, ToastPosition };
