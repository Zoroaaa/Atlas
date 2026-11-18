/**
 * JAV 推荐面板：相关推荐（跟随番号种子）与「为你推荐」两种变体，共用同一套卡片栅格。
 *
 * 约束：未登录或无有效种子时 hook 会关闭查询，本组件直接返回 null，不渲染空面板。
 */
import React, { useState } from 'react';
import { Sparkles, RefreshCw, Loader2, ChevronDown, ChevronRight, Film } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useJavRecommendations } from '@/hooks';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { PanelSection, PanelHeader, MediaCard, Chip, CountBadge, IconAction } from '@/components/workbench';
import { Tooltip } from '@/components/ui';
import { reasonText } from './recommendationReason';
import { pageActionClass } from './JavRankingsPanel';
import type { JavRecommendationSeed } from '@/types';

interface JavRecommendationsPanelProps {
  variant: 'related' | 'for-you';
  seed?: JavRecommendationSeed;
  excludeCodes?: string[];
  onCodeClick: (code: string) => void;
  /** page：作为独立页面内容渲染，不显示折叠头与面板外壳；embedded：嵌入其他详情卡片内部，使用轻量标题行 */
  layout?: 'panel' | 'page' | 'embedded';
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[10px] bg-surface-50/60 p-2.5 dark:bg-surface-900/40">
      <div className="skeleton aspect-[3/2] w-full" />
      <div className="skeleton mt-2 h-3 w-4/5" />
    </div>
  );
}

/** JAV 推荐：panel 折叠 / page 独立 / embedded 嵌入详情三种布局 */
export const JavRecommendationsPanel: React.FC<JavRecommendationsPanelProps> = ({
  variant,
  seed,
  excludeCodes = [],
  onCodeClick,
  layout = 'panel',
}) => {
  const { t } = useTranslation(['jav']);
  const [expanded, setExpanded] = useState(true);
  const { data, isLoading, isFetching, isError, refetch, queryEnabled } = useJavRecommendations({ variant, seed, excludeCodes });

  if (!queryEnabled) return null;
  if (isError) return null;

  const items = data?.items ?? [];
  if (!isLoading && items.length === 0) return null;

  // mode 由后端回填：related / popular / for-you 决定标题与口径说明，前端只做文案映射
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

  const grid = (
    <div className={clsx('grid gap-3', layout === 'page' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
      {isLoading
        ? Array.from({ length: layout === 'page' ? 20 : 8 }).map((_, index) => <SkeletonCard key={index} />)
        : items.map((item) => (
            <MediaCard
              key={`${item.code}-${item.reason.type}`}
              orientation="tile"
              coverAspect="auto"
              cover={item.cover ? getProxyImageUrl(item.cover) : undefined}
              coverFallback={<Film className="h-6 w-6" />}
              title={item.title}
              badges={
                <>
                  {item.rank ? <Chip tone="primary" size="xs">#{item.rank}</Chip> : null}
                  <Chip tone="neutral" size="xs">{item.code}</Chip>
                </>
              }
              meta={<span className="truncate">{reasonText(t, item)}</span>}
              onSelect={() => onCodeClick(item.code)}
            />
          ))}
    </div>
  );

  if (layout === 'page') {
    return (
      <div>
        <div className="flex items-center justify-end pb-4">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className={pageActionClass}
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t('jav:recommend.refresh')}
          </button>
        </div>
        {grid}
      </div>
    );
  }

  if (layout === 'embedded') {
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-surface-400" />
            <span className="type-micro font-medium text-surface-500">{title}</span>
            {items.length > 0 ? <CountBadge>{items.length}</CountBadge> : null}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title={t('jav:recommend.refresh')}
            aria-label={t('jav:recommend.refresh')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600 disabled:opacity-60 dark:hover:bg-surface-800 dark:hover:text-surface-200"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
        {grid}
      </div>
    );
  }

  return (
    <PanelSection>
      <PanelHeader
        icon={<Sparkles className="h-4 w-4" />}
        title={title}
        count={items.length > 0 ? <CountBadge>{items.length}</CountBadge> : undefined}
        info={<Tooltip content={intro} label={t('jav:panelInfo.show')} />}
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
          {grid}
        </div>
      ) : null}
    </PanelSection>
  );
};
