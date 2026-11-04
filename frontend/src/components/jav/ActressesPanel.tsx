import React, { useState } from 'react';
import {
  RefreshCw, Loader2, ChevronDown, ChevronRight, Flame,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActresses } from '@/hooks';

interface ActressesPanelProps {
  onActressClick: (name: string) => void;
}

const PANEL_HEIGHT = 300;
const HEADER_HEIGHT = 64;
const CONTENT_HEIGHT = PANEL_HEIGHT - HEADER_HEIGHT - 24 - 34;

const CARD_COLORS = [
  'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800',
];

export const ActressesPanel: React.FC<ActressesPanelProps> = ({ onActressClick }) => {
  const { t } = useTranslation(['jav']);
  const { data, isLoading, error, refresh } = useActresses();
  const [expanded, setExpanded] = useState(true);

  const items = data?.items ?? [];
  if (!isLoading && (error || items.length === 0)) return null;

  return (
    <div
      className="collapsible-section animate-fade-in transition-all duration-300 overflow-hidden shrink-0"
      style={{ height: expanded ? PANEL_HEIGHT : HEADER_HEIGHT }}
    >
      <button onClick={() => setExpanded(!expanded)} className="collapsible-header" style={{ height: HEADER_HEIGHT }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 dark:text-rose-400" />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">
            {t('jav:actresses.title')}
          </span>
          {items.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full">
              {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); refresh(); }}
            disabled={isLoading}
            className="p-1 sm:p-1.5 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all disabled:opacity-40"
            title={t('jav:actresses.refresh')}
          >
            <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-surface-400" />
            : <ChevronRight className="w-4 h-4 text-surface-400" />}
        </div>
      </button>

      <div className="flex flex-col" style={{ height: PANEL_HEIGHT - HEADER_HEIGHT }}>
        <div className="p-3 sm:p-4 flex-1 min-h-0 overflow-hidden" style={{ height: CONTENT_HEIGHT }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-surface-400">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              <p className="text-xs">{t('jav:actresses.loadingActresses')}</p>
            </div>
          ) : (
            <div className="h-full overflow-y-auto scrollbar-thin">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
                {items.map((actress, index) => (
                  <button
                    key={actress.name}
                    onClick={() => onActressClick(actress.name)}
                    className={`w-full rounded-lg border px-2.5 py-2 text-left transition-all active:scale-[0.97] hover:shadow-sm ${CARD_COLORS[index % CARD_COLORS.length]}`}
                    title={t('jav:actresses.viewWorksTitle', { name: actress.name })}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold opacity-50 shrink-0 w-4 text-right">{index + 1}</span>
                      <span className="truncate text-xs font-semibold">{actress.name}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2 pl-5 text-[10px] opacity-80">
                      <span>{t('jav:actresses.users', { count: actress.users })}</span>
                      <span>{t('jav:actresses.works', { count: actress.works })}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-3 sm:px-4 py-2.5 border-t border-surface-50 dark:border-surface-800/60 shrink-0">
          <p className="text-[10px] text-surface-400 dark:text-surface-500">
            {t('jav:actresses.footerHint')}
          </p>
        </div>
      </div>
    </div>
  );
};
