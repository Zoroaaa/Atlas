import React from 'react';
import { Clock, Search, Trash2, ChevronDown, ChevronRight, Calendar, User, Building2 } from 'lucide-react';
import { Loading } from '@/components/ui';
import type { SearchHistoryItem } from '@/types';

// ─── 高度常量（与 JavRankingsPanel 共享逻辑）────────────────────────
// header: 64px（同 JAV 面板）
// 内容区: p-3(12)*2 + 列表项(每项约80-100px)
// footer: 约 36px
// 总计 = 64 + 内容 + 36
export const HIST_PANEL_HEIGHT = 400;
export const HIST_HEADER_HEIGHT = 64;

const CONTENT_H = HIST_PANEL_HEIGHT - HIST_HEADER_HEIGHT - 36;

interface SearchHistoryPanelProps {
  history: SearchHistoryItem[];
  isLoading: boolean;
  show: boolean;
  onToggle: () => void;
  onItemClick: (query: string) => void;
  onClear: () => void;
}

export const SearchHistoryPanel: React.FC<SearchHistoryPanelProps> = ({
  history, isLoading, show, onToggle, onItemClick, onClear,
}) => (
  <div
    className="collapsible-section animate-fade-in transition-all duration-300 overflow-hidden shrink-0"
    style={{ animationDelay: '100ms', height: show ? HIST_PANEL_HEIGHT : HIST_HEADER_HEIGHT }}
  >
    {/* Header */}
    <button onClick={onToggle} className="collapsible-header" style={{ height: HIST_HEADER_HEIGHT }}>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">搜索历史</span>
        {history.length > 0 && (
          <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
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
          {/* 历史列表：固定内容高度，内部滚动 */}
          <div className="p-3 sm:p-4 overflow-y-auto scrollbar-thin" style={{ height: CONTENT_H + 24 }}>
            <div className="space-y-1.5 sm:space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-1.5 p-2 sm:p-2.5 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/40 cursor-pointer transition-all border border-surface-100 dark:border-surface-800 active:scale-[0.98]"
                  onClick={() => onItemClick(item.query)}
                >
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
                          {item.resultsCount}条
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
                            {item.duration}分钟
                          </span>
                        )}
                        {item.releaseDate && (
                          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Calendar className="w-2.5 h-2.5" />
                            {item.releaseDate}
                          </span>
                        )}
                        {item.publisher && (
                          <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
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
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-t border-surface-50 dark:border-surface-800/60 shrink-0">
            <button onClick={onClear} className="flex items-center gap-1.5 text-xs sm:text-sm text-error-500 hover:text-error-700 transition-colors">
              <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />清空历史
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center" style={{ height: CONTENT_H + 24 }}>
          <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-surface-300 dark:text-surface-600 mb-2" />
          <p className="text-xs sm:text-sm text-surface-400">暂无搜索历史</p>
        </div>
      )}
    </div>
  </div>
);
