import React, { useState } from 'react';
import { BookOpen, ExternalLink, Heart, RefreshCw, ChevronLeft, ChevronRight, Download, User, Building2, ShieldCheck } from 'lucide-react';
import type { FavoriteItem } from '@/types';
import type { NovelItem } from '@/types/search';
import { getProxyImageUrl } from '@/utils/imageProxy';
import { convertToProxyUrl } from '@/services/proxy';
import { ShareToCommunityButton } from '@/components/community';

interface NovelEnrichedData {
  resultType: 'novel';
  keyword: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  novels: NovelItem[];
}

/** 格式徽章配色 */
const formatColor = (fmt: string): string => {
  const f = fmt.toUpperCase();
  if (f === 'PDF') return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
  if (f === 'EPUB') return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400';
  if (f === 'MOBI') return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
  return 'bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400';
};

function NovelCard({ item, isAuthenticated, isFavorited, onToggleFavorite, isProxyEnabled }: {
  item: NovelItem; isAuthenticated: boolean; isFavorited: boolean; onToggleFavorite: (item: NovelItem) => void; isProxyEnabled: boolean;
}) {
  const [descExpanded, setDescExpanded] = useState(false);
  const link = isProxyEnabled ? convertToProxyUrl(item.detailUrl) : item.detailUrl;
  return (
    <div className="group flex gap-4 p-4 rounded-xl border border-stone-200 dark:border-stone-700/50 bg-white dark:bg-stone-800/40 hover:border-emerald-500/50 hover:bg-stone-50 dark:hover:bg-stone-800/70 transition-all">
      {item.cover ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <img src={getProxyImageUrl(item.cover)} alt={item.title}
            className="w-20 sm:w-24 h-[120px] sm:h-[140px] object-cover rounded-lg bg-stone-200 dark:bg-stone-700 shadow-md"
            loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </a>
      ) : (
        <div className="shrink-0 w-20 sm:w-24 h-[120px] sm:h-[140px] rounded-lg bg-stone-100 dark:bg-stone-700/60 flex items-center justify-center">
          <BookOpen className="w-8 h-8 text-stone-400" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {item.format && (
                <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded ${formatColor(item.format)}`}>
                  {item.format}
                </span>
              )}
              {item.size && (
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400">
                  {item.size}
                </span>
              )}
              {item.year && (
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-stone-100 text-stone-500 dark:bg-stone-700/40 dark:text-stone-400">
                  {item.year}
                </span>
              )}
              {item.language && (
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {item.language}
                </span>
              )}
              {item.source === '奇书网' && (
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  奇书网 · TXT直链
                </span>
              )}
              {isProxyEnabled && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />代理
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100 leading-snug line-clamp-2 group-hover:text-emerald-500 transition-colors">
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
          </div>
        </div>
        {item.author && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-stone-600 dark:text-stone-400">
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">{item.author}</span>
          </div>
        )}
        {item.publisher && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-stone-500 dark:text-stone-500">
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{item.publisher}</span>
          </div>
        )}
        {item.description && (
          <div className="mt-1.5">
            <p className={`text-xs text-stone-500 dark:text-stone-400 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
              {item.description}
            </p>
            {item.description.length > 80 && (
              <button onClick={() => setDescExpanded(!descExpanded)}
                className="text-[10px] text-emerald-500 hover:text-emerald-600 mt-0.5">
                {descExpanded ? '收起' : '展开全部'}
              </button>
            )}
          </div>
        )}
        {item.category && !item.description && (
          <div className="mt-1.5">
            <span className="text-[10px] text-stone-400 dark:text-stone-500">{item.category}</span>
          </div>
        )}
        <a href={link} target="_blank" rel="noopener noreferrer"
          className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            isProxyEnabled
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700/60 dark:text-stone-300 dark:hover:bg-stone-700'
          }`}>
          <Download className="w-3 h-3" />
          详情 / 下载
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

interface NovelSearchResultPanelProps {
  data: NovelEnrichedData;
  isAuthenticated?: boolean;
  isProxyEnabled?: boolean;
  favorites?: FavoriteItem[];
  onRefresh?: () => void;
  onToggleFavorite?: (item: NovelItem) => void;
  onLoginRequired?: () => void;
}

export const NovelSearchResultPanel: React.FC<NovelSearchResultPanelProps> = ({
  data, isAuthenticated = false, isProxyEnabled = false, favorites = [], onRefresh, onToggleFavorite, onLoginRequired,
}) => {
  const [localPage, setLocalPage] = useState(1);
  const PAGE_SIZE = 10;
  const list = data.novels ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = list.slice((localPage - 1) * PAGE_SIZE, localPage * PAGE_SIZE);
  const isFavorited = (id: string) => favorites.some(f => f.url?.includes(id));
  const zxcsError = data.errors?.zxcs;
  const xqsError = data.errors?.xqishuta;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-stone-500">共 {data.total} 条结果 · 来源 知轩藏书 + 奇书网</span>
        <div className="flex items-center gap-2">
          <ShareToCommunityButton
            postData={{
              postType: 'novel',
              title: data.novels[0]?.title || data.keyword,
              coverImage: data.novels[0]?.cover ? getProxyImageUrl(data.novels[0].cover) : '',
              contentData: JSON.stringify({
                keyword: data.keyword,
                novels: data.novels,
              }),
            }}
            isAuthenticated={isAuthenticated}
            onLoginRequired={onLoginRequired}
            size="small"
          />
          {onRefresh && (
            <button onClick={onRefresh} className="p-1.5 rounded-lg text-stone-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title="刷新">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {zxcsError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs">
          知轩藏书抓取失败：{zxcsError}
        </div>
      )}
      {xqsError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs">
          奇书网抓取失败：{xqsError}
        </div>
      )}

      {list.length === 0 && !zxcsError && !xqsError ? (
        <div className="flex flex-col items-center justify-center py-16 text-stone-400">
          <BookOpen className="w-10 h-10 mb-2" />
          <span className="text-sm">没有找到相关电子书</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paged.map(item => (
            <NovelCard key={item.id} item={item} isAuthenticated={isAuthenticated}
              isFavorited={isFavorited(item.id)}
              onToggleFavorite={(n) => onToggleFavorite?.(n)}
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
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all dark:bg-stone-800/60 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200">
            下一页 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
