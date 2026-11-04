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
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useJavRankings } from '@/hooks';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { PanelSection, PanelHeader, Segmented, IconAction, EmptyBlock, CountBadge } from '@/components/workbench';
import type { JavRankingEntry, JavRankingPeriod, JavRankingSection } from '@/types';

interface JavRankingsPanelProps {
  onCodeClick: (code: string) => void;
}

const RANK_COLORS = ['text-primary-500', 'text-surface-400', 'text-primary-700'];

const RankingRow: React.FC<{
  item: JavRankingEntry;
  onClick: (code: string) => void;
}> = ({ item, onClick }) => {
  const [broken, setBroken] = useState(false);
  const hasCover = Boolean(item.cover) && !broken;

  return (
    <button
      type="button"
      onClick={() => onClick(item.code)}
      className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/50"
      title={item.title}
    >
      <span className={clsx('w-5 shrink-0 text-center text-[11px] font-bold tabular-nums', RANK_COLORS[item.rank - 1] ?? 'text-surface-400')}>
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
          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-surface-400">
            {item.code.slice(0, 6)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[12px] font-medium leading-snug text-surface-800 dark:text-surface-200">{item.title}</p>
        <p className="type-micro mt-0.5 truncate font-semibold text-surface-500">{item.code}</p>
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
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <PanelSection>
      <PanelHeader
        icon={<TrendingUp className="h-4 w-4" />}
        title={t('jav:rankings.title')}
        count={activeItems.length > 0 ? <CountBadge>{activeItems.length}</CountBadge> : undefined}
        meta={`${t('jav:rankings.sourceLabel')} · ${t('jav:rankings.updatedAt', { time: formatUpdatedAt(updatedAt) })}`}
        onToggle={() => setExpanded((value) => !value)}
        expanded={expanded}
        ariaControls="main-jav-rankings"
        actions={
          <>
            <IconAction
              icon={<RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />}
              label={t('jav:rankings.refresh')}
              onClick={refresh}
              disabled={isLoading}
            />
            {expanded ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
          </>
        }
      />

      {expanded ? (
        <div id="main-jav-rankings">
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-1 sm:px-5">
            <Segmented
              value={period}
              onChange={setPeriod}
              ariaLabel={t('jav:rankings.periodMonthly')}
              options={[
                { value: 'monthly', label: t('jav:rankings.periodMonthly') },
                { value: 'weekly', label: t('jav:rankings.periodWeekly') },
              ]}
            />
            <Segmented
              value={section}
              onChange={setSection}
              ariaLabel={t('jav:rankings.tabCensored')}
              options={[
                { value: 'censored', label: t('jav:rankings.tabCensored') },
                { value: 'uncensored', label: t('jav:rankings.tabUncensored') },
              ]}
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto px-2 pb-3 scrollbar-thin sm:px-3">
            {isLoading ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-surface-400">
                <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                <p className="type-micro">{t('jav:rankings.loading')}</p>
              </div>
            ) : error ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2">
                <AlertCircle className="h-5 w-5 text-error-400" />
                <p className="type-micro text-error-500">{error}</p>
                <button type="button" onClick={refresh} className="type-micro text-primary-500 underline">{t('jav:rankings.retry')}</button>
              </div>
            ) : activeItems.length === 0 ? (
              <EmptyBlock
                icon={<Search className="h-6 w-6" />}
                title={period === 'weekly' ? t('jav:rankings.emptyWeekly') : t('jav:rankings.emptyMonthly')}
                className="min-h-[120px] bg-transparent"
              />
            ) : (
              <div className="space-y-0.5">
                {activeItems.map((item) => (
                  <RankingRow key={`${period}-${section}-${item.code}`} item={item} onClick={onCodeClick} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </PanelSection>
  );
};
