import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, RefreshCw, Loader2, AlertCircle,
  ChevronDown, ChevronRight, Film,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActresses, useStarDetail } from '@/hooks';
import type { ActressEntry, JavItem } from '@/types/jav';
import { Modal } from '@/components/ui';

// ── 高度常量 ─────────────────────────────────────────────────────────
// header: py-4(32px) + icon h-8(32px) = 64px
// 内容区 padding: p-3*2 = 24px
// 每行女优名: py-1.5(12) + text-xs(20) = 32px，行间 gap-2(8px)
// 5行: 5*32 + 4*8 = 192px
// 底部提示: py-2.5(10+10) + text(14) = 34px
// 总高 = 64 + 24 + 192 + 34 = 314px
export const ACTRESSES_PANEL_HEIGHT = 314;
export const ACTRESSES_HEADER_HEIGHT = 64;

const CONTENT_H = ACTRESSES_PANEL_HEIGHT - ACTRESSES_HEADER_HEIGHT - 24 - 34; // = 192px

const NAME_COLORS = [
  'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800',
];

// ─── 番号网格（复用 JavRankingsPanel 的 CodeGrid 逻辑）─────────────────
const CodeGrid: React.FC<{ items: JavItem[]; onCodeClick: (c: string) => void }> = ({
  items, onCodeClick,
}) => {
  const { t } = useTranslation(['jav']);
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-400">
        <Film className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">{t('jav:actresses.noCodeData')}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
      {items.map((item, i) => (
        <button
          key={`${item.code}-${i}`}
          onClick={() => onCodeClick(item.code)}
          className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all active:scale-[0.97] hover:shadow-sm ${NAME_COLORS[i % NAME_COLORS.length]}`}
          title={item.title}
        >
          <span className="text-[10px] font-bold opacity-50 shrink-0 w-4 text-right">{i + 1}</span>
          <span className="text-xs font-semibold truncate">{item.code}</span>
        </button>
      ))}
    </div>
  );
};

// ─── 女优详情弹窗 ──────────────────────────────────────────────────────

interface StarModalProps {
  actress: ActressEntry;
  onClose: () => void;
  onCodeClick: (code: string) => void;
}

const StarModal: React.FC<StarModalProps> = ({ actress, onClose, onCodeClick }) => {
  const { t } = useTranslation(['jav']);
  const { detail, status, fetch } = useStarDetail();

  useEffect(() => {
    fetch(actress.key);
  }, [actress.key, fetch]);

  return (
    <Modal isOpen={true} onClose={onClose} title={t('jav:actresses.worksTitle', { name: actress.name })} size="lg">
      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-surface-400">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          <p className="text-xs">{t('jav:actresses.loadingWorks')}</p>
        </div>
      )}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertCircle className="w-6 h-6 text-error-400" />
          <p className="text-xs text-error-500">{t('jav:actresses.fetchFailed')}</p>
          <button onClick={() => fetch(actress.key)} className="text-xs text-primary-500 underline">{t('jav:actresses.retry')}</button>
        </div>
      )}
      {status === 'success' && detail && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-semibold text-surface-800 dark:text-surface-200">{detail.name}</span>
            <span className="px-2 py-0.5 text-xs font-semibold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full">
              {t('jav:actresses.worksCount', { count: detail.items.length })}
            </span>
          </div>
          <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
            <CodeGrid items={detail.items} onCodeClick={(code) => { onClose(); onCodeClick(code); }} />
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── 主组件 ────────────────────────────────────────────────────────────

interface ActressesPanelProps {
  onCodeClick: (code: string) => void;
}

export const ActressesPanel: React.FC<ActressesPanelProps> = ({ onCodeClick }) => {
  const { t } = useTranslation(['jav']);
  const { data, isLoading, error, refresh } = useActresses();
  const [expanded, setExpanded] = useState(true);
  const [selectedActress, setSelectedActress] = useState<ActressEntry | null>(null);

  const handleCodeClick = useCallback((code: string) => {
    setSelectedActress(null);
    onCodeClick(code);
  }, [onCodeClick]);

  return (
    <>
      <div
        className="collapsible-section animate-fade-in transition-all duration-300 overflow-hidden shrink-0"
        style={{ height: expanded ? ACTRESSES_PANEL_HEIGHT : ACTRESSES_HEADER_HEIGHT }}
      >
        {/* Header */}
        <button onClick={() => setExpanded(!expanded)} className="collapsible-header" style={{ height: ACTRESSES_HEADER_HEIGHT }}>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 dark:text-rose-400" />
            </div>
            <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">{t('jav:actresses.title')}</span>
            {data.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full">
                {data.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); refresh(); }}
              disabled={isLoading}
              className="p-1 sm:p-1.5 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all disabled:opacity-40"
              title={t('jav:actresses.refresh')}
            >
              <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            {expanded
              ? <ChevronDown className="w-4 h-4 text-surface-400" />
              : <ChevronRight className="w-4 h-4 text-surface-400" />}
          </div>
        </button>

        {/* 内容 */}
        <div className="flex flex-col" style={{ height: ACTRESSES_PANEL_HEIGHT - ACTRESSES_HEADER_HEIGHT }}>
          <div className="p-3 sm:p-4 flex-1 min-h-0 overflow-hidden" style={{ height: CONTENT_H }}>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-surface-400">
                <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                <p className="text-xs">{t('jav:actresses.loadingActresses')}</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <AlertCircle className="w-6 h-6 text-error-400" />
                <p className="text-xs text-error-500">{error}</p>
                <button onClick={refresh} className="text-xs text-primary-500 underline">{t('jav:actresses.retry')}</button>
              </div>
            ) : (
              <div className="h-full overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 content-start">
                  {data.map((actress, i) => (
                    <button
                      key={actress.key}
                      onClick={() => setSelectedActress(actress)}
                      className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all active:scale-[0.97] hover:shadow-sm ${NAME_COLORS[i % NAME_COLORS.length]}`}
                      title={t('jav:actresses.viewWorksTitle', { name: actress.name })}
                    >
                      <span className="text-[10px] font-bold opacity-50 shrink-0 w-4 text-right">{i + 1}</span>
                      <span className="text-xs font-semibold truncate">{actress.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 底部提示 */}
          <div className="px-3 sm:px-4 py-2.5 border-t border-surface-50 dark:border-surface-800/60 shrink-0">
            <p className="text-[10px] text-surface-400 dark:text-surface-500">
              {t('jav:actresses.footerHint')}
            </p>
          </div>
        </div>
      </div>

      {/* 女优详情弹窗 */}
      {selectedActress && (
        <StarModal
          actress={selectedActress}
          onClose={() => setSelectedActress(null)}
          onCodeClick={handleCodeClick}
        />
      )}
    </>
  );
};
