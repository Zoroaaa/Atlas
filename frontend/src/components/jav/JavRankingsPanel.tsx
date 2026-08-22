import React, { useState } from 'react';
import {
  Film, Eye, Tag, Users, Tv, FileText,
  RefreshCw, Loader2, AlertCircle, Clock,
  ChevronDown, ChevronRight, Search, TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useJavRankings } from '@/hooks';
import type { JavItem, GroupRanking } from '@/types';

interface JavRankingsPanelProps {
  onCodeClick: (code: string) => void;
}

// ─── 高度常量（与搜索历史、收藏面板共享同一套数值）─────────────────
// header: py-4(32px) + icon h-8(32px) = 64px
// tab栏: pt-3(12) + btn(28) + pb-2(8) + border(1) = 49px → 取52px
// 内容区上下 padding: p-3*2 = 24px
// 每行番号高度: py-1.5(12) + text-xs(20) = 32px，行间 gap-2(8px)
// 5行: 5*32 + 4*8 = 192px
// 底部提示: py-2.5(10+10) + text(14) = 34px
// JAV总高 = 64 + 52 + 24 + 192 + 34 = 366px
export const JAV_PANEL_HEIGHT = 366;
export const JAV_HEADER_HEIGHT = 64;

// 内容区精确高度 = 总高 - header - tab栏 - padding - footer
const CONTENT_H = JAV_PANEL_HEIGHT - JAV_HEADER_HEIGHT - 52 - 24 - 34; // = 192px

