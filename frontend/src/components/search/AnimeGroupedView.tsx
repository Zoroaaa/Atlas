import React, { useState, useMemo } from 'react';
import {
  Star, Calendar, Tv, ExternalLink, Magnet,
  ChevronDown, ChevronRight, Heart, Users, Trophy,
  Film, Tag, ShieldCheck, Filter, ArrowUpDown,
} from 'lucide-react';
import type {
  AnimeEnrichedData,
  AnimeGroupedItem,
  AnimeUnifiedResource,
  BangumiSubject,
} from '@/types/search';
import type { FavoriteItem } from '@/types';
import { CopyButton } from '@/components/ui/CopyButton';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { convertToProxyUrl } from '@/services/proxy';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = {
  seedColor: (n: number) =>
    n >= 10 ? 'text-emerald-400' : n >= 1 ? 'text-yellow-400' : 'text-red-400',
  rating: (n: number) =>
    n >= 8 ? 'text-emerald-400' : n >= 6 ? 'text-yellow-400' : 'text-stone-400',
  sourceBadge: (s: string) => {
    const m: Record<string, string> = {
      nyaa: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
      mikan: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
      animetosho: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
      showrss: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
    };
    return m[s] ?? 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400';
  },
};

const typeColor = (t?: string | number) => {
  const m: Record<string | number, string> = {
    2: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    6: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    4: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    3: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    tv: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    movie: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  };
  return t != null ? (m[t] ?? 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400') : 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400';
};

const statusColor = (s?: string) => {
  switch (s) {
    case '连载中': return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
    case '已完结': return 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400';
    case '未开播': return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400';
    default: return '';
  }
};

const typeLabel = (t?: string | number) => {
  const m: Record<string | number, string> = { 2: 'TV', 6: '剧场版', 4: 'Web', 3: '音乐', tv: 'TV', movie: '剧场版', ova: 'OVA', web: 'Web', music: '音乐' };
  return t != null ? (m[t] ?? String(t)) : '';
};

// 提取清晰度
function extractQuality(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('2160') || t.includes('4k')) return '4K';
  if (t.includes('1080')) return '1080p';
  if (t.includes('720')) return '720p';
  if (t.includes('480')) return '480p';
  return '';
}

type SortKey = 'seeders' | 'date' | 'size';
type FilterSource = 'all' | 'nyaa' | 'mikan' | 'animetosho' | 'showrss';
type FilterQuality = 'all' | '4K' | '1080p' | '720p';

// ─── 统一资源卡片 ──────────────────────────────────────────────────

function UnifiedResourceCard({ item }: { item: AnimeUnifiedResource }) {
  const quality = extractQuality(item.title);
  return (
    <div className="grid grid-cols-[1fr_100px] gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-all group">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${fmt.sourceBadge(item.source)}`}>
            {item.sourceLabel}
          </span>
          {item.trusted && (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400" title="可信上传者" />
          )}
          {quality && (
            <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${
              quality === '4K' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
              : quality === '1080p' ? 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300'
              : 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400'
            }`}>{quality}</span>
          )}
          {item.group && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400 rounded truncate max-w-[80px]" title={`字幕组：${item.group}`}>
              {item.group}
            </span>
          )}
          <a
            href={item.magnet}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate"
            title={`点击唤起 BT 客户端下载：${item.title}`}
          >
            {item.title}
          </a>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-stone-500">
          {item.size && <span>{item.size}</span>}
          {item.date && <span>{item.date}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {item.source !== 'showrss' && item.source !== 'mikan' ? (
          <span className={`text-xs font-medium ${fmt.seedColor(item.seeders)} tabular-nums`}>
            {item.seeders}<span className="text-stone-400 mx-0.5">/</span><span className="text-red-400">{item.leechers}</span>
          </span>
        ) : item.source === 'mikan' ? (
          <span className="text-[10px] text-stone-400">字幕组资源</span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 dark:bg-stone-700/60 dark:text-stone-400">DHT</span>
        )}
        <CopyButton text={item.magnet} label="复制磁力链接" />
      </div>
    </div>
  );
}

// ─── 作品分组卡片 ──────────────────────────────────────────────────

