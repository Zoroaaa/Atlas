import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Trophy,
  RefreshCw,
  Search,
  Loader2,
  AlertTriangle,
  CalendarDays,
  Layers,
  Film,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dataStorageApi } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/workbench';
import { Pagination, TableWrapper, formatDate } from './shared';
import type {
  RankingArchiveEntry,
  RankingArchiveListType,
  RankingArchiveMeta,
  RankingArchiveSection,
  RankingArchiveSnapshot,
} from '@/types';

type ListFilter = 'all' | RankingArchiveListType;

const LIST_TABS: Array<{ value: ListFilter; label: string }> = [
  { value: 'all', label: 'admin:rankingArchive.listType.all' },
  { value: 'weekly', label: 'admin:rankingArchive.listType.weekly' },
  { value: 'monthly', label: 'admin:rankingArchive.listType.monthly' },
  { value: 'yearly', label: 'admin:rankingArchive.listType.yearly' },
  { value: 'top250', label: 'admin:rankingArchive.listType.top250' },
];

const SECTION_TABS: Array<{ value: '' | RankingArchiveSection; label: string }> = [
  { value: '', label: 'admin:rankingArchive.section.all' },
  { value: 'censored', label: 'admin:rankingArchive.section.censored' },
  { value: 'uncensored', label: 'admin:rankingArchive.section.uncensored' },
  { value: 'western', label: 'admin:rankingArchive.section.western' },
  { value: 'fc2', label: 'admin:rankingArchive.section.fc2' },
  { value: 'all', label: 'admin:rankingArchive.section.sitewide' },
];

function listTypeLabel(t: (key: string) => string, value: string): string {
  const key = `admin:rankingArchive.listType.${value}`;
  const label = t(key);
  return label === key ? value : label;
}

/** 周期键去掉类型前缀，展示为 2026-W47 / 2026-11 / 2026 */
function formatCycleKey(value: string | null | undefined): string {
  if (!value) return '-';
  const index = value.indexOf(':');
  return index >= 0 ? value.slice(index + 1) : value;
}

const EMPTY_META: RankingArchiveMeta = {
  totals: { snapshots: 0, entries: 0, works: 0 },
  channels: [],
  years: [],
};

