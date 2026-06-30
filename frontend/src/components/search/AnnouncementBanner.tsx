import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Megaphone, ChevronDown, Info, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { announcementApi, type Announcement } from '@/services/api/announcement';
import { JAV_PANEL_HEIGHT } from '@/components/jav/JavRankingsPanel';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  error: AlertCircle,
};

const TYPE_STYLE: Record<string, { dot: string; badge: string }> = {
  info:    { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  warning: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  success: { dot: 'bg-green-500', badge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  error:   { dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const HEADER = 64;

export const AnnouncementPanel: React.FC = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [show, setShow] = useState(true);

  useEffect(() => {
    announcementApi.getActive().then(setItems).catch(() => {});
  }, []);

  const hasData = items.length > 0;

  return (
    <div
      className="collapsible-section animate-fade-in transition-all duration-300 overflow-hidden shrink-0"
      style={{ height: show ? JAV_PANEL_HEIGHT : HEADER, maxHeight: show ? '60vh' : undefined }}
    >
      <button
        onClick={() => setShow(!show)}
        className="collapsible-header"
        style={{ height: HEADER }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Megaphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">网站公告</span>
          {hasData && (
            <span className="text-[11px] text-surface-400 bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded-full">{items.length}</span>
          )}
        </div>
        <ChevronDown className={clsx('w-4 h-4 text-surface-400 transition-transform duration-200', show && 'rotate-180')} />
      </button>

      {show && hasData && (
        <div className="p-3 space-y-2 overflow-y-auto" style={{ height: JAV_PANEL_HEIGHT - HEADER }}>
          {items.map((item) => {
            const style = TYPE_STYLE[item.type] || TYPE_STYLE.info;
            const Icon = ICON_MAP[item.type] || Info;
            return (
              <div
                key={item.id}
                className={clsx(
                  'rounded-xl p-3 border transition-colors',
                  style.badge,
                  item.is_pinned === 1 && 'ring-1 ring-inset ring-amber-200 dark:ring-amber-800'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-70" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', style.dot)} />
                      <h4 className="font-medium text-sm truncate">{item.title}</h4>
                      {item.is_pinned === 1 && (
                        <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">置顶</span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400 line-clamp-2">{item.content}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
