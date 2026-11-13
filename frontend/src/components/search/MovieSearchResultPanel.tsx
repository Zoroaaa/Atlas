import React, { useEffect, useState } from 'react';
import {
  Star, Film, Tv2, Calendar, ExternalLink, Magnet,
  Wifi, RefreshCw, ChevronDown, ChevronUp,
  Heart, ShieldCheck, LayoutGrid, List,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  MovieEnrichedData,
  TMDBResult,
  ResourceItem,
} from '@/types/search';
import type { FavoriteRef } from '@/types';
import { CopyButton } from '@/components/ui/CopyButton';
import { ProxyImage } from '@/components/ui';
import { ShareToCommunityButton } from '@/components/community';
import { convertToProxyUrl } from '@/services/proxy';
import {
  PanelSection,
  PanelHeader,
  Toolbar,
  MediaCard,
  ResourceRow,
  Chip,
  CountBadge,
  Pagination,
  Notice,
  EmptyBlock,
  Segmented,
  IconAction,
} from '@/components/workbench';
import { MovieGroupedView } from './MovieGroupedView';

const ratingColor = (n: number) =>
  n >= 8 ? 'text-success-400' : n >= 6 ? 'text-warning-400' : 'text-surface-400';

const mediaTypeLabel = (t: TFunction, mediaType: 'movie' | 'tv') =>
  mediaType === 'movie' ? t('search:movie.type.movie') : t('search:movie.type.tv');

const extractQuality = (title: string): string => {
  const lower = title.toLowerCase();
  if (lower.includes('2160') || lower.includes('4k')) return '4K';
  if (lower.includes('1080')) return '1080p';
  if (lower.includes('720')) return '720p';
  return '';
};

