import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

/** 全局网络状态：离线时提示正在使用缓存，恢复后短暂提示。 */
export const NetworkStatusBar: React.FC = () => {
  const { t } = useTranslation(['network']);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let timer: number | undefined;

    const handleOnline = () => {
      setOnline(true);
      setRestored(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setRestored(false), 2500);
    };
    const handleOffline = () => {
      setOnline(false);
      setRestored(false);
      window.clearTimeout(timer);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online && !restored) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4"
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      role="status"
      aria-live="polite"
    >
      <div
        className={clsx(
          'rounded-full px-3 py-1 text-[11px] font-medium shadow-soft backdrop-blur',
          online
            ? 'bg-emerald-500/95 text-white'
            : 'bg-stone-800/95 text-stone-100 dark:bg-stone-700/95'
        )}
      >
        {online ? t('network:restored') : t('network:offline')}
      </div>
    </div>
  );
};
