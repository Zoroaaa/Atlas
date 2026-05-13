import React, { useState } from 'react';
import {
  Film, Eye, Tag, Users, Tv, FileText,
  RefreshCw, Loader2, AlertCircle, Clock,
  ChevronDown, ChevronRight, Search, TrendingUp, Heart,
} from 'lucide-react';
import { useJavRankings } from '@/hooks';
import type { JavItem, GroupRanking } from '@/types';

interface JavRankingsPanelProps {
  onCodeClick: (code: string) => void;
  onFavorite?: (item: { code: string; title: string; cover?: string; date?: string; actress?: string }) => void;
  favoritedCodes?: Set<string>;
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

function formatAge(ms: number | null): string {
  if (ms === null) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  return `${Math.floor(min / 60)}小时前`;
}

const CODE_COLORS = [
  'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 border-primary-200 dark:border-primary-800',
  'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800',
];

const CodeGrid: React.FC<{ items: JavItem[]; onCodeClick: (c: string) => void; emptyText?: string; onFavorite?: (item: { code: string; title: string; cover?: string; date?: string; actress?: string }) => void; favoritedCodes?: Set<string> }> = ({
  items, onCodeClick, emptyText = '暂无数据', onFavorite, favoritedCodes,
}) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-400">
        <Search className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 content-start">
      {items.map((item, i) => {
        const isFav = favoritedCodes?.has(item.code) ?? false;
        return (
          <div key={`${item.code}-${i}`} className="relative group/item">
            <button
              onClick={() => onCodeClick(item.code)}
              className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-all active:scale-[0.97] hover:shadow-sm ${CODE_COLORS[i % CODE_COLORS.length]}`}
              title={item.title}
            >
              <span className="text-[10px] font-bold opacity-50 shrink-0 w-4 text-right">{i + 1}</span>
              <span className="text-xs font-semibold truncate">{item.code}</span>
            </button>
            {onFavorite && (
              <button
                onClick={(e) => { e.stopPropagation(); onFavorite({ code: item.code, title: item.title, cover: item.cover, date: item.date, actress: item.actress }); }}
                className={`absolute top-0.5 right-0.5 p-0.5 rounded-md transition-all opacity-0 group-hover/item:opacity-100 ${isFav ? 'text-rose-500 opacity-100' : 'text-surface-400 hover:text-rose-500'}`}
                title={isFav ? '取消收藏' : '收藏'}
              >
                <Heart className={`w-3 h-3 ${isFav ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

const GroupTabs: React.FC<{
  groups: GroupRanking[];
  onCodeClick: (c: string) => void;
  emptyText?: string;
  emptyIcon?: React.ElementType;
  onFavorite?: (item: { code: string; title: string; cover?: string; date?: string; actress?: string }) => void;
  favoritedCodes?: Set<string>;
}> = ({ groups, onCodeClick, emptyText = '数据加载中，请稍后刷新', emptyIcon: Icon = Tag, onFavorite, favoritedCodes }) => {
  const [activeKey, setActiveKey] = useState<string>(groups[0]?.key ?? '');
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-surface-400">
        <Icon className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">{emptyText}</p>
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
        <CodeGrid items={current.items} onCodeClick={onCodeClick} emptyText="该分组暂无数据" onFavorite={onFavorite} favoritedCodes={favoritedCodes} />
      </div>
    </div>
  );
};

type TabId = 'censored' | 'uncensored' | 'hd' | 'subtitle' | 'genres' | 'actresses';
interface TabDef { id: TabId; label: string; short: string; icon: React.ElementType; color: string; bg: string; }
const TABS: TabDef[] = [
  { id: 'censored',   label: '有码精选', short: '有码', icon: Film,     color: 'text-rose-600 dark:text-rose-400',      bg: 'bg-rose-100 dark:bg-rose-900/30' },
  { id: 'uncensored', label: '无码精选', short: '无码', icon: Eye,      color: 'text-purple-600 dark:text-purple-400',   bg: 'bg-purple-100 dark:bg-purple-900/30' },
  { id: 'hd',         label: '高清专区', short: '高清', icon: Tv,       color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-100 dark:bg-sky-900/30' },
  { id: 'subtitle',   label: '字幕专区', short: '字幕', icon: FileText, color: 'text-teal-600 dark:text-teal-400',       bg: 'bg-teal-100 dark:bg-teal-900/30' },
  { id: 'genres',     label: '随机类别', short: '类别', icon: Tag,      color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-900/30' },
  { id: 'actresses',  label: '随机女优', short: '女优', icon: Users,    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
];

export const JavRankingsPanel: React.FC<JavRankingsPanelProps> = ({ onCodeClick, onFavorite, favoritedCodes }) => {
  const { data, isLoading, error, fromCache, cacheAge, refresh } = useJavRankings();
  const [activeTab, setActiveTab] = useState<TabId>('censored');
  const [expanded, setExpanded] = useState(true);
  const tabCfg = TABS.find(t => t.id === activeTab)!;

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
      style={{ height: expanded ? JAV_PANEL_HEIGHT : JAV_HEADER_HEIGHT }}
    >
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="collapsible-header" style={{ height: JAV_HEADER_HEIGHT }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${tabCfg.bg} flex items-center justify-center`}>
            <TrendingUp className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${tabCfg.color}`} />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">JAV 榜单</span>
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
              <Clock className="w-3 h-3" />{formatAge(cacheAge)}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); refresh(); }}
            disabled={isLoading}
            className="p-1 sm:p-1.5 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all disabled:opacity-40"
            title="刷新榜单"
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
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.short}</span>
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
              <p className="text-xs">正在获取榜单数据...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <AlertCircle className="w-6 h-6 text-error-400" />
              <p className="text-xs text-error-500">{error}</p>
              <button onClick={refresh} className="text-xs text-primary-500 underline">点击重试</button>
            </div>
          ) : activeTab === 'genres' ? (
            <GroupTabs groups={data?.genres ?? []} onCodeClick={onCodeClick} emptyText="类别数据加载失败" emptyIcon={Tag} onFavorite={onFavorite} favoritedCodes={favoritedCodes} />
          ) : activeTab === 'actresses' ? (
            <GroupTabs groups={data?.actresses ?? []} onCodeClick={onCodeClick} emptyText="女优数据加载失败" emptyIcon={Users} onFavorite={onFavorite} favoritedCodes={favoritedCodes} />
          ) : activeTab === 'hd' ? (
            <div className="h-full overflow-y-auto scrollbar-thin">
              <CodeGrid items={data?.hd ?? []} onCodeClick={onCodeClick} emptyText="高清数据暂无，点击刷新重试" onFavorite={onFavorite} favoritedCodes={favoritedCodes} />
            </div>
          ) : activeTab === 'subtitle' ? (
            <div className="h-full overflow-y-auto scrollbar-thin">
              <CodeGrid items={data?.subtitle ?? []} onCodeClick={onCodeClick} emptyText="字幕数据暂无，点击刷新重试" onFavorite={onFavorite} favoritedCodes={favoritedCodes} />
            </div>
          ) : (
            <div className="h-full overflow-y-auto scrollbar-thin">
              <CodeGrid
                items={(data?.[activeTab as 'censored' | 'uncensored'] as JavItem[]) ?? []}
                onCodeClick={onCodeClick}
                emptyText="暂无数据，点击右上角刷新按钮重试"
                onFavorite={onFavorite}
                favoritedCodes={favoritedCodes}
              />
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-3 sm:px-4 py-2.5 border-t border-surface-50 dark:border-surface-800/60 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-surface-400 dark:text-surface-500">
            💡 点击番号快速填入搜索框
            {fromCache && cacheAge !== null && (
              <span className="ml-2 sm:hidden">· 缓存 {formatAge(cacheAge)}</span>
            )}
          </p>
          {(activeTab === 'genres' || activeTab === 'actresses') && (
            <p className="text-[10px] text-surface-400 dark:text-surface-500">🔀 刷新将重新随机</p>
          )}
        </div>
      </div>
    </div>
  );
};