export const RankingsArchiveTab: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const [meta, setMeta] = useState<RankingArchiveMeta>(EMPTY_META);
  const [listType, setListType] = useState<ListFilter>('all');
  const [section, setSection] = useState<'' | RankingArchiveSection>('');
  const [year, setYear] = useState('');
  const [cycleKey, setCycleKey] = useState('');
  const [snapshotKey, setSnapshotKey] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [entries, setEntries] = useState<RankingArchiveEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [snapshots, setSnapshots] = useState<RankingArchiveSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => ({
    ...(listType === 'all' ? {} : { listType }),
    ...(section ? { section } : {}),
    ...(year ? { year: Number(year) } : {}),
  }), [listType, section, year]);

  const loadMeta = useCallback(async () => {
    try {
      const data = await dataStorageApi.getRankingArchiveMeta();
      setMeta(data ?? EMPTY_META);
    } catch (err) {
      console.error('[ranking-archive] meta failed:', err);
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dataStorageApi.getRankingArchiveEntries({
        ...filters,
        ...(cycleKey ? { cycleKey } : {}),
        ...(snapshotKey ? { snapshotKey } : {}),
        ...(search ? { search } : {}),
        page,
        pageSize,
      });
      setEntries(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
      setTotalPages(Math.max(1, Number(data?.totalPages) || 1));
    } catch (err) {
      console.error('[ranking-archive] entries failed:', err);
      setError(t('admin:rankingArchive.loadFailed'));
      setEntries([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [filters, cycleKey, snapshotKey, search, page, pageSize, t]);

  const loadSnapshots = useCallback(async () => {
    try {
      const data = await dataStorageApi.getRankingArchiveSnapshots({
        ...filters,
        page: 1,
        pageSize: 100,
      });
      setSnapshots(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      console.error('[ranking-archive] snapshots failed:', err);
      setSnapshots([]);
    }
  }, [filters]);

  // 周期选项来自当前筛选下的快照；终榜标记取该周期内任意一条命中即可
  const cycleOptions = useMemo(() => {
    const map = new Map<string, { key: string; isFinal: boolean; latestAt: number }>();
    for (const item of snapshots) {
      if (!item.cycleKey) continue;
      const existing = map.get(item.cycleKey);
      if (!existing) {
        map.set(item.cycleKey, {
          key: item.cycleKey,
          isFinal: item.isFinal,
          latestAt: item.snapshotAt,
        });
      } else {
        existing.isFinal = existing.isFinal || item.isFinal;
        existing.latestAt = Math.max(existing.latestAt, item.snapshotAt);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.latestAt - a.latestAt);
  }, [snapshots]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    setSnapshotKey('');
    setCycleKey('');
    setPage(1);
  }, [listType, section, year]);

  useEffect(() => {
    if (listType !== 'all' && listType !== 'yearly') setYear('');
  }, [listType]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const refreshAll = () => {
    loadMeta();
    loadSnapshots();
    loadEntries();
  };

  const statCards = [
    {
      key: 'snapshots',
      label: t('admin:rankingArchive.stats.snapshots'),
      value: meta.totals.snapshots,
      icon: <CalendarDays className="h-4 w-4" />,
    },
    {
      key: 'entries',
      label: t('admin:rankingArchive.stats.entries'),
      value: meta.totals.entries,
      icon: <Layers className="h-4 w-4" />,
    },
    {
      key: 'works',
      label: t('admin:rankingArchive.stats.works'),
      value: meta.totals.works,
      icon: <Film className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            <Trophy className="h-5 w-5 text-amber-500" />
            {t('admin:rankingArchive.title')}
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('admin:rankingArchive.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          <RefreshCw className={clsx('h-4 w-4', isLoading && 'animate-spin')} />
          {t('admin:rankingArchive.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {statCards.map((item) => (
          <Card key={item.key} className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
              {item.icon}
            </div>
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400">{item.label}</p>
              <p className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                {Number(item.value || 0).toLocaleString()}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={listType}
            options={LIST_TABS.map((tab) => ({ value: tab.value, label: t(tab.label) }))}
            onChange={(value) => setListType(value as ListFilter)}
            ariaLabel={t('admin:rankingArchive.listType.all')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={section}
            options={SECTION_TABS.map((tab) => ({ value: tab.value, label: t(tab.label) }))}
            onChange={(value) => setSection(value as '' | RankingArchiveSection)}
            ariaLabel={t('admin:rankingArchive.section.all')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(listType === 'all' || listType === 'yearly') && (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-lg border border-surface-200 bg-white px-2.5 py-1.5 text-xs font-medium text-surface-700 outline-none transition-colors focus:border-amber-400 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
              aria-label={t('admin:rankingArchive.yearLabel')}
            >
              <option value="">{t('admin:rankingArchive.yearAll')}</option>
              {(meta.years.length ? meta.years : []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          )}

          <select
            value={cycleKey}
            onChange={(e) => {
              setCycleKey(e.target.value);
              setSnapshotKey('');
              setPage(1);
            }}
            className="rounded-lg border border-surface-200 bg-white px-2.5 py-1.5 text-xs font-medium text-surface-700 outline-none transition-colors focus:border-amber-400 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
            aria-label={t('admin:rankingArchive.cycleLabel')}
          >
            <option value="">{t('admin:rankingArchive.cycleAll')}</option>
            {cycleOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {`${formatCycleKey(item.key)}${item.isFinal ? ` · ${t('admin:rankingArchive.finalBadge')}` : ''}`}
              </option>
            ))}
          </select>

          <select
            value={snapshotKey}
            onChange={(e) => {
              setSnapshotKey(e.target.value);
              setCycleKey('');
              setPage(1);
            }}
            className="min-w-[220px] rounded-lg border border-surface-200 bg-white px-2.5 py-1.5 text-xs font-medium text-surface-700 outline-none transition-colors focus:border-amber-400 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
            aria-label={t('admin:rankingArchive.snapshotLabel')}
          >
            <option value="">{t('admin:rankingArchive.snapshotAll')}</option>
            {snapshots.map((item) => (
              <option key={item.snapshotKey} value={item.snapshotKey}>
                {`${item.cycleKey ? `${formatCycleKey(item.cycleKey)} · ` : ''}${formatDate(item.snapshotAt)} · ${item.sourceName}（${item.itemCount}）${item.isFinal ? ` · ${t('admin:rankingArchive.finalBadge')}` : ''}`}
              </option>
            ))}
          </select>

          <form onSubmit={handleSearch} className="ml-auto flex min-w-[220px] items-center gap-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('admin:rankingArchive.searchPlaceholder')}
              className="h-8 text-xs"
            />
            <button
              type="submit"
              className="flex h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
            >
              <Search className="h-3.5 w-3.5" />
              {t('admin:rankingArchive.search')}
            </button>
          </form>
        </div>
      </Card>

      {error ? (
        <Card className="flex min-h-[180px] flex-col items-center justify-center gap-2 p-6">
          <AlertTriangle className="h-6 w-6 text-red-500" />
          <p className="text-sm text-stone-500 dark:text-stone-400">{error}</p>
          <button
            type="button"
            onClick={refreshAll}
            className="text-sm font-medium text-amber-600 underline dark:text-amber-400"
          >
            {t('admin:rankingArchive.retry')}
          </button>
        </Card>
      ) : isLoading ? (
        <Card className="flex min-h-[180px] items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </Card>
      ) : entries.length === 0 ? (
        <Card className="flex min-h-[180px] flex-col items-center justify-center gap-2 p-6">
          <Trophy className="h-8 w-8 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-medium text-stone-600 dark:text-stone-300">
            {t('admin:rankingArchive.empty')}
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500">
            {t('admin:rankingArchive.emptyHint')}
          </p>
        </Card>
      ) : (
        <>
          <TableWrapper>
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
                <tr>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.rank')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.work')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.list')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.cycle')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.section')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.year')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.snapshot')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.score')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin:rankingArchive.col.detail')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {entries.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                      #{item.rank}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="max-w-[340px] truncate font-medium text-stone-800 dark:text-stone-200" title={item.title}>
                        {item.title}
                      </p>
                      <p className="font-mono text-[11px] text-stone-500 dark:text-stone-400">{item.code}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        {listTypeLabel(t, item.listType)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <span className="font-mono text-xs text-stone-600 dark:text-stone-300">
                          {formatCycleKey(item.cycleKey)}
                        </span>
                        {item.isFinal ? (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {t('admin:rankingArchive.finalBadge')}
                          </span>
                        ) : item.cycleKey ? (
                          <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                            {t('admin:rankingArchive.historyBadge')}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400">
                      {t(`admin:rankingArchive.section.${item.section === 'all' ? 'sitewide' : item.section}`)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400">
                      {item.year ?? '-'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400">
                      {formatDate(item.snapshotAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-stone-500 dark:text-stone-400">
                      {item.score ?? '-'}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.detailCompleted || item.detailStatus === 'complete' ? (
                        <span className="rounded-md bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {t('admin:rankingArchive.detail.complete')}
                        </span>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {t('admin:rankingArchive.detail.incomplete')}
                          </span>
                          {item.detailMissing?.map((field) => (
                            <span
                              key={field}
                              className="rounded bg-stone-100 px-1 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                            >
                              {t(`admin:dataStorage.detailField.${field}`)}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {t('admin:rankingArchive.total', { count: total })}
            </p>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
};
