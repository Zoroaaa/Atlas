import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Megaphone, ChevronDown, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { announcementApi, type Announcement } from '@/services/api/announcement';
import { PanelSection } from '@/components/workbench';
import { Chip } from '@/components/workbench';

const DOT_STYLE: Record<string, string> = {
  info: 'bg-primary-500',
  warning: 'bg-warning-500',
  success: 'bg-success-500',
  error: 'bg-error-500',
};

const CLOSED_KEY_PREFIX = 'announcement_closed_';

/** 公告条：Workbench 的第一个区段，单行常驻，可展开；不再使用独立卡片。 */
export const AnnouncementBar: React.FC = () => {
  const { t } = useTranslation(['search']);
  const [items, setItems] = useState<Announcement[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    announcementApi.getActive().then(setItems).catch(() => {});
  }, []);

  const latest = useMemo(() => {
    if (items.length === 0) return null;
    return items.find((it) => it.is_pinned === 1) ?? items[0];
  }, [items]);

  const closedKey = latest ? `${CLOSED_KEY_PREFIX}${latest.id}` : '';

  useEffect(() => {
    if (!closedKey) return;
    if (sessionStorage.getItem(closedKey) === '1') setClosed(true);
  }, [closedKey]);

  const handleClose = () => {
    if (closedKey) sessionStorage.setItem(closedKey, '1');
    setClosed(true);
    setExpanded(false);
  };

  if (!latest || closed) return null;

  const hasMultiple = items.length > 1;

  return (
    <PanelSection className="bg-primary-50/30 dark:bg-primary-950/10">
      <div className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
          <Megaphone className="h-4 w-4" />
        </div>

        <button
          type="button"
          onClick={() => hasMultiple && setExpanded((value) => !value)}
          className={clsx('flex min-w-0 flex-1 items-center gap-2 text-left', hasMultiple && 'cursor-pointer')}
          aria-expanded={hasMultiple ? expanded : undefined}
        >
          <span className="shrink-0 text-[13px] font-semibold text-surface-900 dark:text-surface-100">
            {latest.title}
          </span>
          {latest.is_pinned === 1 ? <Chip tone="primary" size="xs">{t('search:announcement.pinned')}</Chip> : null}
          <span className="type-meta hidden min-w-0 flex-1 truncate sm:block">{latest.content}</span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {hasMultiple ? (
            <span className="type-micro hidden items-center rounded-md bg-surface-100 px-1.5 py-0.5 tabular-nums text-surface-500 dark:bg-surface-800 sm:inline-flex">
              {items.length}
            </span>
          ) : null}
          {hasMultiple ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-200"
              aria-label={expanded ? t('search:announcement.close') : t('search:announcement.pinned')}
            >
              <ChevronDown className={clsx('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-200"
            aria-label={t('search:announcement.close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && hasMultiple ? (
        <div className="divide-y divide-surface-100 border-t border-surface-100 dark:divide-surface-800/70 dark:border-surface-800/70">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-2.5 px-4 py-3 sm:px-5">
              <span className={clsx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', DOT_STYLE[item.type] ?? DOT_STYLE.info)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium text-surface-800 dark:text-surface-200">{item.title}</span>
                  {item.is_pinned === 1 ? <Chip tone="primary" size="xs">{t('search:announcement.pinned')}</Chip> : null}
                </div>
                <p className="type-micro mt-1 line-clamp-2 text-surface-500">{item.content}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </PanelSection>
  );
};
