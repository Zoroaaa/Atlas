import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Megaphone, ChevronDown, X, Info, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { announcementApi, type Announcement } from '@/services/api/announcement';

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

const CLOSED_KEY_PREFIX = 'announcement_closed_';

export const AnnouncementBar: React.FC = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    announcementApi.getActive().then(setItems).catch(() => {});
  }, []);

  // 置顶优先,否则取第一条
  const latest = useMemo(() => {
    if (items.length === 0) return null;
    return items.find((it) => it.is_pinned === 1) ?? items[0];
  }, [items]);

  // 本会话关闭记忆:以最新公告 id 为 key
  const closedKey = latest ? `${CLOSED_KEY_PREFIX}${latest.id}` : '';

  useEffect(() => {
    if (!closedKey) return;
    if (sessionStorage.getItem(closedKey) === '1') setClosed(true);
  }, [closedKey]);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (closedKey) sessionStorage.setItem(closedKey, '1');
    setClosed(true);
    setExpanded(false);
  };

  if (!latest || closed) return null;

  const hasMultiple = items.length > 1;

  return (
    <div className="mb-4 sm:mb-6 animate-fade-in">
      <div
        className={clsx(
          'glass rounded-2xl border border-surface-200/60 dark:border-surface-700/60',
          'border-l-4 border-l-primary-500',
          'shadow-lg shadow-surface-900/5 overflow-hidden',
          'transition-all duration-300'
        )}
      >
        {/* 横幅主体 */}
        <button
          onClick={() => hasMultiple && setExpanded((v) => !v)}
          className={clsx(
            'w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left',
            hasMultiple && 'cursor-pointer hover:bg-surface-50/50 dark:hover:bg-surface-800/30'
          )}
        >
          {/* 图标徽章 */}
          <div className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center shadow-md shadow-amber-500/20 animate-pulse-subtle">
            <Megaphone className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
          </div>

          {/* 内容:标题 + 摘要 单行 */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="shrink-0 font-semibold text-sm sm:text-base text-surface-900 dark:text-surface-100">
              {latest.title}
            </span>
            {latest.is_pinned === 1 && (
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                置顶
              </span>
            )}
            <span className="hidden sm:block min-w-0 flex-1 text-xs text-surface-500 dark:text-surface-400 truncate">
              {latest.content}
            </span>
          </div>

          {/* 右侧操作 */}
          <div className="shrink-0 flex items-center gap-1">
            {hasMultiple && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-surface-400 bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded-full">
                {items.length}
              </span>
            )}
            {hasMultiple && (
              <ChevronDown
                className={clsx('w-4 h-4 text-surface-400 transition-transform duration-200', expanded && 'rotate-180')}
              />
            )}
            <span
              onClick={handleClose}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClose(e as unknown as React.MouseEvent); } }}
              className="p-1 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              title="关闭(本会话不再显示)"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          </div>
        </button>

        {/* 展开列表 */}
        {expanded && hasMultiple && (
          <div className="px-3 sm:px-4 pb-3 pt-1 space-y-2 max-h-[60vh] overflow-y-auto border-t border-surface-200/40 dark:border-surface-700/40">
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
                          <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                            置顶
                          </span>
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
    </div>
  );
};
