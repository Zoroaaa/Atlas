import React, { useState } from 'react';
import { Heart, Download, Trash2, ExternalLink, Clock, Building2, Calendar, User, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Loading, ProxyImage } from '@/components/ui';
import { PanelSection, PanelHeader, Chip, CountBadge, EmptyBlock, Pagination } from '@/components/workbench';
import { convertToProxyUrl } from '@/services/proxy';
import type { FavoriteItem } from '@/types';
import { userApi } from '@/services/api/search';
import { useToast } from '@/components/ui/Toast';
import { getBackendBaseUrl } from '@/constants';

const resolveUrl = (relativePath: string, referenceUrl: string): string => {
  try {
    const base = new URL(referenceUrl);
    return new URL(relativePath, base).href;
  } catch {
    return relativePath;
  }
};

const getProxyImageUrl = (url: string): string => {
  const baseUrl = getBackendBaseUrl();
  return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(url)}`;
};

interface FavoritesPanelProps {
  favorites: FavoriteItem[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  show: boolean;
  isProxyEnabled: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
  onExport: () => void;
  onUpdate: () => void;
}

export const FavoritesPanel: React.FC<FavoritesPanelProps> = ({
  favorites, total, page, totalPages, onPageChange, isLoading, show, isProxyEnabled, onToggle, onRemove, onExport, onUpdate,
}) => {
  const { t } = useTranslation(['search']);
  const toast = useToast();
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const handleStatusChange = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'want' ? 'watched' : 'want';
    setUpdatingStatus(id);
    try {
      const result = await userApi.updateFavoriteStatus(id, newStatus);
      if (result.success) {
        toast.success(t('search:favorites.updateSuccess'));
        onUpdate();
      } else {
        toast.error(result.message || t('search:favorites.updateFailed'));
      }
    } catch (_error) {
      toast.error(t('search:favorites.updateFailed'));
    } finally {
      setUpdatingStatus(null);
    }
  };

  const getStatusText = (status: string) =>
    status === 'want' ? t('search:favorites.statusWant') : t('search:favorites.statusWatched');

  return (
    <PanelSection>
      <PanelHeader
        icon={<Heart className="h-4 w-4 text-accent-500" />}
        title={t('search:favorites.title')}
        count={total > 0 ? <CountBadge>{total}</CountBadge> : undefined}
        onToggle={onToggle}
        expanded={show}
        ariaControls="main-favorites"
        actions={
          <>
            {show && total > 0 ? (
              <button
                type="button"
                onClick={onExport}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-200"
                title={t('search:favorites.export')}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('search:favorites.export')}</span>
              </button>
            ) : null}
            {show ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
          </>
        }
      />

      {show ? (
        <div id="main-favorites">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loading />
            </div>
          ) : favorites.length > 0 ? (
            <div className="divide-y divide-surface-100 px-4 pb-4 dark:divide-surface-800/70 sm:px-5 sm:pb-5">
              {favorites.map((item) => {
                const cover = item.cover
                  ? getProxyImageUrl(resolveUrl(item.cover, item.url))
                  : null;
                return (
                  <div key={item.id} className="flex items-center gap-2.5 py-2.5">
                    {cover ? (
                      <ProxyImage
                        src={cover}
                        alt={item.title}
                        className="h-[76px] w-14 shrink-0 rounded-md bg-surface-100 object-cover"
                      />
                    ) : item.icon ? (
                      <img src={item.icon} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" loading="lazy" />
                    ) : (
                      <div className="flex h-[76px] w-14 shrink-0 items-center justify-center rounded-md bg-surface-100 text-surface-400 dark:bg-surface-800">
                        <Heart className="h-4 w-4" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {item.code ? <Chip tone="primary" truncate>{item.code}</Chip> : null}
                        <span className="truncate text-[12px] font-medium text-surface-900 dark:text-surface-100">
                          {item.title}
                        </span>
                      </div>
                      {item.subtitle ? (
                        <p className="type-micro mt-0.5 truncate text-surface-500">{item.subtitle}</p>
                      ) : null}
                      <div className="type-micro mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-surface-500">
                        {item.status ? (
                          <button
                            type="button"
                            onClick={() => !updatingStatus && handleStatusChange(item.id, item.status!)}
                            disabled={updatingStatus === item.id}
                            className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-medium text-primary-600 transition-opacity hover:opacity-80 disabled:opacity-50 dark:text-primary-300"
                            title={t('search:favorites.toggleTo', { status: getStatusText(item.status === 'want' ? 'watched' : 'want') })}
                          >
                            {item.status === 'want' ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                            {getStatusText(item.status)}
                          </button>
                        ) : null}
                        {item.actors ? (
                          <span className="inline-flex max-w-[120px] items-center gap-0.5 truncate">
                            <User className="h-2.5 w-2.5 shrink-0" />{item.actors}
                          </span>
                        ) : null}
                        {item.duration ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />{t('search:favorites.durationMinutes', { count: item.duration })}
                          </span>
                        ) : null}
                        {item.releaseDate ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Calendar className="h-2.5 w-2.5" />{item.releaseDate}
                          </span>
                        ) : null}
                        {item.publisher ? (
                          <span className="inline-flex max-w-[100px] items-center gap-0.5 truncate">
                            <Building2 className="h-2.5 w-2.5 shrink-0" />{item.publisher}
                          </span>
                        ) : null}
                      </div>
                      {item.tags ? (
                        <div className="type-micro mt-0.5 flex flex-wrap gap-1 text-surface-500">
                          {item.tags.split(',').slice(0, 4).map((tag, index) => (
                            <span key={index}>{tag.trim()}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => window.open(isProxyEnabled ? convertToProxyUrl(item.url) : item.url, '_blank')}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 hover:bg-primary-50 hover:text-primary-500 dark:hover:bg-primary-900/20"
                        aria-label={t('search:favorites.export')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-900/20"
                        aria-label={t('search:favorites.empty')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={onPageChange}
                prevLabel={t('search:favorites.prevPage')}
                nextLabel={t('search:favorites.nextPage')}
                className="border-t border-surface-100 pt-3 dark:border-surface-800/70"
              />
            </div>
          ) : (
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <EmptyBlock
                icon={<Heart className="h-8 w-8" />}
                title={t('search:favorites.empty')}
                className="min-h-[120px] bg-transparent"
              />
            </div>
          )}
        </div>
      ) : null}
    </PanelSection>
  );
};