function GroupedSubjectCard({
  group,
  isAuthenticated,
  isFavorited,
  onToggleFavorite,
  isProxyEnabled,
  defaultExpanded,
}: {
  group: AnimeGroupedItem;
  isAuthenticated: boolean;
  isFavorited: boolean;
  onToggleFavorite: (subject: BangumiSubject) => void;
  isProxyEnabled: boolean;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [sortBy, setSortBy] = useState<SortKey>('seeders');
  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterQuality, setFilterQuality] = useState<FilterQuality>('all');

  const { subject, resources } = group;

  // 筛选 + 排序
  const processedResources = useMemo(() => {
    let r = resources;
    if (filterSource !== 'all') r = r.filter(x => x.source === filterSource);
    if (filterQuality !== 'all') r = r.filter(x => extractQuality(x.title) === filterQuality);
    const sorted = [...r];
    switch (sortBy) {
      case 'seeders': sorted.sort((a, b) => b.seeders - a.seeders); break;
      case 'date': sorted.sort((a, b) => (b.date || '').localeCompare(a.date || '')); break;
      case 'size': sorted.sort((a, b) => parseFloat(b.size) - parseFloat(a.size)); break;
    }
    return sorted;
  }, [resources, sortBy, filterSource, filterQuality]);

  // 统计各源数量
  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = {};
    resources.forEach(r => { c[r.source] = (c[r.source] || 0) + 1; });
    return c;
  }, [resources]);

  // 统计各清晰度数量
  const qualityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    resources.forEach(r => {
      const q = extractQuality(r.title);
      if (q) c[q] = (c[q] || 0) + 1;
    });
    return c;
  }, [resources]);

  const RES_PAGE_SIZE = 8;
  const [resPage, setResPage] = useState(1);
  const resTotalPages = Math.max(1, Math.ceil(processedResources.length / RES_PAGE_SIZE));
  const pagedResources = processedResources.slice((resPage - 1) * RES_PAGE_SIZE, resPage * RES_PAGE_SIZE);

  // 切换筛选/排序时重置页码
  const changeFilter = <T,>(setter: (v: T) => void, val: T) => { setter(val); setResPage(1); };

  return (
    <div className={`rounded-2xl border transition-all ${
      expanded
        ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/5'
        : 'border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 hover:border-amber-500/30'
    }`}>
      {/* 作品头部（可点击展开） */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex gap-4 p-4 text-left"
      >
        {/* 封面 */}
        {subject.cover && (
          <div className="shrink-0">
            <img
              src={getProxyImageUrl(subject.cover)}
              alt={subject.nameCN || subject.name}
              className="w-16 sm:w-20 h-24 sm:h-28 object-cover rounded-lg bg-stone-200 dark:bg-stone-700 shadow-md"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* 标题行 */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                {subject.type && (
                  <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${typeColor(subject.type)}`}>
                    {typeLabel(subject.type)}
                  </span>
                )}
                {subject.status && (
                  <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${statusColor(subject.status)}`}>
                    {subject.status}
                  </span>
                )}
                {subject.rank && subject.rank > 0 && subject.rank <= 1000 && (
                  <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-amber-500 font-medium">
                    <Trophy className="w-3 h-3" />#{subject.rank}
                  </span>
                )}
                {/* 资源数量徽章 */}
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                  {resources.length} 资源
                </span>
              </div>
              <h3 className={`font-semibold text-sm leading-snug line-clamp-2 transition-colors ${
                expanded ? 'text-amber-600 dark:text-amber-400' : 'text-stone-900 dark:text-stone-100'
              }`}>
                {subject.nameCN || subject.name}
              </h3>
              {subject.nameCN && subject.name !== subject.nameCN && (
                <p className="text-xs text-stone-500 mt-0.5 truncate">{subject.name}</p>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {/* 收藏按钮（阻止冒泡） */}
              {isAuthenticated && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(subject); }}
                  className={`p-1.5 rounded-lg transition-all ${
                    isFavorited
                      ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
                      : 'text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                  }`}
                  title={isFavorited ? '取消收藏' : '收藏'}
                >
                  <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current' : ''}`} />
                </span>
              )}
              {/* 外链 */}
              <a
                href={isProxyEnabled ? convertToProxyUrl(subject.url) : subject.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {/* 展开/收起指示 */}
              <span className="p-1.5 text-stone-400">
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
            </div>
          </div>

          {/* 元信息行 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 mt-2">
            {subject.rating > 0 && (
              <span className={`flex items-center gap-1 ${fmt.rating(subject.rating)} font-medium`}>
                <Star className="w-3 h-3 fill-current" />
                {subject.rating.toFixed(1)}
                {subject.ratingCount ? <span className="text-[10px] text-stone-400 font-normal">({subject.ratingCount})</span> : null}
              </span>
            )}
            {subject.collection?.doing && subject.collection.doing > 0 && (
              <span className="flex items-center gap-0.5 text-[10px]" title="在看人数">
                <Users className="w-3 h-3 text-amber-400" />{subject.collection.doing}
              </span>
            )}
            {subject.eps > 0 && (
              <span className="flex items-center gap-1"><Tv className="w-3 h-3" />{subject.eps} 集</span>
            )}
            {subject.airDate && (
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{subject.airDate.slice(0, 7)}</span>
            )}
            {subject.studio && (
              <span className="text-[10px] text-amber-500 dark:text-amber-400 truncate">
                <Film className="w-3 h-3 inline mr-0.5" />{subject.studio}
              </span>
            )}
          </div>

          {/* 标签 */}
          {subject.tags && subject.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {subject.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] rounded-full bg-stone-100 text-stone-500 dark:bg-stone-700/50 dark:text-stone-400">
                  <Tag className="w-2.5 h-2.5" />{tag}
                </span>
              ))}
            </div>
          )}

          {/* 源分布迷你徽章（收起时显示） */}
          {!expanded && Object.keys(sourceCounts).length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {Object.entries(sourceCounts).map(([src, count]) => (
                <span key={src} className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${fmt.sourceBadge(src)}`}>
                  {count}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* 展开内容：简介 + 资源列表 + 筛选排序 */}
      {expanded && processedResources.length > 0 && (
        <div className="px-4 pb-4 border-t border-stone-100 dark:border-stone-800">
          {/* 简介 */}
          {subject.summary && (
            <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed py-3 line-clamp-3">
              {subject.summary}
            </p>
          )}
          {/* 筛选排序栏 */}
          <div className="flex flex-wrap items-center gap-2 py-3">
            <div className="flex items-center gap-1 text-[10px] text-stone-400">
              <Filter className="w-3 h-3" />来源
            </div>
            <div className="flex items-center gap-1">
              <FilterChip active={filterSource === 'all'} onClick={() => changeFilter(setFilterSource, 'all')}>全部</FilterChip>
              {Object.entries(sourceCounts).map(([src, count]) => (
                <FilterChip key={src} active={filterSource === src} onClick={() => changeFilter(setFilterSource, src as FilterSource)}>
                  {src} ({count})
                </FilterChip>
              ))}
            </div>

            {/* 清晰度筛选 */}
            {Object.keys(qualityCounts).length > 0 && (
              <>
                <div className="flex items-center gap-1 text-[10px] text-stone-400 ml-2">清晰度</div>
                <div className="flex items-center gap-1">
                  <FilterChip active={filterQuality === 'all'} onClick={() => changeFilter(setFilterQuality, 'all')}>全部</FilterChip>
                  {Object.entries(qualityCounts).map(([q, count]) => (
                    <FilterChip key={q} active={filterQuality === q} onClick={() => changeFilter(setFilterQuality, q as FilterQuality)}>
                      {q} ({count})
                    </FilterChip>
                  ))}
                </div>
              </>
            )}

            {/* 排序 */}
            <div className="flex items-center gap-1 text-[10px] text-stone-400 ml-auto">
              <ArrowUpDown className="w-3 h-3" />排序
            </div>
            <div className="flex items-center gap-1">
              <FilterChip active={sortBy === 'seeders'} onClick={() => changeFilter(setSortBy, 'seeders')}>做种</FilterChip>
              <FilterChip active={sortBy === 'date'} onClick={() => changeFilter(setSortBy, 'date')}>日期</FilterChip>
              <FilterChip active={sortBy === 'size'} onClick={() => changeFilter(setSortBy, 'size')}>大小</FilterChip>
            </div>
          </div>

          {/* 资源列表 */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_100px] gap-2 px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide border-b border-stone-100 dark:border-stone-800">
              <span>标题 / 大小 / 日期</span>
              <span className="text-right">状态 · 操作</span>
            </div>
            {pagedResources.map((item, i) => (
              <UnifiedResourceCard key={item.magnet || i} item={item} />
            ))}
          </div>

          {/* 分页 */}
          {processedResources.length > RES_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                disabled={resPage <= 1}
                onClick={() => setResPage(p => p - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
              >
                上一页
              </button>
              <span className="text-xs text-stone-500 px-2">
                {resPage} / {resTotalPages}
              </span>
              <button
                disabled={resPage >= resTotalPages}
                onClick={() => setResPage(p => p + 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 筛选小芯片
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] rounded-full transition-all ${
        active
          ? 'bg-amber-500 text-white font-medium'
          : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700'
      }`}
    >
      {children}
    </button>
  );
}

// ─── 未归组资源折叠区 ──────────────────────────────────────────────

function UngroupedResourcesSection({ resources }: { resources: AnimeUnifiedResource[] }) {
  const [expanded, setExpanded] = useState(false);
  if (resources.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700/60 flex items-center justify-center">
            <Magnet className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <span className="font-semibold text-stone-700 dark:text-stone-300 text-sm">未匹配资源</span>
          <span className="px-2 py-0.5 text-xs font-bold bg-stone-100 dark:bg-stone-700/60 text-stone-500 dark:text-stone-400 rounded-full">
            {resources.length} 条
          </span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-stone-100 dark:border-stone-800 pt-2">
          <p className="text-[10px] text-stone-400 mb-2">以下资源未能匹配到具体作品，可能为合集、OST 或其他关联资源</p>
          <div className="space-y-1.5">
            {resources.map((item, i) => (
              <UnifiedResourceCard key={item.magnet || i} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

interface AnimeGroupedViewProps {
  data: AnimeEnrichedData;
  isAuthenticated?: boolean;
  isProxyEnabled?: boolean;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (subject: BangumiSubject) => void;
}

export const AnimeGroupedView: React.FC<AnimeGroupedViewProps> = ({
  data,
  isAuthenticated = false,
  isProxyEnabled = false,
  favorites = [],
  onToggleFavorite,
}) => {
  const grouped = data.grouped;
  if (!grouped) return null;

  const isBgmFavorited = (url: string) => favorites.some(f => f.url === url);

  // 有资源的分组 + 无资源的分组
  const withResources = grouped.groups.filter(g => g.resources.length > 0);
  const withoutResources = grouped.groups.filter(g => g.resources.length === 0);

  return (
    <div className="space-y-4">
      {/* 统计栏 */}
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <span className="px-1.5 py-0.5 rounded bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 font-medium">
          作品聚合视图
        </span>
        <span>{withResources.length} 部作品有资源</span>
        {grouped.ungrouped.length > 0 && (
          <>
            <span>·</span>
            <span>{grouped.ungrouped.length} 条未匹配资源</span>
          </>
        )}
        {withoutResources.length > 0 && (
          <>
            <span>·</span>
            <span>{withoutResources.length} 部作品暂无资源</span>
          </>
        )}
      </div>

      {/* 有资源的作品（默认展开第一个） */}
      {withResources.length > 0 && (
        <div className="space-y-3">
          {withResources.map((group, i) => (
            <GroupedSubjectCard
              key={group.subject.id}
              group={group}
              isAuthenticated={isAuthenticated}
              isFavorited={isBgmFavorited(group.subject.url)}
              onToggleFavorite={(s) => onToggleFavorite?.(s)}
              isProxyEnabled={isProxyEnabled}
              defaultExpanded={i === 0}
            />
          ))}
        </div>
      )}

      {/* 未归组资源 */}
      <UngroupedResourcesSection resources={grouped.ungrouped} />

      {/* 无资源的作品（折叠展示） */}
      {withoutResources.length > 0 && (
        <div className="rounded-2xl border border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700/60 flex items-center justify-center">
                <Star className="w-3.5 h-3.5 text-stone-400" />
              </div>
              <span className="font-semibold text-stone-700 dark:text-stone-300 text-sm">暂无资源的作品</span>
              <span className="px-2 py-0.5 text-xs font-bold bg-stone-100 dark:bg-stone-700/60 text-stone-500 dark:text-stone-400 rounded-full">
                {withoutResources.length} 部
              </span>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {withoutResources.map(group => (
              <a
                key={group.subject.id}
                href={isProxyEnabled ? convertToProxyUrl(group.subject.url) : group.subject.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 p-3 rounded-xl border border-stone-200 dark:border-stone-700/50 hover:border-amber-500/30 hover:bg-stone-50 dark:hover:bg-stone-800/70 transition-all"
              >
                {group.subject.cover && (
                  <img
                    src={getProxyImageUrl(group.subject.cover)}
                    alt={group.subject.nameCN || group.subject.name}
                    className="w-12 h-16 object-cover rounded-lg bg-stone-200 dark:bg-stone-700 shrink-0"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-xs text-stone-800 dark:text-stone-100 truncate">
                    {group.subject.nameCN || group.subject.name}
                  </p>
                  {group.subject.rating > 0 && (
                    <p className={`text-[10px] mt-1 ${fmt.rating(group.subject.rating)}`}>
                      <Star className="w-2.5 h-2.5 inline fill-current" /> {group.subject.rating.toFixed(1)}
                    </p>
                  )}
                  {isProxyEnabled && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 mt-1">
                      <ShieldCheck className="w-2.5 h-2.5" />代理可访问
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 完全空状态 */}
      {withResources.length === 0 && grouped.ungrouped.length === 0 && withoutResources.length === 0 && (
        <div className="text-center py-16">
          <Magnet className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <p className="text-sm text-stone-500">未找到相关结果</p>
          <p className="text-xs text-stone-400 mt-1">尝试更换关键词</p>
        </div>
      )}
    </div>
  );
};
