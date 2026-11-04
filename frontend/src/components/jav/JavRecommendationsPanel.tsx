import React, { useState } from 'react';
import { Sparkles, RefreshCw, Loader2, ChevronDown, ChevronRight, Film } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useJavRecommendations } from '@/hooks';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { PanelSection, PanelHeader, MediaCard, Chip, CountBadge, IconAction } from '@/components/workbench';
import type { JavRecommendationItem, JavRecommendationSeed } from '@/types';

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

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[10px] bg-surface-50/60 p-2.5 dark:bg-surface-900/40">
      <div className="skeleton aspect-[3/4] w-full" />
      <div className="skeleton mt-2 h-3 w-4/5" />
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
  const { data, isLoading, isFetching, isError, refetch, queryEnabled } = useJavRecommendations({ variant, seed, excludeCodes });

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
    <PanelSection>
      <PanelHeader
        icon={<Sparkles className="h-4 w-4" />}
        title={title}
        count={items.length > 0 ? <CountBadge>{items.length}</CountBadge> : undefined}
        meta={intro}
        onToggle={() => setExpanded((value) => !value)}
        expanded={expanded}
        ariaControls="main-jav-recommendations"
        actions={
          <>
            <IconAction
              icon={isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              label={t('jav:recommend.refresh')}
              onClick={() => refetch()}
              disabled={isFetching}
            />
            {expanded ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
          </>
        }
      />

      {expanded ? (
        <div id="main-jav-recommendations" className="px-4 pb-4 sm:px-5 sm:pb-5">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={index} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <MediaCard
                  key={`${item.code}-${item.reason.type}`}
                  orientation="tile"
                  cover={item.cover ? getProxyImageUrl(item.cover) : undefined}
                  coverFallback={<Film className="h-6 w-6" />}
                  title={item.title}
                  badges={
                    <>
                      {item.rank ? <Chip tone="primary" size="xs">#{item.rank}</Chip> : null}
                      <Chip tone="neutral" size="xs">{item.code}</Chip>
                    </>
                  }
                  meta={<span className={clsx('truncate')}>{reasonText(t, item)}</span>}
                  onSelect={() => onCodeClick(item.code)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </PanelSection>
  );
};
