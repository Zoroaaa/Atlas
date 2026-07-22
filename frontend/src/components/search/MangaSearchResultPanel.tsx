import React, { useState } from 'react';
import { BookOpen, ExternalLink, Heart, RefreshCw, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import type { FavoriteItem } from '@/types';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { ShareToCommunityButton } from '@/components/community';
import { convertToProxyUrl } from '@/services/proxy';

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

const statusLabel = (s: string) => ({ ongoing: '连载中', completed: '已完结', hiatus: '暂停', cancelled: '已取消' }[s] || s);
const statusColor = (s: string) => s === 'ongoing'
  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
  : 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400';

function MangaCard({ item, isAuthenticated, isFavorited, onToggleFavorite, isProxyEnabled }: {
  item: MangaItem; isAuthenticated: boolean; isFavorited: boolean; onToggleFavorite: (item: MangaItem) => void; isProxyEnabled: boolean;
}) {
  const mangaUrl = `https://mangadex.org/title/${item.id}`;
  return (
    <div className="group flex gap-4 p-4 rounded-xl border border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 hover:border-violet-500/50 hover:bg-stone-50 dark:hover:bg-stone-800/70 transition-all">
      {item.cover && (
        <a href={isProxyEnabled ? convertToProxyUrl(mangaUrl) : mangaUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <img src={getProxyImageUrl(item.cover)} alt={item.title}
            className="w-20 sm:w-24 h-[120px] sm:h-[140px] object-cover rounded-lg bg-stone-200 dark:bg-stone-700 shadow-md"
            loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </a>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded ${statusColor(item.status)}`}>
                {statusLabel(item.status)}
              </span>
              {isProxyEnabled && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />代理
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100 leading-snug line-clamp-2 group-hover:text-violet-500 transition-colors">
              {item.title}
            </h3>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isAuthenticated && (
              <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(item); }}
                className={`p-1.5 rounded-lg transition-all ${isFavorited ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' : 'text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'}`}
                title={isFavorited ? '取消收藏' : '收藏'}>
                <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            )}
            <a href={isProxyEnabled ? convertToProxyUrl(mangaUrl) : mangaUrl} target="_blank" rel="noopener noreferrer"
              className={`p-1.5 rounded-lg transition-all ${
                isProxyEnabled
                  ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                  : 'text-stone-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20'
              }`}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 text-[9px] rounded-full bg-stone-100 text-stone-500 dark:bg-stone-700/50 dark:text-stone-400">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
  data, isAuthenticated = false, isProxyEnabled = false, favorites = [], onRefresh, onPageChange, onToggleFavorite, onLoginRequired,
}) => {
  const [localPage, setLocalPage] = useState(1);
  const PAGE_SIZE = 10;
  const list = data.manga ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = list.slice((localPage - 1) * PAGE_SIZE, localPage * PAGE_SIZE);
  const isFavorited = (id: string) => favorites.some(f => f.url?.includes(id));
  const hasError = !!data.errors?.mangadex;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-stone-500">共 {data.total} 条结果</span>
        <div className="flex items-center gap-2">
          <ShareToCommunityButton
            postData={{
              postType: 'manga',
              title: data.manga[0]?.title || data.keyword,
              coverImage: data.manga[0]?.cover ? getProxyImageUrl(data.manga[0].cover) : '',
              contentData: JSON.stringify({
                keyword: data.keyword,
                manga: data.manga,
              }),
            }}
            isAuthenticated={isAuthenticated}
            onLoginRequired={onLoginRequired}
            size="small"
          />
          {onRefresh && (
            <button onClick={onRefresh} className="p-1.5 rounded-lg text-stone-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors" title="刷新">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {hasError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
          MangaDex 请求失败：{data.errors.mangadex}
        </div>
      )}

      {list.length === 0 && !hasError ? (
        <div className="flex flex-col items-center justify-center py-16 text-stone-400">
          <BookOpen className="w-10 h-10 mb-2" />
          <span className="text-sm">没有找到相关漫画</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paged.map(item => (
            <MangaCard key={item.id} item={item} isAuthenticated={isAuthenticated}
              isFavorited={isFavorited(item.id)}
              onToggleFavorite={(m) => onToggleFavorite?.(m)}
              isProxyEnabled={isProxyEnabled} />
          ))}
        </div>
      )}

      {list.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
          <button disabled={localPage <= 1} onClick={() => setLocalPage(p => p - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200">
            <ChevronLeft className="w-3.5 h-3.5" /> 上一页
          </button>
          <span className="text-xs text-stone-500 px-2">{localPage} / {totalPages}</span>
          <button disabled={localPage >= totalPages} onClick={() => setLocalPage(p => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 transition-all dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200">
            下一页 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {onPageChange && list.length >= 20 && localPage >= totalPages && (
        <div className="flex justify-center gap-2">
          <button onClick={() => onPageChange(data.page + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-violet-100 text-violet-600 hover:bg-violet-200 transition-all dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60">
            加载更多 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};