function formatAge(t: TFunction, ms: number | null): string {
  if (ms === null) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t('jav:rankings.ageSeconds', { count: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t('jav:rankings.ageMinutes', { count: min });
  return t('jav:rankings.ageHours', { count: Math.floor(min / 60) });
}

const CODE_COLORS = [
  'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 border-primary-200 dark:border-primary-800',
  'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
];

const CodeGrid: React.FC<{ items: JavItem[]; onCodeClick: (c: string) => void; emptyText?: string }> = ({
  items, onCodeClick, emptyText,
}) => {
  const { t } = useTranslation(['jav']);
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-400">
        <Search className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">{emptyText ?? t('jav:rankings.emptyDefault')}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 content-start">
      {items.map((item, i) => (
        <button
          key={`${item.code}-${i}`}
          onClick={() => onCodeClick(item.code)}
          className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all active:scale-[0.97] hover:shadow-sm ${CODE_COLORS[i % CODE_COLORS.length]}`}
          title={item.title}
        >
          <span className="text-[10px] font-bold opacity-50 shrink-0 w-4 text-right">{i + 1}</span>
          <span className="text-xs font-semibold truncate">{item.code}</span>
        </button>
      ))}
    </div>
  );
};

const GroupTabs: React.FC<{
  groups: GroupRanking[];
  onCodeClick: (c: string) => void;
  emptyText?: string;
  emptyIcon?: React.ElementType;
}> = ({ groups, onCodeClick, emptyText, emptyIcon: Icon = Tag }) => {
  const { t } = useTranslation(['jav']);
  const [activeKey, setActiveKey] = useState<string>(groups[0]?.key ?? '');
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-400">
        <Icon className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">{emptyText ?? t('jav:rankings.emptyLoading')}</p>
      </div>
    );
  }
  const current = groups.find(g => g.key === activeKey) ?? groups[0];
  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex flex-wrap gap-1 shrink-0">
        {groups.map(g => (
          <button
            key={g.key}
            onClick={() => setActiveKey(g.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              activeKey === g.key
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
            }`}
          >
            {g.name}
            <span className="ml-1 opacity-50 text-[10px]">{g.items.length}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <CodeGrid items={current.items} onCodeClick={onCodeClick} emptyText={t('jav:rankings.emptyGroup')} />
      </div>
    </div>
  );
};

type TabId = 'censored' | 'uncensored' | 'hd' | 'subtitle' | 'genres' | 'actresses';
interface TabDef { id: TabId; labelKey: string; shortKey: string; icon: React.ElementType; color: string; bg: string; }
const TABS: TabDef[] = [
  { id: 'censored',   labelKey: 'jav:rankings.tabCensored',   shortKey: 'jav:rankings.shortCensored',   icon: Film,     color: 'text-rose-600 dark:text-rose-400',      bg: 'bg-rose-100 dark:bg-rose-900/30' },
  { id: 'uncensored', labelKey: 'jav:rankings.tabUncensored', shortKey: 'jav:rankings.shortUncensored', icon: Eye,      color: 'text-rose-600 dark:text-rose-400',        bg: 'bg-rose-100 dark:bg-rose-900/30' },
  { id: 'hd',         labelKey: 'jav:rankings.tabHd',         shortKey: 'jav:rankings.shortHd',         icon: Tv,       color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-100 dark:bg-sky-900/30' },
  { id: 'subtitle',   labelKey: 'jav:rankings.tabSubtitle',   shortKey: 'jav:rankings.shortSubtitle',   icon: FileText, color: 'text-teal-600 dark:text-teal-400',       bg: 'bg-teal-100 dark:bg-teal-900/30' },
  { id: 'genres',     labelKey: 'jav:rankings.tabGenres',     shortKey: 'jav:rankings.shortGenres',     icon: Tag,      color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-900/30' },
  { id: 'actresses',  labelKey: 'jav:rankings.tabActresses',  shortKey: 'jav:rankings.shortActresses',  icon: Users,    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
];

export const JavRankingsPanel: React.FC<JavRankingsPanelProps> = ({ onCodeClick }) => {
  const { t } = useTranslation(['jav']);
  const { data, isLoading, error, fromCache, cacheAge, refresh } = useJavRankings();
  const [activeTab, setActiveTab] = useState<TabId>('censored');
  const [expanded, setExpanded] = useState(true);
  const tabCfg = TABS.find(tab => tab.id === activeTab)!;

  const activeCount = (() => {
    if (!data) return 0;
    if (activeTab === 'genres')    return data.genres.reduce((s, g) => s + g.items.length, 0);
    if (activeTab === 'actresses') return data.actresses.reduce((s, a) => s + a.items.length, 0);
    return (data[activeTab as keyof typeof data] as JavItem[])?.length ?? 0;
  })();

  return (
    // 固定总高度：展开时 JAV_PANEL_HEIGHT，收缩时 JAV_HEADER_HEIGHT
    <div
      className="collapsible-section animate-fade-in transition-all duration-300 overflow-hidden shrink-0"
      style={{ height: expanded ? JAV_PANEL_HEIGHT : JAV_HEADER_HEIGHT, maxHeight: expanded ? '60vh' : undefined }}
    >
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="collapsible-header" style={{ height: JAV_HEADER_HEIGHT }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${tabCfg.bg} flex items-center justify-center`}>
            <TrendingUp className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${tabCfg.color}`} />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">{t('jav:rankings.title')}</span>
          {data && activeCount > 0 && (
            <span className={`px-2 py-0.5 text-xs font-semibold ${tabCfg.bg} ${tabCfg.color} rounded-full`}>
              {activeCount}
            </span>
          )}
          {data?.sources && data.sources.length > 0 && (
            <span className="hidden sm:inline text-[10px] text-surface-400 dark:text-surface-500">
              {data.sources.join(' · ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {fromCache && cacheAge !== null && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-surface-400 shrink-0">
              <Clock className="w-3 h-3" />{formatAge(t, cacheAge)}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); refresh(); }}
            disabled={isLoading}
            className="p-1 sm:p-1.5 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all disabled:opacity-40"
            title={t('jav:rankings.refresh')}
          >
            <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-surface-400" />
            : <ChevronRight className="w-4 h-4 text-surface-400" />}
        </div>
      </button>

      {/* 内容（只在展开时渲染，transition 由外层 height 控制） */}
      <div className="flex flex-col" style={{ height: JAV_PANEL_HEIGHT - JAV_HEADER_HEIGHT }}>
        {/* Tab 栏 */}
        <div className="px-3 sm:px-4 pt-3 pb-2 border-b border-surface-100 dark:border-surface-800 shrink-0">
          <div className="flex gap-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? `${tab.bg} ${tab.color}`
                      : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                  }`}
                >
                  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{t(tab.labelKey)}</span>
                  <span className="sm:hidden">{t(tab.shortKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 内容区：固定高度 + 内部滚动 */}
        <div className="p-3 sm:p-4 flex-1 min-h-0 overflow-hidden" style={{ height: CONTENT_H }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-surface-400">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              <p className="text-xs">{t('jav:rankings.loading')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <AlertCircle className="w-6 h-6 text-error-400" />
              <p className="text-xs text-error-500">{error}</p>
              <button onClick={refresh} className="text-xs text-primary-500 underline">{t('jav:rankings.retry')}</button>
            </div>
          ) : activeTab === 'genres' ? (
            <GroupTabs groups={data?.genres ?? []} onCodeClick={onCodeClick} emptyText={t('jav:rankings.genresError')} emptyIcon={Tag} />
          ) : activeTab === 'actresses' ? (
            <GroupTabs groups={data?.actresses ?? []} onCodeClick={onCodeClick} emptyText={t('jav:rankings.actressesError')} emptyIcon={Users} />
          ) : activeTab === 'hd' ? (
            <div className="h-full overflow-y-auto scrollbar-thin">
              <CodeGrid items={data?.hd ?? []} onCodeClick={onCodeClick} emptyText={t('jav:rankings.hdEmpty')} />
            </div>
          ) : activeTab === 'subtitle' ? (
            <div className="h-full overflow-y-auto scrollbar-thin">
              <CodeGrid items={data?.subtitle ?? []} onCodeClick={onCodeClick} emptyText={t('jav:rankings.subtitleEmpty')} />
            </div>
          ) : (
            <div className="h-full overflow-y-auto scrollbar-thin">
              <CodeGrid
                items={(data?.[activeTab as 'censored' | 'uncensored'] as JavItem[]) ?? []}
                onCodeClick={onCodeClick}
                emptyText={t('jav:rankings.censoredEmpty')}
              />
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-3 sm:px-4 py-2.5 border-t border-surface-50 dark:border-surface-800/60 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-surface-400 dark:text-surface-500">
            {t('jav:rankings.footerHint')}
            {fromCache && cacheAge !== null && (
              <span className="ml-2 sm:hidden">{t('jav:rankings.cacheAgePrefix', { age: formatAge(t, cacheAge) })}</span>
            )}
          </p>
          {(activeTab === 'genres' || activeTab === 'actresses') && (
            <p className="text-[10px] text-surface-400 dark:text-surface-500">{t('jav:rankings.reshuffleHint')}</p>
          )}
        </div>
      </div>
    </div>
  );
};
