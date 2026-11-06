import React, { useState, useMemo } from 'react';
import {
  Star, Calendar, Tv, ExternalLink, Magnet,
  ChevronDown, ChevronRight, Heart, Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  AnimeEnrichedData,
  AnimeGroupedItem,
  AnimeUnifiedResource,
  BangumiSubject,
} from '@/types/search';
import type { FavoriteRef } from '@/types';
import { CopyButton } from '@/components/ui/CopyButton';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { convertToProxyUrl } from '@/services/proxy';
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
import type { ChipTone } from '@/components/workbench';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = {
  seedColor: (n: number) =>
    n >= 10 ? 'text-success-400' : n >= 1 ? 'text-warning-400' : 'text-error-400',
  rating: (n: number) =>
    n >= 8 ? 'text-success-400' : n >= 6 ? 'text-warning-400' : 'text-surface-400',
};

const typeLabel = (t: TFunction, tf?: string | number) => {
  const m: Record<string | number, string> = { 2: 'TV', 6: t('search:anime.type.movie'), 4: 'Web', 3: t('search:anime.type.music'), tv: 'TV', movie: t('search:anime.type.movie'), ova: 'OVA', web: 'Web', music: t('search:anime.type.music') };
  return tf != null ? (m[tf] ?? String(tf)) : '';
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
  const { t } = useTranslation(['search']);
  const quality = extractQuality(item.title);
  const sourceTone = (source: string): ChipTone =>
    source === 'mikan' ? 'success' : source === 'animetosho' ? 'accent' : source === 'showrss' ? 'warning' : 'source';

  return (
    <ResourceRow
      badges={
        <>
          <Chip tone={sourceTone(item.source)} size="xs">{item.sourceLabel}</Chip>
          {item.trusted ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-400" title={t('search:anime.trustedUploader')} /> : null}
          {item.group ? <Chip tone="neutral" size="xs">{item.group}</Chip> : null}
        </>
      }
      quality={quality ? <Chip tone={quality === '4K' ? 'warning' : 'source'} size="xs">{quality}</Chip> : undefined}
      title={
        <a href={item.magnet} className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400" title={t('search:anime.btDownloadHint', { title: item.title })}>
          {item.title}
        </a>
      }
      meta={[item.size, item.date].filter(Boolean) as React.ReactNode[]}
      trailing={
        <>
          {item.source !== 'showrss' && item.source !== 'mikan' ? (
            <span className={`mr-1 text-[11px] font-medium tabular-nums ${fmt.seedColor(item.seeders)}`}>
              {item.seeders}<span className="mx-0.5 text-surface-400">/</span><span className="text-error-400">{item.leechers}</span>
            </span>
          ) : item.source === 'mikan' ? (
            <span className="type-micro mr-1 text-surface-400">{t('search:anime.subgroupResource')}</span>
          ) : (
            <Chip tone="neutral" size="xs" className="mr-1">DHT</Chip>
          )}
          <CopyButton text={item.magnet} label={t('search:anime.copyMagnet')} />
        </>
      }
    />
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
  const { t } = useTranslation(['search']);
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
    <div className={`border-t border-surface-100 first:border-t-0 dark:border-surface-800/70 ${
      expanded ? 'bg-surface-50/40 dark:bg-surface-900/30' : ''
    }`}>
      {/* 作品头部（可点击展开） */}
      <GroupedHeader
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        cover={
          subject.cover ? (
            <img
              src={getProxyImageUrl(subject.cover)}
              alt={subject.nameCN || subject.name}
              className="h-16 w-12 rounded-[10px] bg-surface-100 object-cover dark:bg-surface-800"
              loading="lazy"
              onError={(event) => { (event.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
            />
          ) : undefined
        }
        title={subject.nameCN || subject.name}
        subtitle={subject.nameCN && subject.name !== subject.nameCN ? subject.name : undefined}
        badges={
          <>
            {subject.type ? (
              <Chip tone={subject.type === 4 || subject.type === 'web' ? 'success' : subject.type === 3 || subject.type === 'music' ? 'accent' : 'warning'} size="xs">
                {typeLabel(t, subject.type)}
              </Chip>
            ) : null}
            {subject.status ? (
              <Chip tone={subject.status === '连载中' ? 'success' : subject.status === '未开播' ? 'warning' : 'neutral'} size="xs">
                {subject.status}
              </Chip>
            ) : null}
            {subject.rank && subject.rank > 0 && subject.rank <= 1000 ? <Chip tone="warning" size="xs">#{subject.rank}</Chip> : null}
            <Chip tone="primary" size="xs">{t('search:anime.resourceCount', { count: resources.length })}</Chip>
          </>
        }
        meta={
          <>
            {subject.rating > 0 ? (
              <span className={`mr-2 inline-flex items-center gap-0.5 font-medium ${fmt.rating(subject.rating)}`}>
                <Star className="h-2.5 w-2.5 fill-current" />{subject.rating.toFixed(1)}
                {subject.ratingCount ? <span className="font-normal text-surface-400">({subject.ratingCount})</span> : null}
              </span>
            ) : null}
            {subject.collection?.doing ? (
              <span className="mr-2 inline-flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{subject.collection.doing}</span>
            ) : null}
            {subject.eps ? (
              <span className="mr-2 inline-flex items-center gap-0.5"><Tv className="h-2.5 w-2.5" />{t('search:anime.epsCount', { count: subject.eps })}</span>
            ) : null}
            {subject.airDate ? (
              <span className="mr-2 inline-flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{subject.airDate.slice(0, 7)}</span>
            ) : null}
            {subject.studio ? <span className="mr-2 truncate">{subject.studio}</span> : null}
            {!expanded && Object.keys(sourceCounts).length > 0 ? (
              <span>{Object.entries(sourceCounts).map(([source, count]) => `${source}:${count}`).join(' · ')}</span>
            ) : null}
          </>
        }
        actions={
          <>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => onToggleFavorite(subject)}
                aria-label={isFavorited ? t('search:anime.unfavorite') : t('search:anime.favorite')}
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
              href={isProxyEnabled ? convertToProxyUrl(subject.url) : subject.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('search:anime.more')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        }
      />

      {/* 展开内容：简介 + 资源列表 + 筛选排序 */}
      {expanded && processedResources.length > 0 && (
        <div className="border-t border-surface-100 px-4 pb-4 dark:border-surface-800/70">
          {subject.summary ? (
            <p className="line-clamp-3 py-3 text-[11px] leading-relaxed text-surface-500">{subject.summary}</p>
          ) : null}

          <GroupedFilterBar
            sortLabel={t('search:anime.sort')}
            sortOptions={[
              { value: 'seeders', label: t('search:anime.sortBySeeders') },
              { value: 'date', label: t('search:anime.sortByDate') },
              { value: 'size', label: t('search:anime.sortBySize') },
            ]}
            sortValue={sortBy}
            onSortChange={(value) => changeFilter(setSortBy, value as SortKey)}
            filterLabel={Object.keys(qualityCounts).length > 0 ? t('search:anime.quality') : undefined}
            filterOptions={Object.keys(qualityCounts).length > 0 ? [
              { value: 'all', label: t('search:anime.all') },
              ...Object.entries(qualityCounts).map(([quality, count]) => ({ value: quality, label: quality, count })),
            ] : undefined}
            filterValue={filterQuality}
            onFilterChange={(value) => changeFilter(setFilterQuality, value as FilterQuality)}
            extra={
              <div className="ml-auto flex items-center gap-1">
                <span className="type-micro text-surface-500">{t('search:anime.source')}</span>
                <button
                  type="button"
                  onClick={() => changeFilter(setFilterSource, 'all')}
                  className={`h-5 rounded-md px-1.5 text-[10px] font-medium ${filterSource === 'all' ? 'bg-primary-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200 dark:bg-surface-800/60 dark:text-surface-400'}`}
                >
                  {t('search:anime.all')}
                </button>
                {Object.entries(sourceCounts).map(([source, count]) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => changeFilter(setFilterSource, source as FilterSource)}
                    className={`h-5 rounded-md px-1.5 text-[10px] font-medium ${filterSource === source ? 'bg-primary-500 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200 dark:bg-surface-800/60 dark:text-surface-400'}`}
                  >
                    {source} ({count})
                  </button>
                ))}
              </div>
            }
          />

          <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
            {pagedResources.map((item, index) => (
              <UnifiedResourceCard key={item.magnet || index} item={item} />
            ))}
          </div>

          <Pagination
            page={resPage}
            totalPages={resTotalPages}
            onChange={setResPage}
            prevLabel={t('search:anime.prevPage')}
            nextLabel={t('search:anime.nextPage')}
          />
        </div>
      )}
    </div>
  );
}

// ─── 未归组资源折叠区 ──────────────────────────────────────────────

function UngroupedResourcesSection({ resources }: { resources: AnimeUnifiedResource[] }) {
  const { t } = useTranslation(['search']);
  const [expanded, setExpanded] = useState(false);
  if (resources.length === 0) return null;

  return (
    <PanelSection>
      <PanelHeader
        icon={<Magnet className="h-4 w-4" />}
        title={t('search:anime.unmatchedResources')}
        count={<CountBadge>{t('search:anime.countItems', { count: resources.length })}</CountBadge>}
        onToggle={() => setExpanded(!expanded)}
        expanded={expanded}
        ariaControls="anime-ungrouped-resources"
        actions={expanded ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
      />
      {expanded ? (
        <div id="anime-ungrouped-resources" className="px-4 pb-4 sm:px-5 sm:pb-5">
          <p className="type-micro mb-2 text-surface-400">{t('search:anime.unmatchedHint')}</p>
          <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
            {resources.map((item, index) => (
              <UnifiedResourceCard key={item.magnet || index} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </PanelSection>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

interface AnimeGroupedViewProps {
  data: AnimeEnrichedData;
  isAuthenticated?: boolean;
  isProxyEnabled?: boolean;
  favorites?: FavoriteRef[];
  onToggleFavorite?: (subject: BangumiSubject) => void;
}

export const AnimeGroupedView: React.FC<AnimeGroupedViewProps> = ({
  data,
  isAuthenticated = false,
  isProxyEnabled = false,
  favorites = [],
  onToggleFavorite,
}) => {
  const { t } = useTranslation(['search']);
  const grouped = data.grouped;
  if (!grouped) return null;

  const isBgmFavorited = (url: string) => favorites.some(f => f.url === url);

  // 有资源的分组 + 无资源的分组
  const withResources = grouped.groups.filter(g => g.resources.length > 0);
  const withoutResources = grouped.groups.filter(g => g.resources.length === 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3 sm:px-5">
        <Chip tone="primary" size="xs">{t('search:anime.groupedView')}</Chip>
        <span className="type-meta">{t('search:anime.worksWithResources', { count: withResources.length })}</span>
        {grouped.ungrouped.length > 0 ? (
          <><span className="type-micro text-surface-400">·</span><span className="type-meta">{t('search:anime.unmatchedResourcesCount', { count: grouped.ungrouped.length })}</span></>
        ) : null}
        {withoutResources.length > 0 ? (
          <><span className="type-micro text-surface-400">·</span><span className="type-meta">{t('search:anime.worksWithoutResources', { count: withoutResources.length })}</span></>
        ) : null}
      </div>

      {withResources.length > 0 ? (
        <PanelSection>
          {withResources.map((group, index) => (
            <GroupedSubjectCard
              key={group.subject.id}
              group={group}
              isAuthenticated={isAuthenticated}
              isFavorited={isBgmFavorited(group.subject.url)}
              onToggleFavorite={(subject) => onToggleFavorite?.(subject)}
              isProxyEnabled={isProxyEnabled}
              defaultExpanded={index === 0}
            />
          ))}
        </PanelSection>
      ) : null}

      <UngroupedResourcesSection resources={grouped.ungrouped} />

      {withoutResources.length > 0 ? (
        <PanelSection>
          <PanelHeader
            icon={<Star className="h-4 w-4" />}
            title={t('search:anime.noResourceWorks')}
            count={<CountBadge>{t('search:anime.worksCount', { count: withoutResources.length })}</CountBadge>}
          />
          <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 sm:pb-5 lg:grid-cols-3">
            {withoutResources.map((group) => (
              <MediaCard
                key={group.subject.id}
                cover={group.subject.cover ? getProxyImageUrl(group.subject.cover) : undefined}
                coverFallback={<Star className="h-5 w-5" />}
                coverSize="sm"
                href={isProxyEnabled ? convertToProxyUrl(group.subject.url) : group.subject.url}
                title={group.subject.nameCN || group.subject.name}
                badges={
                  <>
                    {group.subject.rating > 0 ? (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] ${fmt.rating(group.subject.rating)}`}>
                        <Star className="h-2.5 w-2.5 fill-current" />{group.subject.rating.toFixed(1)}
                      </span>
                    ) : null}
                    {isProxyEnabled ? <Chip tone="proxy" size="xs">{t('search:anime.proxyAccessible')}</Chip> : null}
                  </>
                }
              />
            ))}
          </div>
        </PanelSection>
      ) : null}

      {withResources.length === 0 && grouped.ungrouped.length === 0 && withoutResources.length === 0 ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyBlock
            icon={<Magnet className="h-7 w-7" />}
            title={t('search:anime.empty')}
            hint={t('search:anime.emptyHint')}
            className="bg-transparent"
          />
        </div>
      ) : null}
    </div>
  );
};
