import React, { useState } from 'react';
import {
  Star, Calendar, Tv, ExternalLink,
  Magnet, Wifi, RefreshCw,
  Tag, Heart, Users, Trophy, Film, ShieldCheck,
  LayoutGrid, List,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  AnimeEnrichedData,
  BangumiSubject,
  MikanItem,
  NyaaTorrent,
  ShowRssItem,
} from '@/types/search';
import type { FavoriteRef } from '@/types';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareToCommunityButton } from '@/components/community';
import { getProxyImageUrl } from '@/utils/imageProxy';
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
import type { ChipTone } from '@/components/workbench';
import { AnimeGroupedView } from './AnimeGroupedView';

const fmt = {
  seedColor: (n: number) =>
    n >= 10 ? 'text-success-400' : n >= 1 ? 'text-warning-400' : 'text-error-400',
  rating: (n: number) =>
    n >= 8 ? 'text-success-400' : n >= 6 ? 'text-warning-400' : 'text-surface-400',
};

const typeLabel = (t: TFunction, tf?: string | number) => {
  const map: Record<string | number, string> = {
    2: 'TV',
    6: t('search:anime.type.movie'),
    4: 'Web',
    3: t('search:anime.type.music'),
    tv: 'TV',
    movie: t('search:anime.type.movie'),
    ova: 'OVA',
    web: 'Web',
    music: t('search:anime.type.music'),
  };
  return tf != null ? (map[tf] ?? String(tf)) : '';
};

