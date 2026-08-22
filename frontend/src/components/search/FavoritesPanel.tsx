import React, { useState } from 'react';
import { Heart, Download, Trash2, ExternalLink, Tag, ChevronDown, ChevronRight, Clock, Building2, Calendar, User, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Loading, ProxyImage } from '@/components/ui';
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

// ─── 收藏面板高度 ───────────────────────────────────────────────────
const FAV_HEADER = 64;
const FAV_EXPANDED = 800;

interface FavoritesPanelProps {
  favorites: FavoriteItem[];
  isLoading: boolean;
  show: boolean;
  isProxyEnabled: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
  onExport: () => void;
  onUpdate: () => void;
}

export const FavoritesPanel: React.FC<FavoritesPanelProps> = ({
  favorites, isLoading, show, isProxyEnabled, onToggle, onRemove, onExport, onUpdate,
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

  const getStatusText = (status: string) => {
    return status === 'want' ? t('search:favorites.statusWant') : t('search:favorites.statusWatched');
  };

  const getStatusColor = (status: string) => {
    return status === 'want' 
      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30' 
      : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30';
  };

  return (
    <div
      className="collapsible-section animate-fade-in transition-all duration-300 overflow-hidden"
      style={{ animationDelay: '150ms', height: show ? FAV_EXPANDED : FAV_HEADER }}
    >
      {/* Header */}
      <button onClick={onToggle} className="collapsible-header shrink-0" style={{ height: FAV_HEADER }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">{t('search:favorites.title')}</span>
          {favorites.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded-full">
              {favorites.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {show && favorites.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onExport(); }}
              className="p-1 sm:p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all"
              title={t('search:favorites.export')}
            >
              <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          )}
          {show
            ? <ChevronDown className="w-4 h-4 text-surface-400" />
            : <ChevronRight className="w-4 h-4 text-surface-400" />}
        </div>
      </button>

      {/* 内容区：固定剩余高度，列表内部滚动 */}
      <div
        className="collapsible-content flex flex-col overflow-hidden"
        style={{ height: show ? FAV_EXPANDED - FAV_HEADER : 0 }}
      >
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loading />
          </div>
        ) : favorites.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 sm:p-4">
            <div className="space-y-1.5 sm:space-y-2">
              {favorites.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 p-2.5 sm:p-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-all border border-surface-100 dark:border-surface-800"
                >
                  <div className="flex gap-3">
                    {item.cover ? (
                      <ProxyImage
                        src={getProxyImageUrl(resolveUrl(item.cover, item.url))}
                        alt={item.title}
                        className="w-36 h-24 sm:w-44 sm:h-28 object-cover rounded-md flex-shrink-0"
                      />
                    ) : item.icon ? (
                      <img src={item.icon} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-contain flex-shrink-0" loading="lazy" />
                    ) : null}
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2 py-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.status && (
                          <button
                            onClick={() => !updatingStatus && handleStatusChange(item.id, item.status!)}
                            disabled={updatingStatus === item.id}
                            className={`text-xs font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all ${
                              updatingStatus === item.id 
                                ? 'opacity-50 cursor-not-allowed' 
                                : 'hover:opacity-80 cursor-pointer'
                            } ${getStatusColor(item.status)}`}
                            title={updatingStatus === item.id ? t('search:favorites.updating') : t('search:favorites.toggleTo', { status: getStatusText(item.status === 'want' ? 'watched' : 'want') })}
                          >
                            {item.status === 'want' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {getStatusText(item.status)}
                          </button>
                        )}
                        {item.code && (
                          <span className="text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded">
                            {item.code}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-2 shrink-0">
                        <button
                          onClick={() => window.open(isProxyEnabled ? convertToProxyUrl(item.url) : item.url, '_blank')}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onRemove(item.id)}
                          className="p-1.5 rounded-lg text-surface-400 hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 pl-0">
                    <p className="text-sm font-medium text-surface-900 dark:text-surface-100 break-words">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-xs text-surface-500 truncate">{item.subtitle}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {item.actors && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <User className="w-3 h-3" />
                          {item.actors}
                        </span>
                      )}
                      {item.duration && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <Clock className="w-3 h-3" />
                          {t('search:favorites.durationMinutes', { count: item.duration })}
                        </span>
                      )}
                      {item.releaseDate && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <Calendar className="w-3 h-3" />
                          {item.releaseDate}
                        </span>
                      )}
                      {item.publisher && (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <Building2 className="w-3 h-3" />
                          {item.publisher}
                        </span>
                      )}
                    </div>
                    {(item.tags || (item.keyword && !item.code)) && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {item.tags && (
                          <>
                            {item.tags.split(',').slice(0, 6).map((tag, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
                                  {tag.trim()}
                              </span>
                            ))}
                          </>
                        )}
                        {item.keyword && !item.code && (
                          <span className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded truncate max-w-[150px]">
                            <Tag className="w-3 h-3" />
                            {item.keyword}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <Heart className="w-6 h-6 sm:w-8 sm:h-8 text-surface-300 dark:text-surface-600 mb-2" />
            <p className="text-xs sm:text-sm text-surface-400">{t('search:favorites.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
};
