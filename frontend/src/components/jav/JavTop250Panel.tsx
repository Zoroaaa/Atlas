import React, { useEffect, useState } from 'react';
import {
  Trophy,
  RefreshCw,
  Loader2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useJavTop250 } from '@/hooks';
import { PanelSection, PanelHeader, Segmented, IconAction, EmptyBlock, CountBadge, Pagination } from '@/components/workbench';
import type { JavTop250Section } from '@/types';
import { JAV_TOP250_PAGE_SIZE, JAV_TOP250_YEARS } from '@/types';
import { RankingRow, pageActionClass } from './JavRankingsPanel';

interface JavTop250PanelProps {
  onCodeClick: (code: string) => void;
  layout?: 'panel' | 'page';
}

// 欧美榜暂不考虑：先隐藏入口，恢复时取消注释（同步脚本与 workflow 也需一并恢复）
const SECTION_KEYS: JavTop250Section[] = ['all', 'censored', 'uncensored' /* , 'western' */, 'fc2'];

export const JavTop250Panel: React.FC<JavTop250PanelProps> = ({ onCodeClick, layout = 'panel' }) => {
  const { t } = useTranslation(['jav']);
  const [expanded, setExpanded] = useState(true);
  const [section, setSection] = useState<JavTop250Section>('all');
  const [year, setYear] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refresh } = useJavTop250(section, year);

  const pageSize = layout === 'page' ? 20 : JAV_TOP250_PAGE_SIZE;
  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [section, year]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const updatedAt = data?.updatedAt ?? 0;
  const years = (data?.years?.length ? data.years : JAV_TOP250_YEARS)
    .slice()
    .sort((a, b) => b - a);

  const formatUpdatedAt = (value: number): string => {
    if (!value) return '—';
    const date = new Date(value);
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const filters = (
    <div className={clsx('flex flex-wrap items-center gap-2', layout === 'page' ? 'pb-4' : 'px-4 pb-2 pt-1 sm:px-5')}>
      {year == null ? (
        <Segmented
          value={section}
          onChange={(value) => setSection(value as JavTop250Section)}
          ariaLabel={t('jav:top250.tabAll')}
          options={SECTION_KEYS.map((key) => ({
            value: key,
            label: t(`jav:top250.tab.${key}`),
          }))}
        />
      ) : null}

      <span className="type-micro text-surface-400">{t('jav:rankings.sourceLabel')} · {formatUpdatedAt(updatedAt)}</span>

      <label className="flex items-center gap-1.5 text-[11px] font-medium text-surface-500">
        <span>{t('jav:top250.yearLabel')}</span>
        <select
          value={year == null ? 'all' : String(year)}
          onChange={(e) => setYear(e.target.value === 'all' ? null : Number(e.target.value))}
          className="rounded-lg border border-surface-200 bg-white px-2 py-1 text-[11px] font-semibold text-surface-700 outline-none transition-colors focus:border-primary-400 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
        >
          <option value="all">{t('jav:top250.overall')}</option>
          {years.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={refresh}
        disabled={isLoading}
        className={clsx('ml-auto', pageActionClass)}
      >
        <RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        {t('jav:top250.refresh')}
      </button>
    </div>
  );

  const body = (
    <>
      {isLoading ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-surface-400">
          <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
          <p className="type-micro">{t('jav:top250.loading')}</p>
        </div>
      ) : error ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <AlertCircle className="h-5 w-5 text-error-400" />
          <p className="type-micro text-error-500">{error}</p>
          <button type="button" onClick={refresh} className="type-micro text-primary-500 underline">{t('jav:rankings.retry')}</button>
        </div>
      ) : items.length === 0 ? (
        <EmptyBlock
          icon={<Search className="h-6 w-6" />}
          title={t('jav:top250.empty')}
          hint={t('jav:top250.emptyHint')}
          className="min-h-[160px] bg-transparent"
        />
      ) : (
        <div className="space-y-0.5 px-2 sm:px-0">
          {pageItems.map((item) => (
            <RankingRow key={`${section}-${year ?? 'all'}-${item.code}`} item={item} onClick={onCodeClick} />
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
        icon={<Trophy className="h-4 w-4" />}
        title={t('jav:top250.title')}
        count={items.length > 0 ? <CountBadge>{items.length}</CountBadge> : undefined}
        meta={`${t('jav:rankings.sourceLabel')} · ${t('jav:rankings.updatedAt', { time: formatUpdatedAt(updatedAt) })}`}
        onToggle={() => setExpanded((value) => !value)}
        expanded={expanded}
        ariaControls="main-jav-top250"
        actions={
          <>
            <IconAction
              icon={<RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />}
              label={t('jav:top250.refresh')}
              onClick={refresh}
              disabled={isLoading}
            />
            {expanded ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
          </>
        }
      />

      {expanded ? (
        <div id="main-jav-top250">
          {filters}
          <div className="px-2 pb-3 sm:px-3">{body}</div>
        </div>
      ) : null}
    </PanelSection>
  );
};