function ResourceCard({ item }: { item: ResourceItem }) {
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
          {item.resourceType === 'direct' ? <Chip tone="success" size="xs">{t('search:movie.directLink')}</Chip> : null}
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
      meta={[
        item.size,
        item.date,
        item.sourceLabel,
        typeof item.seeders === 'number' ? `↑${item.seeders}${typeof item.leechers === 'number' ? ` ↓${item.leechers}` : ''}` : null,
      ].filter(Boolean) as React.ReactNode[]}
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
              title={t('search:movie.openMagnetHint')}
              aria-label={t('search:movie.openMagnetHint')}
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

interface MovieSearchResultPanelProps {
  data: MovieEnrichedData;
  isAuthenticated?: boolean;
  isProxyEnabled?: boolean;
  favorites?: FavoriteRef[];
  onRefresh?: () => void;
  onPageChange?: (page: number) => void;
  onToggleFavorite?: (item: TMDBResult) => void;
  onLoginRequired?: () => void;
}

export const MovieSearchResultPanel: React.FC<MovieSearchResultPanelProps> = ({
  data,
  isAuthenticated = false,
  isProxyEnabled = false,
  favorites = [],
  onRefresh,
  onPageChange,
  onToggleFavorite,
  onLoginRequired,
}) => {
  const { t } = useTranslation(['search']);
  const [selectedItem, setSelectedItem] = useState<TMDBResult | null>(data.results[0] ?? null);
  const [resourcePage, setResourcePage] = useState(1);
  const [showAllResources, setShowAllResources] = useState(false);
  const RES_PAGE_SIZE = 10;

  const hasGrouped = !!(data.grouped && (data.grouped.groups.some((group) => group.resources.length > 0) || data.grouped.ungrouped.length > 0));
  // 主作品（搜索结果第一条）没有匹配到资源、但别的作品有资源时，默认用分源视图，
  // 否则用户只会看到主作品“0 资源”，误以为资源被丢弃。
  const primarySubject = data.results?.[0];
  const primaryHasResources = Boolean(
    data.grouped &&
    primarySubject &&
    data.grouped.groups.some(
      (group) =>
        group.subject.id === primarySubject.id &&
        group.subject.mediaType === primarySubject.mediaType &&
        group.resources.length > 0
    )
  );
  const defaultViewMode: 'grouped' | 'sources' =
    hasGrouped && (data.results.length === 0 || primaryHasResources) ? 'grouped' : 'sources';
  const [viewMode, setViewMode] = useState<'grouped' | 'sources'>(defaultViewMode);

  // 换关键词/翻页后重置选中项与资源页码，避免沿用上一批数据的状态
  useEffect(() => {
    setSelectedItem(data.results[0] ?? null);
    setResourcePage(1);
    setShowAllResources(false);
    setViewMode(defaultViewMode);
  }, [data.keyword, data.page, data.results, defaultViewMode]);

  const results = data.results ?? [];
  const resources = data.resources ?? [];

  const filteredResources = selectedItem
    ? resources.filter((resource) =>
        resource.title.toLowerCase().includes(selectedItem.title.toLowerCase()) ||
        resource.title.toLowerCase().includes(selectedItem.originalTitle.toLowerCase())
      )
    : resources;

  const displayResources = filteredResources.length > 0 ? filteredResources : resources;
  const resTotalPages = Math.max(1, Math.ceil(displayResources.length / RES_PAGE_SIZE));
  const pagedResources = displayResources.slice((resourcePage - 1) * RES_PAGE_SIZE, resourcePage * RES_PAGE_SIZE);

  const handleSelectItem = (item: TMDBResult) => {
    setSelectedItem(item);
    setResourcePage(1);
  };

  const isMovieFavorited = (item: TMDBResult) => {
    const url = `https://www.themoviedb.org/${item.mediaType}/${item.id}`;
    return favorites.some((favorite) => favorite.url === url);
  };

  const magnetCount = displayResources.filter((resource) => resource.resourceType === 'magnet' || resource.magnet).length;
  const driveCount = displayResources.filter((resource) => resource.resourceType === 'drive').length;

  const getExternalUrl = (item: TMDBResult) =>
    `https://www.themoviedb.org/${item.mediaType}/${item.id}`;

  const errorNotices = [
    data.tmdbError ? { key: 'tmdb', text: t('search:movie.tmdbError', { error: data.tmdbError }) } : null,
    data.tpbError ? { key: 'tpb', text: t('search:movie.tpbError', { error: data.tpbError }) } : null,
    data.eztvError ? { key: 'eztv', text: t('search:movie.eztvError', { error: data.eztvError }) } : null,
  ].filter(Boolean) as { key: string; text: string }[];

  return (
    <div>
      <PanelSection>
        <Toolbar
          left={
            <>
              <span className="type-meta">{t('search:movie.movieCount', { count: data.total })}</span>
              <span className="type-micro text-surface-400">·</span>
              <span className="type-meta">{t('search:movie.resourceTotalCount', { count: data.resourceTotal })}</span>
              {magnetCount > 0 ? <Chip tone="source" size="xs">{t('search:movie.magnetCount', { count: magnetCount })}</Chip> : null}
              {driveCount > 0 ? <Chip tone="warning" size="xs">{t('search:movie.driveCount', { count: driveCount })}</Chip> : null}
              {data.resourceSources && data.resourceSources.length > 0 ? (
                <span className="type-micro hidden text-surface-500 sm:inline">
                  {t('search:movie.sourcesFrom', { sources: data.resourceSources.join(' / ') })}
                </span>
              ) : null}
            </>
          }
          right={
            <>
              {onRefresh ? (
                <>
                  <ShareToCommunityButton
                    postData={{
                      postType: 'movie',
                      title: data.results[0]?.title || data.keyword,
                      coverImage: data.results[0]?.poster || data.results[0]?.backdrop || '',
                      contentData: JSON.stringify({
                        keyword: data.keyword,
                        results: data.results,
                        resources: data.resources,
                        resourceTotal: data.resourceTotal,
                      }),
                    }}
                    isAuthenticated={isAuthenticated}
                    onLoginRequired={onLoginRequired}
                    size="small"
                  />
                  <IconAction icon={<RefreshCw className="h-3.5 w-3.5" />} label={t('search:movie.refresh')} onClick={onRefresh} />
                </>
              ) : null}
              {hasGrouped ? (
                <Segmented
                  value={viewMode}
                  onChange={setViewMode}
                  ariaLabel={t('search:movie.groupedViewTitle')}
                  options={[
                    { value: 'grouped', label: t('search:movie.grouped'), icon: <LayoutGrid className="h-3 w-3" /> },
                    { value: 'sources', label: t('search:movie.sourcesView'), icon: <List className="h-3 w-3" /> },
                  ]}
                />
              ) : null}
            </>
          }
        />
      </PanelSection>

      {errorNotices.length > 0 ? (
        <div className="space-y-1.5 px-4 pb-3 pt-2 sm:px-5">
          {errorNotices.slice(0, 3).map((notice) => (
            <Notice key={notice.key} tone="warning">{notice.text}</Notice>
          ))}
          {errorNotices.length > 3 ? <Notice tone="warning">+{errorNotices.length - 3}</Notice> : null}
        </div>
      ) : null}

      {results.length === 0 && resources.length === 0 && errorNotices.length === 0 ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyBlock
            icon={<Wifi className="h-7 w-7" />}
            title={t('search:movie.empty')}
            hint={t('search:movie.emptyHint')}
            className="bg-transparent"
          />
        </div>
      ) : null}

      {viewMode === 'grouped' && hasGrouped ? (
        <MovieGroupedView
          data={data}
          isAuthenticated={isAuthenticated}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
        />
      ) : null}

      {viewMode === 'sources' ? (
        <>
          <PanelSection>
            <PanelHeader
              icon={<Film className="h-4 w-4" />}
              title={t('search:movie.matchTitle')}
              count={results.length > 0 ? <CountBadge>{t('search:movie.countItems', { count: results.length })}</CountBadge> : undefined}
              actions={<span className="type-micro text-surface-400">{t('search:movie.sourcesView')}</span>}
            />
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              {results.length > 0 ? (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {results.map((item) => (
                      <div key={`${item.mediaType}-${item.id}`} className="w-[220px] shrink-0">
                        <MediaCard
                          cover={item.poster || undefined}
                          coverFallback={item.mediaType === 'movie' ? <Film className="h-5 w-5" /> : <Tv2 className="h-5 w-5" />}
                          coverSize="sm"
                          title={item.title}
                          originalTitle={item.originalTitle && item.originalTitle !== item.title ? item.originalTitle : undefined}
                          badges={
                            <>
                              <Chip tone="source" size="xs">{t('search:movie.sourceTMDB')}</Chip>
                              <Chip tone={item.mediaType === 'movie' ? 'warning' : 'accent'} size="xs">
                                {mediaTypeLabel(t, item.mediaType)}
                              </Chip>
                            </>
                          }
                          meta={
                            <>
                              {item.year ? <span className="mr-2 inline-flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{item.year}</span> : null}
                              {item.rating > 0 ? <span className={`inline-flex items-center gap-0.5 ${ratingColor(item.rating)}`}><Star className="h-2.5 w-2.5 fill-current" />{item.rating.toFixed(1)}</span> : null}
                            </>
                          }
                          selected={selectedItem?.id === item.id && selectedItem?.mediaType === item.mediaType}
                          onSelect={() => handleSelectItem(item)}
                          actions={isAuthenticated ? (
                            <button
                              type="button"
                              onClick={() => onToggleFavorite?.(item)}
                              aria-label={isMovieFavorited(item) ? t('search:movie.unfavorite') : t('search:movie.favorite')}
                              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                                isMovieFavorited(item)
                                  ? 'bg-error-50 text-error-500 dark:bg-error-900/20'
                                  : 'text-surface-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-900/20'
                              }`}
                            >
                              <Heart className={`h-3.5 w-3.5 ${isMovieFavorited(item) ? 'fill-current' : ''}`} />
                            </button>
                          ) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                  {onPageChange && (results.length >= 18 || data.page > 1) ? (
                    <div className="mt-2 flex justify-center gap-2">
                      <button
                        type="button"
                        disabled={data.page <= 1}
                        onClick={() => onPageChange(data.page - 1)}
                        className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] text-surface-500 hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-surface-800"
                      >
                        {t('search:movie.prevPage')}
                      </button>
                      <span className="type-micro flex items-center px-2 text-surface-500">{t('search:movie.pageNumber', { page: data.page })}</span>
                      <button
                        type="button"
                        disabled={results.length < 18}
                        onClick={() => onPageChange(data.page + 1)}
                        className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] text-surface-500 hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-surface-800"
                      >
                        {t('search:movie.nextPage')}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : errorNotices.length === 0 ? (
                <EmptyBlock icon={<Film className="h-7 w-7" />} title={t('search:movie.noMatchResults')} className="bg-transparent" />
              ) : null}
            </div>
          </PanelSection>

          {selectedItem ? (
            <PanelSection>
              <PanelHeader
                icon={<Star className="h-4 w-4" />}
                title={t('search:movie.matchTitle')}
                actions={
                  <a
                    href={isProxyEnabled ? convertToProxyUrl(getExternalUrl(selectedItem)) : getExternalUrl(selectedItem)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
                    aria-label={t('search:movie.matchTitle')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                }
              />
              <div className="flex flex-col gap-4 px-4 pb-4 sm:flex-row sm:px-5 sm:pb-5">
                {selectedItem.backdrop || selectedItem.poster ? (
                  <ProxyImage
                    src={selectedItem.backdrop ?? selectedItem.poster!}
                    alt={selectedItem.title}
                    loading="lazy"
                    className="hidden h-24 w-[168px] shrink-0 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800 sm:block"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-semibold leading-snug text-surface-900 dark:text-surface-100">{selectedItem.title}</h3>
                  {selectedItem.originalTitle !== selectedItem.title ? (
                    <p className="type-micro mt-0.5 text-surface-500">{selectedItem.originalTitle}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Chip tone="source" size="xs">{t('search:movie.sourceTMDB')}</Chip>
                    <Chip tone={selectedItem.mediaType === 'movie' ? 'warning' : 'accent'} size="xs">
                      {mediaTypeLabel(t, selectedItem.mediaType)}
                    </Chip>
                    {selectedItem.year ? <Chip tone="neutral" size="xs">{selectedItem.year}</Chip> : null}
                    {selectedItem.rating > 0 ? (
                      <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${ratingColor(selectedItem.rating)}`}>
                        <Star className="h-3 w-3 fill-current" />{selectedItem.rating.toFixed(1)}
                      </span>
                    ) : null}
                    {isProxyEnabled ? (
                      <Chip tone="proxy" size="xs">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {t('search:movie.proxyAccessible')}
                      </Chip>
                    ) : null}
                    {isAuthenticated ? (
                      <button
                        type="button"
                        onClick={() => onToggleFavorite?.(selectedItem)}
                        aria-label={isMovieFavorited(selectedItem) ? t('search:movie.unfavorite') : t('search:movie.favorite')}
                        className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                          isMovieFavorited(selectedItem)
                            ? 'bg-error-50 text-error-500 dark:bg-error-900/20'
                            : 'text-surface-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-900/20'
                        }`}
                      >
                        <Heart className={`h-3.5 w-3.5 ${isMovieFavorited(selectedItem) ? 'fill-current' : ''}`} />
                      </button>
                    ) : null}
                  </div>
                  {selectedItem.overview ? (
                    <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-surface-600 dark:text-surface-300">{selectedItem.overview}</p>
                  ) : null}
                </div>
              </div>
            </PanelSection>
          ) : null}

          <PanelSection>
            <PanelHeader
              icon={<Magnet className="h-4 w-4 text-accent-500" />}
              title={t('search:movie.downloadResources')}
              count={displayResources.length > 0 ? <CountBadge>{t('search:movie.countItems', { count: displayResources.length })}</CountBadge> : undefined}
              meta={t('search:movie.resourceHint')}
            />
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              {displayResources.length === 0 ? (
                <EmptyBlock
                  icon={<Magnet className="h-7 w-7" />}
                  title={t('search:movie.noResources')}
                  hint={
                    <>
                      {t('search:movie.searchExternal')}
                      <a href={`https://yts.mx/movies?query_term=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="mx-1 text-primary-500 hover:underline">YTS</a>·
                      <a href={`https://1337x.to/search/${encodeURIComponent(data.keyword)}/1/`} target="_blank" rel="noopener noreferrer" className="mx-1 text-primary-500 hover:underline">1337x</a>·
                      <a href={`https://www.lightbt.top/search?q=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="mx-1 text-primary-500 hover:underline">LightBT</a>
                    </>
                  }
                  className="bg-transparent"
                />
              ) : (
                <>
                  <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
                    {(showAllResources ? pagedResources : pagedResources.slice(0, 5)).map((item, index) => (
                      <ResourceCard key={item.magnet + item.title + index} item={item} />
                    ))}
                  </div>
                  {pagedResources.length > 5 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllResources((value) => !value)}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] text-surface-500 transition-colors hover:bg-surface-50 hover:text-primary-500 dark:hover:bg-surface-800/40"
                    >
                      {showAllResources ? (
                        <><ChevronUp className="h-3.5 w-3.5" />{t('search:movie.collapse')}</>
                      ) : (
                        <><ChevronDown className="h-3.5 w-3.5" />{t('search:movie.expandAll', { count: pagedResources.length })}</>
                      )}
                    </button>
                  ) : null}
                  <Pagination
                    page={resourcePage}
                    totalPages={resTotalPages}
                    onChange={setResourcePage}
                    prevLabel={t('search:movie.prevPage')}
                    nextLabel={t('search:movie.nextPage')}
                    totalLabel={t('search:movie.totalCount', { count: displayResources.length })}
                  />
                </>
              )}
            </div>
          </PanelSection>
        </>
      ) : null}
    </div>
  );
};
