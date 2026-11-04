import React, { useState } from 'react';
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useJavRankings } from '@/hooks';
import { getProxyImageUrl } from '@/utils/imageProxy';
import type { JavRankingEntry, JavRankingPeriod, JavRankingSection } from '@/types';

interface JavRankingsPanelProps {
  onCodeClick: (code: string) => void;
}

const PANEL_HEIGHT = 500;
const HEADER_HEIGHT = 64;
const CONTENT_HEIGHT = PANEL_HEIGHT - HEADER_HEIGHT - 40 - 44 - 34;

const RANK_COLORS = [
  'text-amber-500',
  'text-slate-400',
  'text-amber-700',
];

const RankingRow: React.FC<{
  item: JavRankingEntry;
  onClick: (code: string) => void;
}> = ({ item, onClick }) => {
  const [broken, setBroken] = useState(false);
  const hasCover = Boolean(item.cover) && !broken;

  return (
    <button
      onClick={() => onClick(item.code)}
      className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-all hover:bg-surface-100 dark:hover:bg-surface-800/70"
      title={item.title}
    >
      <span className={`w-5 shrink-0 text-center text-xs font-bold ${RANK_COLORS[item.rank - 1] ?? 'text-surface-400'}`}>
        {item.rank}
      </span>
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-100 dark:bg-surface-800">
        {hasCover ? (
          <img
            src={getProxyImageUrl(item.cover!)}
            alt={item.code}
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-surface-400">
            {item.code.slice(0, 6)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-surface-800 dark:text-surface-200">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-[10px] font-semibold text-surface-400 dark:text-surface-500">
          {item.code}
        </p>
      </div>
    </button>
  );
};

export const JavRankingsPanel: React.FC<JavRankingsPanelProps> = ({ onCodeClick }) => {
  const { t } = useTranslation(['jav']);
  const { data, isLoading, error, refresh } = useJavRankings();
  const [expanded, setExpanded] = useState(true);
  const [period, setPeriod] = useState<JavRankingPeriod>('monthly');
  const [section, setSection] = useState<JavRankingSection>('censored');

  const activeItems = data?.[period]?.[section] ?? [];
  const updatedAt = data?.[period]?.updatedAt ?? 0;

  const formatUpdatedAt = (value: number): string => {
    if (!value) return '—';
    const date = new Date(value);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  };

  return (
    <div
      className="collapsible-section animate-fade-in transition-all duration-300 overflow-hidden shrink-0"
      style={{ height: expanded ? PANEL_HEIGHT : HEADER_HEIGHT }}
    >
      <button onClick={() => setExpanded(!expanded)} className="collapsible-header" style={{ height: HEADER_HEIGHT }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">
            {t('jav:rankings.title')}
          </span>
          {data && activeItems.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full">
              {activeItems.length}
            </span>
          )}
          <span className="hidden sm:inline text-[10px] text-surface-400 dark:text-surface-500">
            {t('jav:rankings.sourceLabel')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); refresh(); }}
            disabled={isLoading}
            className="p-1 sm:p-1.5 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all disabled:opacity-40"
            title={t('jav:rankings.refresh')}
          >
            <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-surface-400" />
            : <ChevronRight className="w-4 h-4 text-surface-400" />}
        </div>
      </button>

      <div className="flex flex-col" style={{ height: PANEL_HEIGHT - HEADER_HEIGHT }}>
        {/* 周期切换 */}
        <div className="px-3 sm:px-4 pt-3 pb-2 shrink-0">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-100 dark:bg-surface-800 p-1">
            {(['monthly', 'weekly'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`rounded-md py-1 text-xs font-medium transition-all ${
                  period === value
                    ? 'bg-white text-primary-600 shadow-sm dark:bg-surface-900 dark:text-primary-300'
                    : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
                }`}
              >
                {value === 'monthly' ? t('jav:rankings.periodMonthly') : t('jav:rankings.periodWeekly')}
              </button>
            ))}
          </div>
        </div>

        {/* 类型切换 */}
        <div className="px-3 sm:px-4 pb-2 border-b border-surface-100 dark:border-surface-800 shrink-0">
          <div className="flex gap-1">
            {(['censored', 'uncensored'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setSection(value)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                  section === value
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
                    : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                }`}
              >
                {value === 'censored' ? t('jav:rankings.tabCensored') : t('jav:rankings.tabUncensored')}
              </button>
            ))}
          </div>
        </div>

        {/* 列表 */}
        <div className="p-2 sm:p-3 flex-1 min-h-0 overflow-hidden" style={{ height: CONTENT_HEIGHT }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-surface-400">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              <p className="text-xs">{t('jav:rankings.loading')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <AlertCircle className="w-6 h-6 text-error-400" />
              <p className="text-xs text-error-500">{error}</p>
              <button onClick={refresh} className="text-xs text-primary-500 underline">{t('jav:rankings.retry')}</button>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-surface-400">
              <Search className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">
                {period === 'weekly' ? t('jav:rankings.emptyWeekly') : t('jav:rankings.emptyMonthly')}
              </p>
            </div>
          ) : (
            <div className="h-full overflow-y-auto scrollbar-thin">
              <div className="space-y-0.5">
                {activeItems.map((item) => (
                  <RankingRow key={`${period}-${section}-${item.code}`} item={item} onClick={onCodeClick} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部来源 */}
        <div className="px-3 sm:px-4 py-2.5 border-t border-surface-50 dark:border-surface-800/60 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-surface-400 dark:text-surface-500">
            {t('jav:rankings.footerHint')}
          </p>
          <p className="text-[10px] text-surface-400 dark:text-surface-500">
            {t('jav:rankings.updatedAt', { time: formatUpdatedAt(updatedAt) })}
          </p>
        </div>
      </div>
    </div>
  );
};
