import React, { useState, useMemo } from 'react';
import { Clock, Search, Trash2, ChevronDown, ChevronRight, Calendar, User, Building2, Square, CheckSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Loading, ProxyImage } from '@/components/ui';
import { PanelSection, PanelHeader, Chip, CountBadge, EmptyBlock } from '@/components/workbench';
import { API_BASE_URL } from '@/constants';
import type { SearchHistoryItem } from '@/types';
import type { TFunction } from 'i18next';
import { clsx } from 'clsx';

const resolveCoverUrl = (cover: string): string => {
  if (!cover) return '';
  if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
  if (cover.startsWith('/')) return `https://www.javbus.com${cover}`;
  return cover;
};

const getProxyImageUrl = (url: string): string => {
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  );
  const baseUrl = isLocal ? '' : API_BASE_URL.PRODUCTION.replace('/api', '');
  return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(resolveCoverUrl(url))}`;
};

function groupByDay(items: SearchHistoryItem[], t: TFunction): Map<string, SearchHistoryItem[]> {
  const groups = new Map<string, SearchHistoryItem[]>();
  const todayStart = new Date(new Date().toLocaleDateString()).getTime();
  const yesterdayStart = todayStart - 86400000;

  items.forEach((item) => {
    let label: string;
    if (item.createdAt >= todayStart) {
      label = t('search:history.today');
    } else if (item.createdAt >= yesterdayStart) {
      label = t('search:history.yesterday');
    } else {
      const date = new Date(item.createdAt);
      label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  });

  return groups;
}

interface SearchHistoryPanelProps {
  history: SearchHistoryItem[];
  isLoading: boolean;
  show: boolean;
  onToggle: () => void;
  onItemClick: (query: string) => void;
  onClear: () => void;
  onDeleteSelected?: (ids: string[]) => void;
}

export const SearchHistoryPanel: React.FC<SearchHistoryPanelProps> = ({
  history, isLoading, show, onToggle, onItemClick, onClear, onDeleteSelected,
}) => {
  const { t } = useTranslation(['search']);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const groupedHistory = useMemo(() => groupByDay(history, t), [history, t]);

  const toggleSelectAll = (_dayKey: string, items: SearchHistoryItem[]) => {
    const allSelected = items.every((item) => selectedIds.has(item.id));
    const next = new Set(selectedIds);
    items.forEach((item) => (allSelected ? next.delete(item.id) : next.add(item.id)));
    setSelectedIds(next);
  };

  const toggleItem = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size > 0 && onDeleteSelected) {
      onDeleteSelected(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  return (
    <PanelSection>
      <PanelHeader
        icon={<Clock className="h-4 w-4" />}
        title={t('search:history.title')}
        count={history.length > 0 ? <CountBadge>{history.length}</CountBadge> : undefined}
        onToggle={onToggle}
        expanded={show}
        ariaControls="main-search-history"
        actions={
          <>
            {show && history.length > 0 ? (
              <button
                type="button"
                onClick={onClear}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-error-500 transition-colors hover:bg-error-50 dark:hover:bg-error-900/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('search:history.clearHistory')}</span>
              </button>
            ) : null}
            {show ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
          </>
        }
      />

      {show ? (
        <div id="main-search-history" className="max-h-[min(60vh,520px)] overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loading />
            </div>
          ) : history.length > 0 ? (
            <>
              {selectedIds.size > 0 ? (
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-error-100 bg-error-50/90 px-4 py-2 backdrop-blur-sm dark:border-error-900/30 dark:bg-error-900/20 sm:px-5">
                  <span className="type-micro text-error-600 dark:text-error-400">
                    {t('search:history.selected', { count: selectedIds.size })}
                  </span>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setSelectedIds(new Set())} className="type-micro text-surface-500 hover:text-surface-700">
                      {t('search:history.cancel')}
                    </button>
                    <button type="button" onClick={handleDeleteSelected} className="type-micro font-medium text-error-600 hover:text-error-700">
                      {t('search:history.deleteSelected')}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                {Array.from(groupedHistory.entries()).map(([dayKey, items]) => (
                  <div key={dayKey} className="mt-3 first:mt-1">
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <span className="type-micro font-medium text-surface-500">{dayKey}</span>
                      <button
                        type="button"
                        onClick={() => toggleSelectAll(dayKey, items)}
                        className="flex items-center gap-1 text-[10px] text-surface-400 hover:text-surface-600"
                      >
                        {items.every((item) => selectedIds.has(item.id)) ? (
                          <CheckSquare className="h-3 w-3" />
                        ) : (
                          <Square className="h-3 w-3" />
                        )}
                        {t('search:history.selectAll')}
                      </button>
                    </div>

                    <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={clsx(
                            'flex items-center gap-2 px-1 py-2 transition-colors',
                            selectedIds.has(item.id) && 'rounded-lg bg-error-50/40 dark:bg-error-900/10'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            className="shrink-0 text-surface-300 hover:text-surface-500"
                            aria-label={t('search:history.selectAll')}
                          >
                            {selectedIds.has(item.id) ? (
                              <CheckSquare className="h-3.5 w-3.5 text-error-500" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onItemClick(item.query)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            {item.cover ? (
                              <ProxyImage
                                src={getProxyImageUrl(item.cover)}
                                alt={item.title || item.query}
                                className="h-14 w-10 shrink-0 rounded-md bg-surface-100 object-cover"
                              />
                            ) : (
                              <Search className="h-3.5 w-3.5 shrink-0 text-surface-400" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                {item.code ? <Chip tone="primary">{item.code}</Chip> : null}
                                <span className="truncate text-[12px] font-medium text-surface-800 dark:text-surface-200">
                                  {item.title || item.query}
                                </span>
                                {item.resultsCount && item.resultsCount > 0 ? (
                                  <span className="type-micro shrink-0 tabular-nums text-surface-400">
                                    {t('search:history.resultCount', { count: item.resultsCount })}
                                  </span>
                                ) : null}
                              </div>
                              {(item.actors || item.duration || item.releaseDate || item.publisher) ? (
                                <div className="type-micro mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-surface-500">
                                  {item.actors ? (
                                    <span className="inline-flex max-w-[120px] items-center gap-0.5 truncate">
                                      <User className="h-2.5 w-2.5 shrink-0" />{item.actors}
                                    </span>
                                  ) : null}
                                  {item.duration ? (
                                    <span className="inline-flex items-center gap-0.5">
                                      <Clock className="h-2.5 w-2.5" />{t('search:history.durationMinutes', { count: item.duration })}
                                    </span>
                                  ) : null}
                                  {item.releaseDate ? (
                                    <span className="inline-flex items-center gap-0.5">
                                      <Calendar className="h-2.5 w-2.5" />{item.releaseDate}
                                    </span>
                                  ) : null}
                                  {item.publisher ? (
                                    <span className="inline-flex max-w-[100px] items-center gap-0.5 truncate">
                                      <Building2 className="h-2.5 w-2.5 shrink-0" />{item.publisher}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              {item.tags ? (
                                <div className="type-micro mt-0.5 flex flex-wrap gap-1 text-surface-500">
                                  {item.tags.split(',').slice(0, 3).map((tag, index) => (
                                    <span key={index}>{tag.trim()}</span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <EmptyBlock
                icon={<Clock className="h-8 w-8" />}
                title={t('search:history.empty')}
                className="min-h-[120px] bg-transparent"
              />
            </div>
          )}
        </div>
      ) : null}
    </PanelSection>
  );
};
