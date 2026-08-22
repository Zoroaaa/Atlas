import React, { useState, useMemo } from 'react';
import { Clock, Search, Trash2, ChevronDown, ChevronRight, Calendar, User, Building2, Square, CheckSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Loading, ProxyImage } from '@/components/ui';
import { API_BASE_URL } from '@/constants';
import type { SearchHistoryItem } from '@/types';
import type { TFunction } from 'i18next';

// ─── 图片代理（与搜索结果统一走后端 /api/jav/proxy-image）─────────

/** 将相对路径转为完整 URL（JAV 封面存的是 /pics/cover/xxx.jpg） */
const resolveCoverUrl = (cover: string): string => {
  if (!cover) return '';
  // 已是完整 URL → 直接返回
  if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
  // 相对路径 → 拼接 JavBus 域名
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

// ─── 高度常量（与 JavRankingsPanel 共享逻辑）────────────────────────
const HIST_PANEL_HEIGHT = 800;
const HIST_HEADER_HEIGHT = 64;

const CONTENT_H = HIST_PANEL_HEIGHT - HIST_HEADER_HEIGHT - 36;

// ─── 按天分组工具函数 ─────────────────────────────────────────────

function groupByDay(items: SearchHistoryItem[], t: TFunction): Map<string, SearchHistoryItem[]> {
  const groups = new Map<string, SearchHistoryItem[]>();
  const todayStart = new Date(new Date().toLocaleDateString()).getTime();
  const yesterdayStart = todayStart - 86400000;

  items.forEach(item => {
    let label: string;
    if (item.createdAt >= todayStart) {
      label = t('search:history.today');
    } else if (item.createdAt >= yesterdayStart) {
      label = t('search:history.yesterday');
    } else {
      const d = new Date(item.createdAt);
      label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    const allSelected = items.every(item => selectedIds.has(item.id));
    const newSet = new Set(selectedIds);
    if (allSelected) {
      items.forEach(item => newSet.delete(item.id));
    } else {
      items.forEach(item => newSet.add(item.id));
    }
    setSelectedIds(newSet);
  };

  const toggleItem = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size > 0 && onDeleteSelected) {
      onDeleteSelected(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  return (
    <div
      className="collapsible-section animate-fade-in transition-all duration-300 overflow-hidden shrink-0"
      style={{ animationDelay: '100ms', height: show ? HIST_PANEL_HEIGHT : HIST_HEADER_HEIGHT }}
    >
      {/* Header */}
      <button onClick={onToggle} className="collapsible-header" style={{ height: HIST_HEADER_HEIGHT }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">{t('search:history.title')}</span>
          {history.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
              {history.length}
            </span>
          )}
        </div>
        {show
          ? <ChevronDown className="w-4 h-4 text-surface-400" />
          : <ChevronRight className="w-4 h-4 text-surface-400" />}
      </button>

      {/* 内容区：固定高度 */}
      <div style={{ height: HIST_PANEL_HEIGHT - HIST_HEADER_HEIGHT }}>
        {isLoading ? (
          <div className="flex justify-center items-center" style={{ height: CONTENT_H + 24 }}>
            <Loading />
          </div>
        ) : history.length > 0 ? (
          <>
            {/* 批量操作栏 */}
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border-b border-rose-100 dark:border-rose-900/30">
                <span className="text-xs text-rose-600 dark:text-rose-400">{t('search:history.selected', { count: selectedIds.size })}</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs text-surface-500 hover:text-surface-700">
                    {t('search:history.cancel')}
                  </button>
                  <button onClick={handleDeleteSelected} className="text-xs text-rose-600 hover:text-rose-700 font-medium">
                    {t('search:history.deleteSelected')}
                  </button>
                </div>
              </div>
            )}

            {/* 历史列表：固定内容高度，内部滚动 */}
            <div className="p-3 sm:p-4 overflow-y-auto scrollbar-thin" style={{ height: CONTENT_H + 24 - (selectedIds.size > 0 ? 40 : 0) }}>
              {Array.from(groupedHistory.entries()).map(([dayKey, items]) => (
                <div key={dayKey} className="mb-4">
                  {/* 日期标题 + 全选按钮 */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-surface-500 dark:text-surface-400">{dayKey}</span>
                    <button
                      onClick={() => toggleSelectAll(dayKey, items)}
                      className="flex items-center gap-1 text-[10px] text-surface-400 hover:text-surface-600 transition-colors"
                    >
                      {items.every(item => selectedIds.has(item.id)) ? (
                        <CheckSquare className="w-3 h-3" />
                      ) : (
                        <Square className="w-3 h-3" />
                      )}
                      {t('search:history.selectAll')}
                    </button>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={`group rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/40 cursor-pointer transition-all border border-surface-100 dark:border-surface-800 active:scale-[0.98] overflow-hidden ${
                          selectedIds.has(item.id) ? 'ring-1 ring-rose-400 bg-rose-50/30 dark:bg-rose-900/10' : ''
                        } ${item.cover ? 'flex gap-2.5 p-2 sm:p-2.5' : 'flex flex-col gap-1.5 p-2 sm:p-2.5'}`}
                      >
                        {/* 选择框 */}
                        <div className="flex items-start gap-2 w-full">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleItem(item.id); }}
                            className="mt-1 shrink-0"
                          >
                            {selectedIds.has(item.id) ? (
                              <CheckSquare className="w-3.5 h-3.5 text-rose-500" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-surface-300 hover:text-surface-500" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0" onClick={() => onItemClick(item.query)}>
                            {/* ── 封面卡片模式 ── */}
                            {item.cover ? (
                              <div className="flex gap-2.5">
                                <ProxyImage
                                  src={getProxyImageUrl(item.cover)}
                                  alt={item.title || item.query}
                                  className="w-14 h-20 sm:w-16 sm:h-22 object-cover rounded-md shrink-0 bg-surface-100"
                                />
                                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs sm:text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                                      {item.title || item.query}
                                    </span>
                                    {item.resultsCount !== undefined && item.resultsCount > 0 && (
                                      <span className="px-1.5 py-0.5 bg-surface-100 dark:bg-surface-800 rounded text-[10px] text-surface-500 shrink-0">
                                        {t('search:history.resultCount', { count: item.resultsCount })}
                                      </span>
                                    )}
                                  </div>
                                  {item.code && (
                                    <span className="text-[10px] xs:text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded w-fit">
                                      {item.code}
                                    </span>
                                  )}
                                  {(item.actors || item.duration || item.releaseDate || item.publisher) && (
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] xs:text-xs">
                                      {item.actors && (
                                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 truncate max-w-[120px]">
                                          <User className="w-2 h-2 shrink-0" />
                                          {item.actors}
                                        </span>
                                      )}
                                      {item.duration && (
                                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                          <Clock className="w-2 h-2" />{t('search:history.durationMinutes', { count: item.duration })}
                                        </span>
                                      )}
                                      {item.releaseDate && (
                                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                          <Calendar className="w-2 h-2" />{item.releaseDate}
                                        </span>
                                      )}
                                      {item.publisher && (
                                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 truncate max-w-[100px]">
                                          <Building2 className="w-2 h-2 shrink-0" />{item.publisher}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {item.tags && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {item.tags.split(',').slice(0, 4).map((tag, i) => (
                                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
                                          {tag.trim()}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              /* ── 纯文本列表模式（原有）── */
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Search className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-surface-400 shrink-0" />
                                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                      {item.code && (
                                        <span className="text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded flex-shrink-0">
                                          {item.code}
                                        </span>
                                      )}
                                      <span className="text-xs sm:text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                                        {item.title || item.query}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs text-surface-400 shrink-0">
                                    {item.resultsCount !== undefined && item.resultsCount > 0 && (
                                      <span className="px-1.5 py-0.5 bg-surface-100 dark:bg-surface-800 rounded text-xs">
                                        {t('search:history.resultCount', { count: item.resultsCount })}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {(item.subtitle || item.actors || item.duration || item.releaseDate || item.publisher || item.tags) && (
                                  <div className="space-y-1 pl-5">
                                    {item.subtitle && (
                                      <p className="text-xs text-surface-500 truncate">{item.subtitle}</p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                      {item.actors && (
                                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                          <User className="w-2.5 h-2.5" />
                                          {item.actors}
                                        </span>
                                      )}
                                      {item.duration && (
                                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                          <Clock className="w-2.5 h-2.5" />
                                          {t('search:history.durationMinutes', { count: item.duration })}
                                        </span>
                                      )}
                                      {item.releaseDate && (
                                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                          <Calendar className="w-2.5 h-2.5" />
                                          {item.releaseDate}
                                        </span>
                                      )}
                                      {item.publisher && (
                                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                          <Building2 className="w-2.5 h-2.5" />
                                          {item.publisher}
                                        </span>
                                      )}
                                    </div>
                                    {item.tags && (
                                      <div className="flex items-center gap-1 flex-wrap mt-1">
                                        {item.tags.split(',').slice(0, 4).map((tag, i) => (
                                          <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
                                            {tag.trim()}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-t border-surface-50 dark:border-surface-800/60 shrink-0">
              <button onClick={onClear} className="flex items-center gap-1.5 text-xs sm:text-sm text-error-500 hover:text-error-700 transition-colors">
                <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />{t('search:history.clearHistory')}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center" style={{ height: CONTENT_H + 24 }}>
            <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-surface-300 dark:text-surface-600 mb-2" />
            <p className="text-xs sm:text-sm text-surface-400">{t('search:history.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
};
