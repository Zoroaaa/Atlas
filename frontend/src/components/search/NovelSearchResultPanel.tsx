import React, { useState } from 'react';
import { BookOpen, ExternalLink, Heart, RefreshCw, Download, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FavoriteRef } from '@/types';
import type { NovelItem } from '@/types/search';
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

interface NovelEnrichedData {
  resultType: 'novel';
  keyword: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  novels: NovelItem[];
}

const formatTone = (format: string): ChipTone => {
  const value = format.toUpperCase();
  if (value === 'PDF') return 'danger';
  if (value === 'EPUB') return 'warning';
  if (value === 'MOBI') return 'primary';
  return 'neutral';
};

const NovelItemCard: React.FC<{
  item: NovelItem;
  isAuthenticated: boolean;
  isFavorited: boolean;
  isProxyEnabled: boolean;
  onToggleFavorite: (item: NovelItem) => void;
}> = ({ item, isAuthenticated, isFavorited, isProxyEnabled, onToggleFavorite }) => {
  const { t } = useTranslation(['search']);
  const [descExpanded, setDescExpanded] = useState(false);
  const link = isProxyEnabled ? convertToProxyUrl(item.detailUrl) : item.detailUrl;

  const authorLine = [item.author, item.publisher, item.category].filter(Boolean).join(' · ');

  return (
    <MediaCard
      cover={item.cover ? getProxyImageUrl(item.cover) : undefined}
      coverFallback={<BookOpen className="h-5 w-5" />}
      href={link}
      title={item.title}
      badges={
        <>
          {item.format ? <Chip tone={formatTone(item.format)} size="xs">{item.format}</Chip> : null}
          {item.size ? <Chip tone="neutral" size="xs">{item.size}</Chip> : null}
          {item.year ? <Chip tone="neutral" size="xs">{item.year}</Chip> : null}
          {item.language ? <Chip tone="success" size="xs">{item.language}</Chip> : null}
          {item.source === '奇书网' ? <Chip tone="warning" size="xs">{t('search:novel.sourceQishu')}</Chip> : null}
          {isProxyEnabled ? (
            <Chip tone="proxy" size="xs">
              <ShieldCheck className="h-2.5 w-2.5" />
              {t('search:novel.proxyAccessible')}
            </Chip>
          ) : null}
        </>
      }
      meta={authorLine || undefined}
      description={!descExpanded ? item.description : undefined}
      footer={
        item.description && item.description.length > 80 ? (
          <div>
            {descExpanded ? (
              <p className="text-[11px] leading-relaxed text-surface-500">{item.description}</p>
            ) : null}
            <button
              type="button"
              onClick={() => setDescExpanded((value) => !value)}
              className="mt-0.5 text-[10px] text-primary-500 hover:underline"
            >
              {descExpanded ? t('search:novel.collapse') : t('search:novel.expandAll')}
            </button>
          </div>
        ) : undefined
      }
      actions={
        <>
          {isAuthenticated ? (
            <IconAction
              icon={<Heart className={`h-3.5 w-3.5 ${isFavorited ? 'fill-current' : ''}`} />}
              label={t('search:novel.favorite')}
              tone={isFavorited ? 'danger' : 'default'}
              onClick={() => onToggleFavorite(item)}
            />
          ) : null}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('search:novel.detailDownload')}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-surface-500 transition-colors hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
          >
            <Download className="h-3.5 w-3.5" />
            <ExternalLink className="h-3 w-3" />
          </a>
        </>
      }
    />
  );
};

interface NovelSearchResultPanelProps {
  data: NovelEnrichedData;
  isAuthenticated?: boolean;
  isProxyEnabled?: boolean;
  favorites?: FavoriteRef[];
  onRefresh?: () => void;
  onToggleFavorite?: (item: NovelItem) => void;
  onLoginRequired?: () => void;
}

export const NovelSearchResultPanel: React.FC<NovelSearchResultPanelProps> = ({
  data,
  isAuthenticated = false,
  isProxyEnabled = false,
  favorites = [],
  onRefresh,
  onToggleFavorite,
  onLoginRequired,
}) => {
  const { t } = useTranslation(['search']);
  const [localPage, setLocalPage] = useState(1);
  const PAGE_SIZE = 10;
  const list = data.novels ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = list.slice((localPage - 1) * PAGE_SIZE, localPage * PAGE_SIZE);
  const isFavorited = (id: string) => favorites.some((favorite) => favorite.url?.includes(id));
  const zxcsError = data.errors?.zxcs;
  const xqsError = data.errors?.xqishuta;

  return (
    <PanelSection>
      <Toolbar
        left={<span className="type-meta">{t('search:novel.totalResults', { count: data.total })}</span>}
        right={
          <>
            <ShareToCommunityButton
              postData={{
                postType: 'novel',
                title: data.novels[0]?.title || data.keyword,
                coverImage: data.novels[0]?.cover ? getProxyImageUrl(data.novels[0].cover) : '',
                contentData: JSON.stringify({ keyword: data.keyword, novels: data.novels }),
              }}
              isAuthenticated={isAuthenticated}
              onLoginRequired={onLoginRequired}
              size="small"
            />
            {onRefresh ? (
              <IconAction icon={<RefreshCw className="h-3.5 w-3.5" />} label={t('search:novel.refresh')} onClick={onRefresh} />
            ) : null}
          </>
        }
      />

      <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        {zxcsError ? <Notice tone="warning" className="mb-3">{t('search:novel.zxcsError', { error: zxcsError })}</Notice> : null}
        {xqsError ? <Notice tone="warning" className="mb-3">{t('search:novel.qishuError', { error: xqsError })}</Notice> : null}

        {list.length === 0 && !zxcsError && !xqsError ? (
          <EmptyBlock icon={<BookOpen className="h-7 w-7" />} title={t('search:novel.empty')} className="bg-transparent" />
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paged.map((item) => (
              <NovelItemCard
                key={item.id}
                item={item}
                isAuthenticated={isAuthenticated}
                isFavorited={isFavorited(item.id)}
                isProxyEnabled={isProxyEnabled}
                onToggleFavorite={(novel) => onToggleFavorite?.(novel)}
              />
            ))}
          </div>
        )}

        <Pagination
          page={localPage}
          totalPages={totalPages}
          onChange={setLocalPage}
          prevLabel={t('search:novel.prevPage')}
          nextLabel={t('search:novel.nextPage')}
        />
      </div>
    </PanelSection>
  );
};
