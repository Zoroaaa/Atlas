/**
 * JAV 榜单面板：周榜/月榜，按有码/无码分栏，支持折叠与分页。
 *
 * 约束：layout=page 时作为独立页面渲染，不套面板外壳；移动端行布局由 RankingRow 的 mobileLayout 决定。
 */
import React, { useEffect, useState } from 'react';
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
import { ProxyImage } from '@/components/ui';
import { PanelSection, PanelHeader, Segmented, IconAction, EmptyBlock, CountBadge, Pagination } from '@/components/workbench';
import type { JavRankingEntry, JavRankingPeriod, JavRankingSection } from '@/types';
import { JAV_RANKINGS_PAGE_SIZE } from '@/types';

interface JavRankingsPanelProps {
  onCodeClick: (code: string) => void;
  /** page：作为独立页面内容渲染，不显示折叠头与面板外壳 */
  layout?: 'panel' | 'page';
}

const RANK_COLORS = ['text-primary-500', 'text-surface-400', 'text-primary-700'];

/** 页面级操作按钮（刷新等）的统一样式，Top250 与推荐页复用 */
export const pageActionClass = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 text-xs font-medium text-surface-600 transition-colors hover:bg-surface-50 disabled:opacity-50 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300 dark:hover:bg-surface-800';

/** 榜单行：排名、升降标识、封面与标题；stacked 供移动端改为纵向卡片 */
export const RankingRow: React.FC<{
  item: JavRankingEntry;
  onClick: (code: string) => void;
  /** stacked：移动端改为纵向卡片（封面、番号、标题各自独占一行），PC 端布局不变 */
  mobileLayout?: 'row' | 'stacked';
}> = ({ item, onClick, mobileLayout = 'row' }) => {
  const stacked = mobileLayout === 'stacked';

  return (
    <div
      className={clsx(
        'group flex w-full rounded-lg px-1.5 py-2.5 transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/50',
        stacked
          ? 'flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-2'
          : 'items-center gap-2.5 sm:gap-3 sm:px-2'
      )}
    >
      <div
        className={clsx(
          'flex w-7 shrink-0 flex-col items-center',
          stacked && 'max-sm:order-2 max-sm:w-auto max-sm:flex-row max-sm:items-center max-sm:gap-1.5'
        )}
      >
        <span className={clsx('text-[13px] font-bold tabular-nums', RANK_COLORS[item.rank - 1] ?? 'text-surface-400')}>
          {item.rank}
        </span>
        {item.isNew ? (
          <span className="text-[10px] font-bold leading-none text-amber-500">NEW</span>
        ) : item.change ? (
          <span
            className={clsx(
              'text-[10px] font-semibold leading-none tabular-nums',
              item.change > 0 ? 'text-emerald-500' : 'text-red-500'
            )}
          >
            {item.change > 0 ? '↑' : '↓'}{Math.abs(item.change)}
          </span>
        ) : null}
      </div>
      <div
        className={clsx(
          'shrink-0 overflow-hidden rounded-md bg-surface-100 dark:bg-surface-800',
          stacked
            ? 'aspect-[3/2] w-full max-sm:order-1 sm:h-24 sm:w-36'
            : 'h-20 w-28 sm:h-24 sm:w-36'
        )}
      >
        {item.cover ? (
          <ProxyImage
            src={getProxyImageUrl(item.cover)}
            alt={item.code}
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-surface-400">
            {item.code.slice(0, 6)}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onClick(item.code)}
        className={clsx(
          'min-w-0 flex-1 text-left',
          stacked && 'max-sm:flex max-sm:w-full max-sm:flex-none max-sm:flex-col'
        )}
        title={item.title}
      >
        <p className={clsx('line-clamp-2 text-[13px] font-medium leading-snug text-surface-800 dark:text-surface-200', stacked && 'max-sm:order-2 max-sm:mt-1')}>{item.title}</p>
        <p className={clsx('type-micro mt-1 truncate font-semibold text-surface-500', stacked && 'max-sm:order-1 max-sm:mt-0')}>{item.code}</p>
      </button>
    </div>
  );
};

/** JAV 榜单：周期/分区切换、刷新与分页 */
export const JavRankingsPanel: React.FC<JavRankingsPanelProps> = ({ onCodeClick, layout = 'panel' }) => {
  const { t } = useTranslation(['jav']);
  const { data, isLoading, error, refresh } = useJavRankings();
  const [expanded, setExpanded] = useState(true);
  const [period, setPeriod] = useState<JavRankingPeriod>('monthly');
  const [section, setSection] = useState<JavRankingSection>('censored');
  const [page, setPage] = useState(1);

  const pageSize = layout === 'page' ? 15 : JAV_RANKINGS_PAGE_SIZE;
  // 页面布局下移动端抵消外层卡片内边距，让榜单行贴近屏幕边缘，减少左右大片留白
  const listClassName = layout === 'page' ? '-mx-5 space-y-0.5 sm:mx-0' : 'space-y-0.5 px-2 sm:px-0';
  const activeItems = data?.[period]?.[section] ?? [];
  const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize));
  const pageItems = activeItems.slice((page - 1) * pageSize, page * pageSize);

  // 切换周期/分区时回到第一页；数据变短导致页码越界时收敛到最后一页
  useEffect(() => { setPage(1); }, [period, section]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const updatedAt = data?.[period]?.updatedAt ?? 0;

  const formatUpdatedAt = (value: number): string => {
    if (!value) return '—';
    const date = new Date(value);
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const filters = (
    <div className={clsx('flex flex-wrap items-center gap-2', layout === 'page' ? 'pb-4' : 'px-4 pb-2 pt-1 sm:px-5')}>
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
      <span className="type-micro text-surface-400">{t('jav:rankings.sourceLabel')} · {formatUpdatedAt(updatedAt)}</span>
      <button
        type="button"
        onClick={refresh}
        disabled={isLoading}
        className={clsx('ml-auto', pageActionClass)}
      >
        <RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        {t('jav:rankings.refresh')}
      </button>
    </div>
  );

  const body = (
    <>
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
          className="min-h-[160px] bg-transparent"
        />
      ) : (
        <div className={listClassName}>
          {pageItems.map((item) => (
            <RankingRow key={`${period}-${section}-${item.code}`} item={item} onClick={onCodeClick} />
          ))}
        </div>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={setPage}
        prevLabel={t('jav:actressResults.previousPage')}
        nextLabel={t('jav:actressResults.nextPage')}
      />
    </>
  );

  if (layout === 'page') {
    return (
      <div>
        {filters}
        {body}
      </div>
    );
  }

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
          {filters}
          <div className="px-2 pb-3 sm:px-3">{body}</div>
        </div>
      ) : null}
    </PanelSection>
  );
};
