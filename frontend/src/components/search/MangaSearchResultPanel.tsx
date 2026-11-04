import React, { useState } from 'react';
import { BookOpen, ExternalLink, Heart, RefreshCw, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { FavoriteItem } from '@/types';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { convertToProxyUrl } from '@/services/proxy';
import { ShareToCommunityButton } from '@/components/community';
import {
  PanelSection,
  Toolbar,
  MediaCard,
  Chip,
  Pagination,
  Notice,
  EmptyBlock,
  IconAction,
} from '@/components/workbench';
import type { ChipTone } from '@/components/workbench';

interface MangaItem {
  id: string;
  title: string;
  cover: string;
  status: string;
  tags: string[];
}
interface MangaEnrichedData {
  resultType: 'manga';
  keyword: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  manga: MangaItem[];
}

const statusLabel = (t: TFunction, status: string) => {
  const map: Record<string, string> = {
    ongoing: t('search:manga.status.ongoing'),
    completed: t('search:manga.status.completed'),
    hiatus: t('search:manga.status.hiatus'),
    cancelled: t('search:manga.status.cancelled'),
  };
  return map[status] || status;
};

const statusTone = (status: string): ChipTone => (status === 'ongoing' ? 'success' : 'neutral');

interface MangaSearchResultPanelProps {
  data: MangaEnrichedData;
  isAuthenticated?: boolean;
  isProxyEnabled?: boolean;
  favorites?: FavoriteItem[];
  onRefresh?: () => void;
  onPageChange?: (page: number) => void;
  onToggleFavorite?: (item: MangaItem) => void;
  onLoginRequired?: () => void;
}

export const MangaSearchResultPanel: React.FC<MangaSearchResultPanelProps> = ({
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
  const PAGE_SIZE = 10;
  const list = data.manga ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = list.slice((localPage - 1) * PAGE_SIZE, localPage * PAGE_SIZE);
  const isFavorited = (id: string) => favorites.some((favorite) => favorite.url?.includes(id));
  const hasError = !!data.errors?.mangadex;

  return (
    <PanelSection>
      <Toolbar
        left={<span className="type-meta">{t('search:manga.totalResults', { count: data.total })}</span>}
        right={
          <>
            <ShareToCommunityButton
              postData={{
                postType: 'manga',
                title: data.manga[0]?.title || data.keyword,
                coverImage: data.manga[0]?.cover ? getProxyImageUrl(data.manga[0].cover) : '',
                contentData: JSON.stringify({ keyword: data.keyword, manga: data.manga }),
              }}
              isAuthenticated={isAuthenticated}
              onLoginRequired={onLoginRequired}
              size="small"
            />
            {onRefresh ? (
              <IconAction icon={<RefreshCw className="h-3.5 w-3.5" />} label={t('search:manga.refresh')} onClick={onRefresh} />
            ) : null}
          </>
        }
      />

      <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        {hasError ? (
          <Notice tone="error" className="mb-3">{t('search:manga.mangadexError', { error: data.errors.mangadex })}</Notice>
        ) : null}

        {list.length === 0 && !hasError ? (
          <EmptyBlock icon={<BookOpen className="h-7 w-7" />} title={t('search:manga.empty')} className="bg-transparent" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paged.map((item) => {
              const mangaUrl = `https://mangadex.org/title/${item.id}`;
              const href = isProxyEnabled ? convertToProxyUrl(mangaUrl) : mangaUrl;
              return (
                <MediaCard
                  key={item.id}
                  cover={item.cover ? getProxyImageUrl(item.cover) : undefined}
                  coverFallback={<BookOpen className="h-5 w-5" />}
                  href={href}
                  title={item.title}
                  badges={
                    <>
                      <Chip tone={statusTone(item.status)} size="xs">{statusLabel(t, item.status)}</Chip>
                      {isProxyEnabled ? (
                        <Chip tone="proxy" size="xs">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          {t('search:manga.proxyAccessible')}
                        </Chip>
                      ) : null}
                    </>
                  }
                  meta={item.tags.length > 0 ? item.tags.slice(0, 3).join(' · ') : undefined}
                  actions={
                    <>
                      {isAuthenticated ? (
                        <IconAction
                          icon={<Heart className={`h-3.5 w-3.5 ${isFavorited(item.id) ? 'fill-current' : ''}`} />}
                          label={t('search:manga.favorite')}
                          tone={isFavorited(item.id) ? 'danger' : 'default'}
                          onClick={() => onToggleFavorite?.(item)}
                        />
                      ) : null}
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('search:manga.refresh')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition-colors hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </>
                  }
                />
              );
            })}
          </div>
        )}

        <Pagination
          page={localPage}
          totalPages={totalPages}
          onChange={setLocalPage}
          prevLabel={t('search:manga.prevPage')}
          nextLabel={t('search:manga.nextPage')}
        />

        {onPageChange && list.length >= 20 && localPage >= totalPages ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => onPageChange(data.page + 1)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[11px] text-primary-600 transition-colors hover:bg-primary-50 dark:hover:bg-primary-900/20"
            >
              {t('search:manga.loadMore')}
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
    </PanelSection>
  );
};
