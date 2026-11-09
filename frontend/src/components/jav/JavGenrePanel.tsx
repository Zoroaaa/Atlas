import React, { useState } from 'react';
import { Tags, RefreshCw, Loader2, ChevronDown, ChevronRight, Film } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useGenreRecommendations, useGenreWorks } from '@/hooks';
import { getProxyImageUrl } from '@/utils/imageProxy';
import {
  PanelSection,
  PanelHeader,
  MediaCard,
  Chip,
  CountBadge,
  IconAction,
} from '@/components/workbench';
import { Tooltip } from '@/components/ui';
import type { GenreRecTag } from '@/types';

interface JavGenrePanelProps {
  onCodeClick: (code: string) => void;
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[10px] bg-surface-50/60 p-2.5 dark:bg-surface-900/40">
      <div className="skeleton aspect-[3/2] w-full" />
      <div className="skeleton mt-2 h-3 w-4/5" />
    </div>
  );
}

function TagSkeleton() {
  return (
    <div className="flex flex-wrap gap-1.5" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          className="skeleton h-5 rounded-md"
          style={{ width: `${52 + (index % 4) * 16}px` }}
        />
      ))}
    </div>
  );
}

export const JavGenrePanel: React.FC<JavGenrePanelProps> = ({ onCodeClick }) => {
  const { t } = useTranslation(['jav']);
  const { isAuthenticated } = useAuthStore();
  const [expanded, setExpanded] = useState(true);
  const [activeTag, setActiveTag] = useState<GenreRecTag | null>(null);

  const tagsQuery = useGenreRecommendations();
  const worksQuery = useGenreWorks(activeTag?.key ?? null);

  if (!isAuthenticated) return null;

  const tags = tagsQuery.data?.tags ?? [];
  const isNewUser = tagsQuery.data?.isNewUser ?? false;

  // 词典为空 / 同步失败 / 接口失败：整栏不渲染，不留空壳
  if (tags.length === 0 && (tagsQuery.isError || !tagsQuery.isLoading)) return null;

  const handleRefreshTags = () => {
    setActiveTag(null);
    tagsQuery.refresh();
  };

  const works = worksQuery.data;
  const noMore = Boolean(works) && works!.maxPage <= 1;

  return (
    <PanelSection>
      <PanelHeader
        icon={<Tags className="h-4 w-4" />}
        title={t('jav:genreRec.title')}
        count={tags.length > 0 ? <CountBadge>{tags.length}</CountBadge> : undefined}
        info={
          <Tooltip
            content={isNewUser ? t('jav:genreRec.introRandom') : t('jav:genreRec.intro')}
            label={t('jav:panelInfo.show')}
          />
        }
        onToggle={() => setExpanded((value) => !value)}
        expanded={expanded}
        ariaControls="main-jav-genres"
        actions={
          <>
            <IconAction
              icon={tagsQuery.isFetching
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              label={t('jav:genreRec.refreshTags')}
              onClick={handleRefreshTags}
              disabled={tagsQuery.isFetching}
            />
            {expanded
              ? <ChevronDown className="h-4 w-4 text-surface-400" />
              : <ChevronRight className="h-4 w-4 text-surface-400" />}
          </>
        }
      />

      {expanded ? (
        <div id="main-jav-genres" className="px-4 pb-4 sm:px-5 sm:pb-5">
          {tagsQuery.isLoading ? (
            <TagSkeleton />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('jav:genreRec.title')}>
              {tags.map((tag) => {
                const active = activeTag?.key === tag.key;
                return (
                  <button
                    key={tag.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveTag((prev) => (prev?.key === tag.key ? null : tag))}
                    className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    <Chip
                      tone={active ? 'primary' : 'neutral'}
                      size="sm"
                      className={clsx(active && 'ring-1 ring-primary-500')}
                    >
                      {tag.name}
                      {tag.source === 'personal' ? (
                        <span className={clsx('text-[9px]', active ? 'opacity-80' : 'opacity-60')}>
                          {t('jav:genreRec.badgeFrequent')}
                        </span>
                      ) : null}
                    </Chip>
                  </button>
                );
              })}
            </div>
          )}

          {activeTag ? (
            <div className="mt-3 border-t border-surface-100 pt-3 dark:border-surface-800/70">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Chip tone="primary" size="sm" truncate>{activeTag.name}</Chip>
                  {noMore ? (
                    <span className="type-micro shrink-0 text-surface-400">{t('jav:genreRec.noMore')}</span>
                  ) : null}
                </div>
                <IconAction
                  icon={worksQuery.isFetching
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                  label={t('jav:genreRec.refreshWorks')}
                  onClick={worksQuery.refresh}
                  disabled={worksQuery.isFetching || noMore}
                />
              </div>

              {worksQuery.isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={index} />)}
                </div>
              ) : worksQuery.isError ? (
                <p className="type-meta py-4 text-center">
                  <button
                    type="button"
                    onClick={worksQuery.refresh}
                    className="text-primary-600 hover:underline dark:text-primary-300"
                  >
                    {t('jav:genreRec.retry')}
                  </button>
                </p>
              ) : (works?.items.length ?? 0) === 0 ? (
                <p className="type-meta py-4 text-center">{t('jav:genreRec.empty')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {works!.items.map((item) => (
                    <MediaCard
                      key={item.code}
                      orientation="tile"
                      coverAspect="auto"
                      cover={item.cover ? getProxyImageUrl(item.cover) : undefined}
                      coverFallback={<Film className="h-6 w-6" />}
                      title={item.title || item.code}
                      badges={
                        <>
                          <Chip tone="neutral" size="xs">{item.code}</Chip>
                          {item.isFavorite
                            ? <Chip tone="success" size="xs">{t('jav:genreRec.badgeFavorited')}</Chip>
                            : null}
                        </>
                      }
                      meta={item.date ? <span className="truncate">{item.date}</span> : undefined}
                      onSelect={() => onCodeClick(item.code)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </PanelSection>
  );
};