function NyaaCard({ item }: { item: NyaaTorrent }) {
  const { t } = useTranslation(['search']);
  return (
    <ResourceRow
      badges={
        <>
          {item.trusted ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-400" title={t('search:anime.trustedUploader')} /> : null}
          {item.source === 'nyaa' ? <Chip tone="source" size="xs">Nyaa</Chip> : null}
        </>
      }
      quality={
        item.title.toLowerCase().includes('2160') || item.title.toLowerCase().includes('4k')
          ? <Chip tone="warning" size="xs">4K</Chip>
          : item.title.toLowerCase().includes('1080')
            ? <Chip tone="source" size="xs">HD</Chip>
            : undefined
      }
      title={
        <a href={item.magnet} className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400" title={t('search:anime.btDownloadHint', { title: item.title })}>
          {item.title}
        </a>
      }
      meta={[item.category, item.size, item.date].filter(Boolean) as React.ReactNode[]}
      trailing={
        <>
          {item.hasSeedData === false ? (
            <Chip tone="neutral" size="xs" className="mr-1">{t('search:anime.dhtHint')}</Chip>
          ) : (
            <span className={`mr-1 text-[11px] font-medium tabular-nums ${fmt.seedColor(item.seeders)}`}>
              {item.seeders}<span className="mx-0.5 text-surface-400">/</span><span className="text-error-400">{item.leechers}</span>
            </span>
          )}
          <CopyButton text={item.magnet} label={t('search:anime.copyMagnet')} />
        </>
      }
    />
  );
}

function MikanCard({ item }: { item: MikanItem }) {
  const { t } = useTranslation(['search']);
  return (
    <ResourceRow
      badges={
        <>
          <Chip tone="source" size="xs">Mikan</Chip>
          {item.group ? <Chip tone="neutral" size="xs">{item.group}</Chip> : null}
        </>
      }
      title={
        item.magnet ? (
          <a href={item.magnet} className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400" title={t('search:anime.btDownloadHint', { title: item.title })}>
            {item.title}
          </a>
        ) : (
          <span className="block truncate text-[12px] text-surface-700 dark:text-surface-300" title={item.title}>{item.title}</span>
        )
      }
      meta={[item.size, item.pubDate].filter(Boolean) as React.ReactNode[]}
      trailing={item.magnet ? <CopyButton text={item.magnet} label={t('search:anime.copyMagnet')} /> : undefined}
    />
  );
}

function ShowRssCard({ item }: { item: ShowRssItem }) {
  const { t } = useTranslation(['search']);
  return (
    <ResourceRow
      badges={<Chip tone="source" size="xs">SR</Chip>}
      title={
        item.magnet ? (
          <a href={item.magnet} className="block truncate text-[12px] text-primary-600 hover:underline dark:text-primary-400" title={t('search:anime.btDownloadHint', { title: item.title })}>
            {item.title}
          </a>
        ) : (
          <span className="block truncate text-[12px] text-surface-700 dark:text-surface-300" title={item.title}>{item.title}</span>
        )
      }
      trailing={item.magnet ? <CopyButton text={item.magnet} label={t('search:anime.copyMagnet')} /> : undefined}
    />
  );
}

const BangumiCard: React.FC<{
  subject: BangumiSubject;
  isAuthenticated: boolean;
  isFavorited: boolean;
  onToggleFavorite: (subject: BangumiSubject) => void;
  isProxyEnabled: boolean;
}> = ({ subject, isAuthenticated, isFavorited, onToggleFavorite, isProxyEnabled }) => {
  const { t } = useTranslation(['search']);
  const href = isProxyEnabled ? convertToProxyUrl(subject.url) : subject.url;

  const typeTone = (value?: string | number): ChipTone => {
    if (value == null) return 'neutral';
    if (value === 4 || value === 'web') return 'success';
    if (value === 3 || value === 'music') return 'accent';
    if (value === 'ova') return 'neutral';
    return 'warning';
  };
  const statusTone = (value?: string): ChipTone => {
    if (value === '连载中') return 'success';
    if (value === '未开播') return 'warning';
    return 'neutral';
  };

  return (
    <MediaCard
      cover={subject.cover ? getProxyImageUrl(subject.cover) : undefined}
      coverFallback={<Film className="h-5 w-5" />}
      href={href}
      title={subject.nameCN || subject.name}
      originalTitle={subject.nameCN && subject.name !== subject.nameCN ? subject.name : undefined}
      badges={
        <>
          {subject.type ? <Chip tone={typeTone(subject.type)} size="xs">{typeLabel(t, subject.type)}</Chip> : null}
          {subject.status ? <Chip tone={statusTone(subject.status)} size="xs">{subject.status}</Chip> : null}
          {subject.rank && subject.rank > 0 && subject.rank <= 1000 ? (
            <Chip tone="warning" size="xs">
              <Trophy className="h-2.5 w-2.5" />#{subject.rank}
            </Chip>
          ) : null}
          {isProxyEnabled ? (
            <Chip tone="proxy" size="xs">
              <ShieldCheck className="h-2.5 w-2.5" />
              {t('search:anime.proxy')}
            </Chip>
          ) : null}
        </>
      }
      meta={
        <>
          {subject.rating > 0 ? (
            <span className={`mr-2 inline-flex items-center gap-0.5 font-medium ${fmt.rating(subject.rating)}`}>
              <Star className="h-2.5 w-2.5 fill-current" />
              {subject.rating.toFixed(1)}
              {subject.ratingCount ? <span className="font-normal text-surface-400">({subject.ratingCount})</span> : null}
            </span>
          ) : null}
          {subject.collection?.collect ? (
            <span className="mr-2 inline-flex items-center gap-0.5">
              <Heart className="h-2.5 w-2.5 text-error-400" />
              {(subject.collection.collect / 1000).toFixed(1)}k
            </span>
          ) : null}
          {subject.collection?.doing ? (
            <span className="mr-2 inline-flex items-center gap-0.5">
              <Users className="h-2.5 w-2.5 text-primary-400" />{subject.collection.doing}
            </span>
          ) : null}
          {subject.eps ? (
            <span className="mr-2 inline-flex items-center gap-0.5">
              <Tv className="h-2.5 w-2.5" />{t('search:anime.epsCount', { count: subject.eps })}
            </span>
          ) : null}
          {subject.airDate ? (
            <span className="mr-2 inline-flex items-center gap-0.5">
              <Calendar className="h-2.5 w-2.5" />{subject.airDate.slice(0, 7)}
            </span>
          ) : null}
          {subject.studio ? <span className="inline-flex items-center gap-0.5 truncate">{subject.studio}</span> : null}
        </>
      }
      description={subject.summary}
      footer={
        subject.tags && subject.tags.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {subject.tags.slice(0, 5).map((tag) => (
              <Chip key={tag} tone="neutral" size="xs">
                <Tag className="h-2.5 w-2.5" />{tag}
              </Chip>
            ))}
          </div>
        ) : undefined
      }
      actions={
        <>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => onToggleFavorite(subject)}
              aria-label={isFavorited ? t('search:anime.unfavorite') : t('search:anime.favorite')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                isFavorited
                  ? 'bg-error-50 text-error-500 dark:bg-error-900/20'
                  : 'text-surface-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-900/20'
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${isFavorited ? 'fill-current' : ''}`} />
            </button>
          ) : null}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('search:anime.more')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition-colors hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </>
      }
    />
  );
};

interface AnimeSearchResultPanelProps {
  data: AnimeEnrichedData;
  isAuthenticated?: boolean;
  isProxyEnabled?: boolean;
  favorites?: FavoriteRef[];
  onRefresh?: () => void;
  onPageChange?: (page: number) => void;
  onToggleFavorite?: (subject: BangumiSubject) => void;
  onLoginRequired?: () => void;
}

export const AnimeSearchResultPanel: React.FC<AnimeSearchResultPanelProps> = ({
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
  const [localPage, setLocalPage] = useState(1);
  const [atosPage, setAtosPage] = useState(1);
  const [mikanPage, setMikanPage] = useState(1);
  const [srPage, setSrPage] = useState(1);
  const SOURCE_PAGE_SIZE = 10;
  const PAGE_SIZE = 10;

  const hasGrouped = !!(data.grouped && (data.grouped.groups.some((group) => group.resources.length > 0) || data.grouped.ungrouped.length > 0));
  const [viewMode, setViewMode] = useState<'grouped' | 'sources'>(hasGrouped ? 'grouped' : 'sources');

  const bgmList = data.bgm ?? [];
  const nyaaList = data.nyaa ?? [];
  const atosList = data.animetosho ?? [];
  const mikanList = data.mikan ?? [];
  const showrssList = data.showrss ?? [];
  const hasResults = nyaaList.length > 0 || atosList.length > 0 || mikanList.length > 0 || showrssList.length > 0;

  const isBgmFavorited = (url: string) => favorites.some((favorite) => favorite.url === url);

  const totalPages = Math.max(1, Math.ceil(nyaaList.length / PAGE_SIZE));
  const pagedTorrents = nyaaList.slice((localPage - 1) * PAGE_SIZE, localPage * PAGE_SIZE);

  const hasBgmError = !!data.errors?.bangumi;
  const hasNyaaError = !!data.errors?.nyaa;
  const hasAtosError = !!data.errors?.animetosho;
  const hasMikanError = !!data.errors?.mikan;
  const hasSrError = !!data.errors?.showrss;

  const errorNotices = [
    data.errors?.bangumi ? { key: 'bangumi', text: t('search:anime.bangumiError', { error: data.errors.bangumi }) } : null,
    data.errors?.nyaa ? { key: 'nyaa', text: t('search:anime.nyaaError', { error: data.errors.nyaa }) } : null,
    data.errors?.animetosho ? { key: 'animetosho', text: t('search:anime.animetoshoError', { error: data.errors.animetosho }) } : null,
    data.errors?.mikan ? { key: 'mikan', text: t('search:anime.mikanError', { error: data.errors.mikan }) } : null,
    data.errors?.showrss ? { key: 'showrss', text: t('search:anime.showrssError', { error: data.errors.showrss }) } : null,
  ].filter(Boolean) as { key: string; text: string }[];

  return (
    <div>
      <PanelSection>
        <Toolbar
          left={
            <>
              {hasResults ? (
                <>
                  <Chip tone="primary" size="xs">{t('search:anime.multiSource')}</Chip>
                  <span className="type-meta">{t('search:anime.totalResources', { count: data.total })}</span>
                  {nyaaList.length > 0 ? <Chip tone="source" size="xs">Nyaa {nyaaList.length}</Chip> : null}
                  {atosList.length > 0 ? <Chip tone="source" size="xs">AT {atosList.length}</Chip> : null}
                  {mikanList.length > 0 ? <Chip tone="source" size="xs">Mikan {mikanList.length}</Chip> : null}
                  {showrssList.length > 0 ? <Chip tone="source" size="xs">SR {showrssList.length}</Chip> : null}
                </>
              ) : (
                <span className="type-meta">{t('search:anime.magnetTotal', { count: data.total })}</span>
              )}
            </>
          }
          right={
            <>
              {onRefresh ? (
                <>
                  <ShareToCommunityButton
                    postData={{
                      postType: 'anime',
                      title: data.bgm[0]?.nameCN || data.keyword,
                      coverImage: data.bgm[0]?.cover ? getProxyImageUrl(data.bgm[0].cover) : '',
                      contentData: JSON.stringify({
                        keyword: data.keyword,
                        bgm: data.bgm,
                        nyaa: data.nyaa,
                        mikan: data.mikan,
                        animetosho: data.animetosho,
                        showrss: data.showrss,
                      }),
                    }}
                    isAuthenticated={isAuthenticated}
                    onLoginRequired={onLoginRequired}
                    size="small"
                  />
                  <IconAction icon={<RefreshCw className="h-3.5 w-3.5" />} label={t('search:anime.refresh')} onClick={onRefresh} />
                </>
              ) : null}
              {hasGrouped ? (
                <Segmented
                  value={viewMode}
                  onChange={setViewMode}
                  ariaLabel={t('search:anime.groupedViewTitle')}
                  options={[
                    { value: 'grouped', label: t('search:anime.grouped'), icon: <LayoutGrid className="h-3 w-3" /> },
                    { value: 'sources', label: t('search:anime.sourcesView'), icon: <List className="h-3 w-3" /> },
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

      {!hasResults && bgmList.length === 0 && !hasBgmError && !hasNyaaError && !hasAtosError && !hasMikanError && !hasSrError ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyBlock
            icon={<Wifi className="h-7 w-7" />}
            title={t('search:anime.empty')}
            hint={t('search:anime.emptyHint')}
            className="bg-transparent"
          />
        </div>
      ) : null}

      {viewMode === 'grouped' && hasGrouped ? (
        <AnimeGroupedView
          data={data}
          isAuthenticated={isAuthenticated}
          isProxyEnabled={isProxyEnabled}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
        />
      ) : null}

      {viewMode === 'sources' ? (
        <>
          <PanelSection>
            <PanelHeader
              icon={<Star className="h-4 w-4" />}
              title={t('search:anime.bangumiEntry')}
              count={bgmList.length > 0 ? <CountBadge>{bgmList.length}</CountBadge> : undefined}
              actions={
                <a
                  href={`https://bgm.tv/search/${encodeURIComponent(data.keyword)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="type-micro text-primary-500 hover:underline"
                >
                  {t('search:anime.more')}
                </a>
              }
            />
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              {bgmList.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {bgmList.map((subject) => (
                    <BangumiCard
                      key={subject.id}
                      subject={subject}
                      isAuthenticated={isAuthenticated}
                      isFavorited={isBgmFavorited(subject.url)}
                      onToggleFavorite={(item) => onToggleFavorite?.(item)}
                      isProxyEnabled={isProxyEnabled}
                    />
                  ))}
                </div>
              ) : hasBgmError ? null : (
                <EmptyBlock
                  icon={<Star className="h-7 w-7" />}
                  title={t('search:anime.noBangumiEntry')}
                  className="bg-transparent"
                />
              )}
            </div>
          </PanelSection>

          <PanelSection>
            <PanelHeader
              icon={<Magnet className="h-4 w-4 text-accent-500" />}
              title={t('search:anime.magnetTotal', { count: data.total })}
            />
            <div className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
              {nyaaList.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between border-b border-surface-100 pb-1 dark:border-surface-800/70">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-surface-800 dark:text-surface-200">Nyaa</span>
                      <CountBadge>{nyaaList.length}</CountBadge>
                    </div>
                    <a href={`https://nyaa.si/?f=0&c=1_0&q=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="type-micro text-primary-500 hover:underline">
                      {t('search:anime.nyaaSearch')}
                    </a>
                  </div>
                  <div>{pagedTorrents.map((item, index) => <NyaaCard key={item.id || index} item={item} />)}</div>
                  <Pagination
                    page={localPage}
                    totalPages={totalPages}
                    onChange={setLocalPage}
                    prevLabel={t('search:anime.prevPage')}
                    nextLabel={t('search:anime.nextPage')}
                    totalLabel={t('search:anime.totalCount', { count: nyaaList.length })}
                  />
                </div>
              ) : null}

              {atosList.length > 0 ? (() => {
                const atosTotalPages = Math.max(1, Math.ceil(atosList.length / SOURCE_PAGE_SIZE));
                const pagedAtos = atosList.slice((atosPage - 1) * SOURCE_PAGE_SIZE, atosPage * SOURCE_PAGE_SIZE);
                return (
                  <div className="border-t border-surface-100 pt-2 dark:border-surface-800/70">
                    <div className="flex items-center justify-between border-b border-surface-100 pb-1 dark:border-surface-800/70">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-surface-800 dark:text-surface-200">AnimeTosho</span>
                        <CountBadge>{atosList.length}</CountBadge>
                      </div>
                      <a href={`https://feed.animetosho.org/json?filter=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="type-micro text-primary-500 hover:underline">
                        {t('search:anime.atSearch')}
                      </a>
                    </div>
                    <div>{pagedAtos.map((item, index) => <NyaaCard key={(item as NyaaTorrent).id || `atos-${index}`} item={item as NyaaTorrent} />)}</div>
                    <Pagination
                      page={atosPage}
                      totalPages={atosTotalPages}
                      onChange={setAtosPage}
                      prevLabel={t('search:anime.prevPage')}
                      nextLabel={t('search:anime.nextPage')}
                      totalLabel={t('search:anime.totalCount', { count: atosList.length })}
                    />
                  </div>
                );
              })() : null}

              {mikanList.length > 0 ? (() => {
                const mikanTotalPages = Math.max(1, Math.ceil(mikanList.length / SOURCE_PAGE_SIZE));
                const pagedMikan = mikanList.slice((mikanPage - 1) * SOURCE_PAGE_SIZE, mikanPage * SOURCE_PAGE_SIZE);
                return (
                  <div className="border-t border-surface-100 pt-2 dark:border-surface-800/70">
                    <div className="flex items-center justify-between border-b border-surface-100 pb-1 dark:border-surface-800/70">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-surface-800 dark:text-surface-200">Mikan</span>
                        <CountBadge>{mikanList.length}</CountBadge>
                      </div>
                      <a href={`https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(data.keyword)}`} target="_blank" rel="noopener noreferrer" className="type-micro text-primary-500 hover:underline">
                        {t('search:anime.mikanSearch')}
                      </a>
                    </div>
                    <div>{pagedMikan.map((item, index) => <MikanCard key={index} item={item} />)}</div>
                    <Pagination
                      page={mikanPage}
                      totalPages={mikanTotalPages}
                      onChange={setMikanPage}
                      prevLabel={t('search:anime.prevPage')}
                      nextLabel={t('search:anime.nextPage')}
                      totalLabel={t('search:anime.totalCount', { count: mikanList.length })}
                    />
                  </div>
                );
              })() : null}

              {showrssList.length > 0 ? (() => {
                const srTotalPages = Math.max(1, Math.ceil(showrssList.length / SOURCE_PAGE_SIZE));
                const pagedSr = showrssList.slice((srPage - 1) * SOURCE_PAGE_SIZE, srPage * SOURCE_PAGE_SIZE);
                return (
                  <div className="border-t border-surface-100 pt-2 dark:border-surface-800/70">
                    <div className="flex items-center justify-between border-b border-surface-100 pb-1 dark:border-surface-800/70">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-surface-800 dark:text-surface-200">ShowRSS</span>
                        <CountBadge>{showrssList.length}</CountBadge>
                      </div>
                      <a href="https://showrss.info" target="_blank" rel="noopener noreferrer" className="type-micro text-primary-500 hover:underline">
                        {t('search:anime.showrssSearch')}
                      </a>
                    </div>
                    <div>{pagedSr.map((item, index) => <ShowRssCard key={index} item={item} />)}</div>
                    <Pagination
                      page={srPage}
                      totalPages={srTotalPages}
                      onChange={setSrPage}
                      prevLabel={t('search:anime.prevPage')}
                      nextLabel={t('search:anime.nextPage')}
                      totalLabel={t('search:anime.totalCount', { count: showrssList.length })}
                    />
                  </div>
                );
              })() : null}

              {!hasResults ? (
                <EmptyBlock
                  icon={<Magnet className="h-7 w-7" />}
                  title={t('search:anime.noMagnetResources')}
                  hint={t('search:anime.noMagnetHint')}
                  className="bg-transparent"
                />
              ) : null}

              {onPageChange && nyaaList.length >= 60 && localPage >= totalPages ? (
                <div className="flex justify-center gap-2 py-1">
                  <button
                    type="button"
                    disabled={data.page <= 1}
                    onClick={() => onPageChange(data.page - 1)}
                    className="inline-flex h-8 items-center rounded-lg bg-primary-100 px-3 text-[11px] text-primary-700 transition-colors hover:bg-primary-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-primary-900/40 dark:text-primary-300"
                  >
                    {t('search:anime.prevBatch')}
                  </button>
                  <span className="type-micro flex items-center px-2 text-surface-500">{t('search:anime.batchNumber', { count: data.page })}</span>
                  <button
                    type="button"
                    onClick={() => onPageChange(data.page + 1)}
                    className="inline-flex h-8 items-center rounded-lg bg-primary-100 px-3 text-[11px] text-primary-700 transition-colors hover:bg-primary-200 dark:bg-primary-900/40 dark:text-primary-300"
                  >
                    {t('search:anime.nextBatch')}
                  </button>
                </div>
              ) : null}
            </div>
          </PanelSection>
        </>
      ) : null}
    </div>
  );
};
