import React, { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useJavRecommendations } from '@/hooks';
import { getProxyImageUrl } from '@/utils/imageProxy';
import type {
  JavRecommendationItem,
  JavRecommendationSeed,
} from '@/types';

interface JavRecommendationsPanelProps {
  variant: 'related' | 'for-you';
  seed?: JavRecommendationSeed;
  excludeCodes?: string[];
  onCodeClick: (code: string) => void;
}

function reasonText(t: TFunction, item: JavRecommendationItem): string {
  switch (item.reason.type) {
    case 'ranking':
      return item.reason.period === 'weekly'
        ? t('jav:recommend.reasonRankingWeekly', { rank: item.rank ?? '' })
        : t('jav:recommend.reasonRankingMonthly', { rank: item.rank ?? '' });
    case 'actor':
      return item.reason.value
        ? t('jav:recommend.reasonActor', { value: item.reason.value })
        : t('jav:recommend.reasonPopular');
    case 'tag':
      return t('jav:recommend.reasonTag', { value: item.reason.value ?? '' });
    case 'publisher':
      return t('jav:recommend.reasonPublisher', { value: item.reason.value ?? '' });
    default:
      return t('jav:recommend.reasonPopular');
  }
}

const RecommendationCard: React.FC<{
  item: JavRecommendationItem;
  onClick: (code: string) => void;
}> = ({ item, onClick }) => {
  const { t } = useTranslation(['jav']);
  const [broken, setBroken] = useState(false);
  const hasCover = Boolean(item.cover) && !broken;

  return (
    <button
      onClick={() => onClick(item.code)}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-surface-200/70 bg-white text-left transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md dark:border-surface-700/70 dark:bg-surface-900/80"
      title={item.title}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-surface-100 to-surface-300 dark:from-surface-800 dark:to-surface-700">
        {hasCover ? (
          <img
            src={getProxyImageUrl(item.cover!)}
            alt={item.code}
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center">
            <span className="text-xs font-semibold tracking-wide text-surface-500 dark:text-surface-400">
              {item.code}
            </span>
          </div>
        )}
        {item.rank ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-primary-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
            #{item.rank}
          </span>
        ) : null}
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {item.code}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 text-[11px] font-medium leading-snug text-surface-800 dark:text-surface-200">
          {item.title}
        </p>
        <span className="mt-auto w-fit max-w-full truncate rounded-full bg-surface-100 px-1.5 py-0.5 text-[10px] text-surface-500 dark:bg-surface-800 dark:text-surface-400">
          {reasonText(t, item)}
        </span>
      </div>
    </button>
  );
};

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-surface-200/70 dark:border-surface-700/70">
      <div className="aspect-[3/4] w-full animate-pulse bg-surface-200 dark:bg-surface-800" />
      <div className="space-y-1.5 p-2">
        <div className="h-2.5 w-4/5 animate-pulse rounded bg-surface-200 dark:bg-surface-800" />
        <div className="h-2.5 w-3/5 animate-pulse rounded bg-surface-200 dark:bg-surface-800" />
      </div>
    </div>
  );
}

export const JavRecommendationsPanel: React.FC<JavRecommendationsPanelProps> = ({
  variant,
  seed,
  excludeCodes = [],
  onCodeClick,
}) => {
  const { t } = useTranslation(['jav']);
  const [expanded, setExpanded] = useState(true);
  const { data, isLoading, isFetching, isError, refetch, queryEnabled } =
    useJavRecommendations({ variant, seed, excludeCodes });

  if (!queryEnabled) return null;
  if (isError) return null;

  const items = data?.items ?? [];
  if (!isLoading && items.length === 0) return null;

  const mode = data?.mode;
  const title = mode === 'related'
    ? t('jav:recommend.titleRelated')
    : mode === 'popular'
      ? t('jav:recommend.titlePopular')
      : t('jav:recommend.titleForYou');
  const intro = mode === 'popular'
    ? t('jav:recommend.basisPopular')
    : mode === 'related'
      ? t('jav:recommend.basisRelated')
      : t('jav:recommend.basis');

  return (
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-surface-200/60 bg-white shadow-lg shadow-surface-900/5 dark:border-surface-700/60 dark:bg-surface-900/90">
      <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3 dark:border-surface-800">
        <button
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
            {title}
          </span>
          {items.length > 0 ? (
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
              {items.length}
            </span>
          ) : null}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title={t('jav:recommend.refresh')}
            className="rounded-lg p-1.5 text-surface-400 transition-all hover:bg-primary-50 hover:text-primary-500 disabled:opacity-40 dark:hover:bg-primary-900/20"
          >
            {isFetching
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          {expanded
            ? <ChevronDown className="h-4 w-4 text-surface-400" />
            : <ChevronRight className="h-4 w-4 text-surface-400" />}
        </div>
      </div>

      {expanded ? (
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin p-3 sm:p-4">
          <p className="mb-2.5 text-[10px] leading-relaxed text-surface-400 dark:text-surface-500">
            {intro}
          </p>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <RecommendationCard
                  key={`${item.code}-${item.reason.type}`}
                  item={item}
                  onClick={onCodeClick}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
