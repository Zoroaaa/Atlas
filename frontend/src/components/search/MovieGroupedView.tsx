import React, { useState, useMemo } from 'react';
import {
  Star, Film, Tv2, Calendar, ExternalLink, Magnet,
  ChevronDown, ChevronRight, Heart,
  Filter, ArrowUpDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  MovieEnrichedData,
  TMDBResult,
  ResourceItem,
} from '@/types/search';
import type { FavoriteItem } from '@/types';
import { CopyButton } from '@/components/ui/CopyButton';

// ─── helpers ────────────────────────────────────────────────────────────────

const ratingColor = (n: number) =>
  n >= 8 ? 'text-emerald-400' : n >= 6 ? 'text-yellow-400' : 'text-stone-400';

const mediaTypeLabel = (t: TFunction, m: 'movie' | 'tv') => m === 'movie' ? t('search:movie.type.movie') : t('search:movie.type.tv');

function extractQuality(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('2160') || lower.includes('4k')) return '4K';
  if (lower.includes('1080')) return '1080p';
  if (lower.includes('720')) return '720p';
  return '';
}

type SortKey = 'date' | 'size';
type FilterQuality = 'all' | '4K' | '1080p' | '720p';

// ─── 资源卡片 ──────────────────────────────────────────────────

function MovieResourceCard({ item }: { item: ResourceItem }) {
  const { t } = useTranslation(['search']);
  const quality = extractQuality(item.title);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-all group">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* 来源徽章 */}
          {item.source === 'yts' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded">YTS</span>
          )}
          {item.source === 'eztv' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 rounded">EZTV</span>
          )}
          {item.source === 'tpb' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-stone-100 text-stone-600 dark:bg-stone-800/60 dark:text-stone-400 rounded">TPB</span>
          )}
          {/* 清晰度 */}
          {quality && (
            <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded ${
              quality === '4K' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
              : 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300'
            }`}>{quality}</span>
          )}
          {/* 网盘标记 */}
          {item.resourceType === 'drive' && (
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded">{t('search:movie.cloudDrive')}</span>
          )}
          {/* 标题 */}
          {item.resourceType === 'drive' && item.driveUrl ? (
            <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 dark:text-amber-400 hover:underline truncate" title={item.title}>
              {item.title}
            </a>
          ) : item.magnet ? (
            <a href={item.magnet} className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate" title={t('search:movie.btDownloadHint', { title: item.title })}>
              {item.title}
            </a>
          ) : (
            <span className="text-xs text-stone-600 dark:text-stone-300 truncate">{item.title}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 mt-1 text-[10px] text-stone-500">
          {item.size && <span>{item.size}</span>}
          {item.date && <span>{item.date}</span>}
          <span className="text-stone-400">{item.sourceLabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {item.resourceType === 'drive' && item.driveUrl ? (
          <>
            <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" title={t('search:movie.openDriveLink')} className="p-1 rounded text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {item.driveCode && <CopyButton text={item.driveCode} label={t('search:movie.copyDriveCode', { code: item.driveCode })} />}
          </>
        ) : item.magnet ? (
          <>
            <CopyButton text={item.magnet} label={t('search:movie.copyMagnet')} />
            <a href={item.magnet} title={t('search:movie.openMagnet')} className="p-1 rounded text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all">
              <Magnet className="w-3.5 h-3.5" />
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── 筛选小芯片 ──────────────────────────────────────────────────

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

// ─── 影视分组卡片 ──────────────────────────────────────────────────

function GroupedMovieCard({
  subject,
  resources,
  isAuthenticated,
  isFavorited,
  onToggleFavorite,
  defaultExpanded,
}: {
  subject: TMDBResult;
  resources: ResourceItem[];
  isAuthenticated: boolean;
  isFavorited: boolean;
  onToggleFavorite: (item: TMDBResult) => void;
  defaultExpanded: boolean;
}) {
  const { t } = useTranslation(['search']);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [filterQuality, setFilterQuality] = useState<FilterQuality>('all');

  const processedResources = useMemo(() => {
    let r = resources;
    if (filterQuality !== 'all') r = r.filter(x => extractQuality(x.title) === filterQuality);
    const sorted = [...r];
    switch (sortBy) {
      case 'date': sorted.sort((a, b) => (b.date || '').localeCompare(a.date || '')); break;
      case 'size': sorted.sort((a, b) => parseFloat(b.size) - parseFloat(a.size)); break;
    }
    return sorted;
  }, [resources, sortBy, filterQuality]);

  const qualityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    resources.forEach(r => {
      const q = extractQuality(r.title);
      if (q) c[q] = (c[q] || 0) + 1;
    });
    return c;
  }, [resources]);

  const magnetCount = resources.filter(r => r.resourceType === 'magnet' || r.magnet).length;
  const driveCount = resources.filter(r => r.resourceType === 'drive').length;

  const RES_PAGE_SIZE = 8;
  const [resPage, setResPage] = useState(1);
  const resTotalPages = Math.max(1, Math.ceil(processedResources.length / RES_PAGE_SIZE));
  const pagedResources = processedResources.slice((resPage - 1) * RES_PAGE_SIZE, resPage * RES_PAGE_SIZE);

  const changeFilter = <T,>(setter: (v: T) => void, val: T) => { setter(val); setResPage(1); };

  const externalUrl = subject.source === 'douban'
    ? `https://movie.douban.com/subject/${Math.abs(subject.id)}/`
    : `https://www.themoviedb.org/${subject.mediaType}/${subject.id}`;

  return (
    <div className={`rounded-2xl border transition-all overflow-hidden ${
      expanded
        ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/5'
        : 'border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 hover:border-amber-500/30'
    }`}>
      {/* 头部 */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex gap-4 p-4 text-left">
        {/* 海报 */}
        <div className="shrink-0 w-14 h-20 sm:w-16 sm:h-24 rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-700">
          {subject.poster ? (
            <img
              src={subject.poster}
              alt={subject.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {subject.mediaType === 'movie' ? <Film className="w-5 h-5 text-stone-400" /> : <Tv2 className="w-5 h-5 text-stone-400" />}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* 徽章行 */}
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
                  subject.source === 'douban'
                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400'
                }`}>
                  {subject.source === 'douban' ? t('search:movie.sourceDouban') : t('search:movie.sourceTMDB')}
                </span>
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
                  subject.mediaType === 'movie'
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                }`}>
                  {mediaTypeLabel(t, subject.mediaType)}
                </span>
                {/* 资源数量 */}
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                  {t('search:movie.resourceCount', { count: resources.length })}
                </span>
                {magnetCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">{t('search:movie.magnetCount', { count: magnetCount })}</span>
                )}
                {driveCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">{t('search:movie.driveCount', { count: driveCount })}</span>
                )}
              </div>
              <h3 className={`font-semibold text-sm leading-snug line-clamp-2 transition-colors ${
                expanded ? 'text-amber-600 dark:text-amber-400' : 'text-stone-900 dark:text-stone-100'
              }`}>
                {subject.title}
              </h3>
              {subject.originalTitle !== subject.title && (
                <p className="text-xs text-stone-500 mt-0.5 truncate">{subject.originalTitle}</p>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {isAuthenticated && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(subject); }}
                  className={`p-1.5 rounded-lg transition-all ${
                    isFavorited
                      ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
                      : 'text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                  }`}
                  title={isFavorited ? t('search:movie.unfavorite') : t('search:movie.favorite')}
                >
                  <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
                </span>
              )}
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <span className="p-1.5 text-stone-400">
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </span>
            </div>
          </div>

          {/* 元信息 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 mt-2">
            {subject.year && (
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{subject.year}</span>
            )}
            {subject.rating > 0 && (
              <span className={`flex items-center gap-1 ${ratingColor(subject.rating)} font-semibold`}>
                <Star className="w-3.5 h-3.5 fill-current" />{subject.rating.toFixed(1)}
                <span className="text-[10px] text-stone-400 font-normal">({subject.voteCount})</span>
              </span>
            )}
          </div>

          {/* 简介 */}
          {subject.overview && (
            <p className="text-[11px] text-stone-500 leading-relaxed line-clamp-2 mt-1.5">
              {subject.overview}
            </p>
          )}

          {/* 收起时清晰度徽章 */}
          {!expanded && Object.keys(qualityCounts).length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {Object.entries(qualityCounts).map(([q, count]) => (
                <span key={q} className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                  q === '4K' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300'
                }`}>{q} ({count})</span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* 展开内容 */}
      {expanded && processedResources.length > 0 && (
        <div className="px-4 pb-4 border-t border-stone-100 dark:border-stone-800">
          {/* 筛选排序栏 */}
          <div className="flex flex-wrap items-center gap-2 py-3">
            {Object.keys(qualityCounts).length > 0 && (
              <>
                <div className="flex items-center gap-1 text-[10px] text-stone-400">
                  <Filter className="w-3 h-3" />{t('search:movie.quality')}
                </div>
                <div className="flex items-center gap-1">
                  <FilterChip active={filterQuality === 'all'} onClick={() => changeFilter(setFilterQuality, 'all')}>{t('search:movie.all')}</FilterChip>
                  {Object.entries(qualityCounts).map(([q, count]) => (
                    <FilterChip key={q} active={filterQuality === q} onClick={() => changeFilter(setFilterQuality, q as FilterQuality)}>
                      {q} ({count})
                    </FilterChip>
                  ))}
                </div>
              </>
            )}
            <div className="flex items-center gap-1 text-[10px] text-stone-400 ml-auto">
              <ArrowUpDown className="w-3 h-3" />{t('search:movie.sort')}
            </div>
            <div className="flex items-center gap-1">
              <FilterChip active={sortBy === 'date'} onClick={() => changeFilter(setSortBy, 'date')}>{t('search:movie.sortByDate')}</FilterChip>
              <FilterChip active={sortBy === 'size'} onClick={() => changeFilter(setSortBy, 'size')}>{t('search:movie.sortBySize')}</FilterChip>
            </div>
          </div>

          {/* 资源列表 */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_80px] gap-2 px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide border-b border-stone-100 dark:border-stone-800">
              <span>{t('search:movie.resourceHeader')}</span>
              <span className="text-right">{t('search:movie.actions')}</span>
            </div>
            {pagedResources.map((item, i) => (
              <MovieResourceCard key={item.magnet + i} item={item} />
            ))}
          </div>

          {/* 分页 */}
          {processedResources.length > RES_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                disabled={resPage <= 1}
                onClick={() => setResPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
              >
                {t('search:movie.prevPage')}
              </button>
              <span className="text-xs text-stone-500 px-2">{resPage} / {resTotalPages}</span>
              <button
                disabled={resPage >= resTotalPages}
                onClick={() => setResPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
              >
                {t('search:movie.nextPage')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 未归组资源 ──────────────────────────────────────────────────

function UngroupedMovieResources({ resources }: { resources: ResourceItem[] }) {
  const { t } = useTranslation(['search']);
  const [expanded, setExpanded] = useState(false);
  if (resources.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700/60 flex items-center justify-center">
            <Magnet className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <span className="font-semibold text-stone-700 dark:text-stone-300 text-sm">{t('search:movie.unmatchedResources')}</span>
          <span className="px-2 py-0.5 text-xs font-bold bg-stone-100 dark:bg-stone-700/60 text-stone-500 dark:text-stone-400 rounded-full">
            {t('search:movie.countItems', { count: resources.length })}
          </span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-stone-100 dark:border-stone-800 pt-2">
          <p className="text-[10px] text-stone-400 mb-2">{t('search:movie.unmatchedHint')}</p>
          <div className="space-y-1.5">
            {resources.map((item, i) => (
              <MovieResourceCard key={item.magnet + i} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

interface MovieGroupedViewProps {
  data: MovieEnrichedData;
  isAuthenticated?: boolean;
  favorites?: FavoriteItem[];
  onToggleFavorite?: (item: TMDBResult) => void;
}

export const MovieGroupedView: React.FC<MovieGroupedViewProps> = ({
  data,
  isAuthenticated = false,
  favorites = [],
  onToggleFavorite,
}) => {
  const { t } = useTranslation(['search']);
  const grouped = data.grouped;
  if (!grouped) return null;

  const isMovieFavorited = (item: TMDBResult) => {
    const url = item.source === 'douban'
      ? `https://movie.douban.com/subject/${Math.abs(item.id)}/`
      : `https://www.themoviedb.org/${item.mediaType}/${item.id}`;
    return favorites.some(f => f.url === url);
  };

  const withResources = grouped.groups.filter(g => g.resources.length > 0);
  const withoutResources = grouped.groups.filter(g => g.resources.length === 0);

  return (
    <div className="space-y-4">
      {/* 统计栏 */}
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <span className="px-1.5 py-0.5 rounded bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 font-medium">
          {t('search:movie.groupedView')}
        </span>
        <span>{t('search:movie.worksWithResources', { count: withResources.length })}</span>
        {grouped.ungrouped.length > 0 && (
          <>
            <span>·</span>
            <span>{t('search:movie.unmatchedResourcesCount', { count: grouped.ungrouped.length })}</span>
          </>
        )}
        {withoutResources.length > 0 && (
          <>
            <span>·</span>
            <span>{t('search:movie.worksWithoutResources', { count: withoutResources.length })}</span>
          </>
        )}
      </div>

      {/* 有资源的影视 */}
      {withResources.length > 0 && (
        <div className="space-y-3">
          {withResources.map((group, i) => (
            <GroupedMovieCard
              key={`${group.subject.mediaType}-${group.subject.id}`}
              subject={group.subject}
              resources={group.resources}
              isAuthenticated={isAuthenticated}
              isFavorited={isMovieFavorited(group.subject)}
              onToggleFavorite={(itm) => onToggleFavorite?.(itm)}
              defaultExpanded={i === 0}
            />
          ))}
        </div>
      )}

      {/* 未归组资源 */}
      <UngroupedMovieResources resources={grouped.ungrouped} />

      {/* 无资源的影视 */}
      {withoutResources.length > 0 && (
        <div className="rounded-2xl border border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-700/60 flex items-center justify-center">
                <Film className="w-3.5 h-3.5 text-stone-400" />
              </div>
              <span className="font-semibold text-stone-700 dark:text-stone-300 text-sm">{t('search:movie.noResourceWorks')}</span>
              <span className="px-2 py-0.5 text-xs font-bold bg-stone-100 dark:bg-stone-700/60 text-stone-500 dark:text-stone-400 rounded-full">
                {t('search:movie.worksCount', { count: withoutResources.length })}
              </span>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {withoutResources.map(group => (
              <a
                key={`${group.subject.mediaType}-${group.subject.id}`}
                href={group.subject.source === 'douban'
                  ? `https://movie.douban.com/subject/${Math.abs(group.subject.id)}/`
                  : `https://www.themoviedb.org/${group.subject.mediaType}/${group.subject.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 p-3 rounded-xl border border-stone-200 dark:border-stone-700/50 hover:border-amber-500/30 hover:bg-stone-50 dark:hover:bg-stone-800/70 transition-all"
              >
                <div className="w-10 h-14 rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-700 shrink-0">
                  {group.subject.poster && (
                    <img src={group.subject.poster} alt={group.subject.title} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-xs text-stone-800 dark:text-stone-100 truncate">{group.subject.title}</p>
                  {group.subject.rating > 0 && (
                    <p className={`text-[10px] mt-1 ${ratingColor(group.subject.rating)}`}>
                      <Star className="w-2.5 h-2.5 inline fill-current" /> {group.subject.rating.toFixed(1)}
                    </p>
                  )}
                  <p className="text-[9px] text-stone-400 mt-0.5">{group.subject.source === 'douban' ? t('search:movie.sourceDouban') : t('search:movie.sourceTMDB')}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {withResources.length === 0 && grouped.ungrouped.length === 0 && withoutResources.length === 0 && (
        <div className="text-center py-16">
          <Magnet className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <p className="text-sm text-stone-500">{t('search:movie.empty')}</p>
          <p className="text-xs text-stone-400 mt-1">{t('search:movie.emptyHint')}</p>
        </div>
      )}
    </div>
  );
};
