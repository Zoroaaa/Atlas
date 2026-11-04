import React, { useState, useMemo } from 'react';
import {
  Star, Film, Tv2, Calendar, ExternalLink, Magnet,
  ChevronDown, ChevronRight, Heart,
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
import {
  GroupedHeader,
  GroupedFilterBar,
  MediaCard,
  ResourceRow,
  Chip,
  Pagination,
  CountBadge,
  EmptyBlock,
  PanelSection,
  PanelHeader,
} from '@/components/workbench';

// ─── helpers ────────────────────────────────────────────────────────────────

const ratingColor = (n: number) =>
  n >= 8 ? 'text-success-400' : n >= 6 ? 'text-warning-400' : 'text-surface-400';

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
    <ResourceRow
      badges={
        <>
          {item.source === 'yts' ? <Chip tone="source" size="xs">YTS</Chip> : null}
          {item.source === 'eztv' ? <Chip tone="source" size="xs">EZTV</Chip> : null}
          {item.source === 'tpb' ? <Chip tone="source" size="xs">TPB</Chip> : null}
          {quality ? <Chip tone={quality === '4K' ? 'warning' : 'source'} size="xs">{quality}</Chip> : null}
          {item.resourceType === 'drive' ? <Chip tone="warning" size="xs">{t('search:movie.cloudDrive')}</Chip> : null}
        </>
      }
      title={
        item.resourceType === 'drive' && item.driveUrl ? (
          <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400" title={item.title}>
            {item.title}
          </a>
        ) : item.magnet ? (
          <a href={item.magnet} className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400" title={t('search:movie.btDownloadHint', { title: item.title })}>
            {item.title}
          </a>
        ) : (
          <span className="block truncate text-[12px] text-surface-700 dark:text-surface-300" title={item.title}>{item.title}</span>
        )
      }
      meta={[item.size, item.date, item.sourceLabel].filter(Boolean) as React.ReactNode[]}
      trailing={
        item.resourceType === 'drive' && item.driveUrl ? (
          <>
            <a
              href={item.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('search:movie.openDriveLink')}
              className="flex h-7 w-7 items-center justify-center rounded-md text-surface-400 hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {item.driveCode ? <CopyButton text={item.driveCode} label={t('search:movie.copyDriveCode', { code: item.driveCode })} /> : null}
          </>
        ) : item.magnet ? (
          <>
            <CopyButton text={item.magnet} label={t('search:movie.copyMagnet')} />
            <a
              href={item.magnet}
              aria-label={t('search:movie.openMagnet')}
              className="flex h-7 w-7 items-center justify-center rounded-md text-surface-400 hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
            >
              <Magnet className="h-3.5 w-3.5" />
            </a>
          </>
        ) : undefined
      }
    />
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
    <div className={`border-t border-surface-100 first:border-t-0 dark:border-surface-800/70 ${
      expanded ? 'bg-surface-50/40 dark:bg-surface-900/30' : ''
    }`}>
      {/* 头部 */}
      <GroupedHeader
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        cover={
          subject.poster ? (
            <img
              src={subject.poster}
              alt={subject.title}
              className="h-16 w-12 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800"
              loading="lazy"
              onError={(event) => { (event.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
            />
          ) : (
            <div className="flex h-16 w-12 items-center justify-center rounded-[10px] bg-surface-100 text-surface-400 dark:bg-surface-800">
              {subject.mediaType === 'movie' ? <Film className="h-5 w-5" /> : <Tv2 className="h-5 w-5" />}
            </div>
          )
        }
        title={subject.title}
        subtitle={subject.originalTitle !== subject.title ? subject.originalTitle : undefined}
        badges={
          <>
            <Chip tone={subject.source === 'douban' ? 'success' : 'source'} size="xs">
              {subject.source === 'douban' ? t('search:movie.sourceDouban') : t('search:movie.sourceTMDB')}
            </Chip>
            <Chip tone={subject.mediaType === 'movie' ? 'warning' : 'accent'} size="xs">
              {mediaTypeLabel(t, subject.mediaType)}
            </Chip>
            <Chip tone="primary" size="xs">{t('search:movie.resourceCount', { count: resources.length })}</Chip>
            {magnetCount > 0 ? <Chip tone="source" size="xs">{t('search:movie.magnetCount', { count: magnetCount })}</Chip> : null}
            {driveCount > 0 ? <Chip tone="warning" size="xs">{t('search:movie.driveCount', { count: driveCount })}</Chip> : null}
          </>
        }
        meta={
          <>
            {subject.year ? (
              <span className="mr-2 inline-flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{subject.year}</span>
            ) : null}
            {subject.rating > 0 ? (
              <span className={`mr-2 inline-flex items-center gap-0.5 font-semibold ${ratingColor(subject.rating)}`}>
                <Star className="h-2.5 w-2.5 fill-current" />{subject.rating.toFixed(1)}
                <span className="font-normal text-surface-400">({subject.voteCount})</span>
              </span>
            ) : null}
            {!expanded && Object.keys(qualityCounts).length > 0 ? (
              <span>{Object.entries(qualityCounts).map(([quality, count]) => `${quality}(${count})`).join(' · ')}</span>
            ) : null}
          </>
        }
        actions={
          <>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => onToggleFavorite(subject)}
                aria-label={isFavorited ? t('search:movie.unfavorite') : t('search:movie.favorite')}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  isFavorited
                    ? 'bg-error-50 text-error-500 dark:bg-error-900/20'
                    : 'text-surface-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-900/20'
                }`}
              >
                <Heart className={`h-3.5 w-3.5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            ) : null}
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('search:movie.matchTitle')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        }
      />

      {/* 展开内容 */}
      {expanded && processedResources.length > 0 && (
        <div className="border-t border-surface-100 px-4 pb-4 dark:border-surface-800/70">
          {subject.overview ? (
            <p className="line-clamp-3 py-3 text-[11px] leading-relaxed text-surface-500">{subject.overview}</p>
          ) : null}

          <GroupedFilterBar
            sortLabel={t('search:movie.sort')}
            sortOptions={[
              { value: 'date', label: t('search:movie.sortByDate') },
              { value: 'size', label: t('search:movie.sortBySize') },
            ]}
            sortValue={sortBy}
            onSortChange={(value) => changeFilter(setSortBy, value as SortKey)}
            filterLabel={Object.keys(qualityCounts).length > 0 ? t('search:movie.quality') : undefined}
            filterOptions={Object.keys(qualityCounts).length > 0 ? [
              { value: 'all', label: t('search:movie.all') },
              ...Object.entries(qualityCounts).map(([quality, count]) => ({ value: quality, label: quality, count })),
            ] : undefined}
            filterValue={filterQuality}
            onFilterChange={(value) => changeFilter(setFilterQuality, value as FilterQuality)}
          />

          <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
            {pagedResources.map((item, index) => (
              <MovieResourceCard key={item.magnet + index} item={item} />
            ))}
          </div>

          <Pagination
            page={resPage}
            totalPages={resTotalPages}
            onChange={setResPage}
            prevLabel={t('search:movie.prevPage')}
            nextLabel={t('search:movie.nextPage')}
          />
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
    <PanelSection>
      <PanelHeader
        icon={<Magnet className="h-4 w-4" />}
        title={t('search:movie.unmatchedResources')}
        count={<CountBadge>{t('search:movie.countItems', { count: resources.length })}</CountBadge>}
        onToggle={() => setExpanded(!expanded)}
        expanded={expanded}
        ariaControls="movie-ungrouped-resources"
        actions={expanded ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
      />
      {expanded ? (
        <div id="movie-ungrouped-resources" className="px-4 pb-4 sm:px-5 sm:pb-5">
          <p className="type-micro mb-2 text-surface-400">{t('search:movie.unmatchedHint')}</p>
          <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
            {resources.map((item, index) => (
              <MovieResourceCard key={item.magnet + index} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </PanelSection>
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
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3 sm:px-5">
        <Chip tone="primary" size="xs">{t('search:movie.groupedView')}</Chip>
        <span className="type-meta">{t('search:movie.worksWithResources', { count: withResources.length })}</span>
        {grouped.ungrouped.length > 0 ? (
          <><span className="type-micro text-surface-400">·</span><span className="type-meta">{t('search:movie.unmatchedResourcesCount', { count: grouped.ungrouped.length })}</span></>
        ) : null}
        {withoutResources.length > 0 ? (
          <><span className="type-micro text-surface-400">·</span><span className="type-meta">{t('search:movie.worksWithoutResources', { count: withoutResources.length })}</span></>
        ) : null}
      </div>

      {withResources.length > 0 ? (
        <PanelSection>
          {withResources.map((group, index) => (
            <GroupedMovieCard
              key={`${group.subject.mediaType}-${group.subject.id}`}
              subject={group.subject}
              resources={group.resources}
              isAuthenticated={isAuthenticated}
              isFavorited={isMovieFavorited(group.subject)}
              onToggleFavorite={(item) => onToggleFavorite?.(item)}
              defaultExpanded={index === 0}
            />
          ))}
        </PanelSection>
      ) : null}

      <UngroupedMovieResources resources={grouped.ungrouped} />

      {withoutResources.length > 0 ? (
        <PanelSection>
          <PanelHeader
            icon={<Film className="h-4 w-4" />}
            title={t('search:movie.noResourceWorks')}
            count={<CountBadge>{t('search:movie.worksCount', { count: withoutResources.length })}</CountBadge>}
          />
          <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5 lg:grid-cols-3">
            {withoutResources.map((group) => {
              const externalUrl = group.subject.source === 'douban'
                ? `https://movie.douban.com/subject/${Math.abs(group.subject.id)}/`
                : `https://www.themoviedb.org/${group.subject.mediaType}/${group.subject.id}`;
              return (
                <MediaCard
                  key={`${group.subject.mediaType}-${group.subject.id}`}
                  cover={group.subject.poster || undefined}
                  coverFallback={group.subject.mediaType === 'movie' ? <Film className="h-5 w-5" /> : <Tv2 className="h-5 w-5" />}
                  coverSize="sm"
                  href={externalUrl}
                  title={group.subject.title}
                  badges={
                    <>
                      {group.subject.rating > 0 ? (
                        <span className={`inline-flex items-center gap-0.5 text-[10px] ${ratingColor(group.subject.rating)}`}>
                          <Star className="h-2.5 w-2.5 fill-current" />{group.subject.rating.toFixed(1)}
                        </span>
                      ) : null}
                      <Chip tone="source" size="xs">
                        {group.subject.source === 'douban' ? t('search:movie.sourceDouban') : t('search:movie.sourceTMDB')}
                      </Chip>
                    </>
                  }
                />
              );
            })}
          </div>
        </PanelSection>
      ) : null}

      {withResources.length === 0 && grouped.ungrouped.length === 0 && withoutResources.length === 0 ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyBlock
            icon={<Magnet className="h-7 w-7" />}
            title={t('search:movie.empty')}
            hint={t('search:movie.emptyHint')}
            className="bg-transparent"
          />
        </div>
      ) : null}
    </div>
  );
};
