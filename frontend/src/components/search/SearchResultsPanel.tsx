import React from 'react';
import { TrendingUp, List, Grid, X, Heart, ExternalLink, ShieldCheck } from 'lucide-react';
import { SourceIcon } from '@/components/ui';
import { convertToProxyUrl } from '@/services/proxy';
import type { SearchResult, FavoriteItem, Category, MajorCategory } from '@/types';

interface SearchResultItem extends SearchResult {
  subtitle?: string;
  siteType?: string;
  category?: string;
  description?: string;
}

interface SearchResultsPanelProps {
  results: SearchResultItem[];
  viewMode: 'grid' | 'list';
  isAuthenticated: boolean;
  isProxyEnabled: boolean;
  favorites: FavoriteItem[];
  categories: Category[];
  majorCategories: MajorCategory[];
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onClose: () => void;
  onToggleFavorite: (result: SearchResultItem) => void;
}

export const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({
  results,
  viewMode,
  isAuthenticated,
  isProxyEnabled,
  favorites,
  categories,
  majorCategories,
  onViewModeChange,
  onClose,
  onToggleFavorite,
}) => {
  const isFavorite = (url: string) => favorites.some(f => f.url === url);

  const getCategoryBadge = (categoryId?: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    const majorCategory = majorCategories.find(mc => mc.id === category.majorCategoryId);
    if (majorCategory?.color) return 'bg-opacity-20 text-opacity-90';
    return 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300';
  };

  const getCategoryLabel = (categoryId?: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return '搜索';
    return category.name;
  };

  const getCategoryStyle = (categoryId?: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return {};
    const majorCategory = majorCategories.find(mc => mc.id === category.majorCategoryId);
    if (majorCategory?.color) return { backgroundColor: `${majorCategory.color}20`, color: majorCategory.color };
    return {};
  };

  const getSiteTypeBadge = (siteType?: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      search: { label: '搜索', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
      browse: { label: '浏览', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
      reference: { label: '参考', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    };
    return map[siteType || 'search'] || map.search;
  };

  if (results.length === 0) return null;

  return (
    <div className="bg-white dark:bg-surface-900/80 rounded-2xl shadow-xl shadow-surface-900/5 border border-surface-200/60 dark:border-surface-700/60 p-3 sm:p-5 mb-4 sm:mb-6 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <span className="font-semibold text-surface-900 dark:text-surface-100 text-sm sm:text-base">搜索结果</span>
          <span className="px-2 py-0.5 text-xs font-semibold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
            {results.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 sm:p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'}`}
          >
            <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 sm:p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'}`}
          >
            <Grid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all ml-1"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      <div className={viewMode === 'grid' ? 'result-grid grid gap-2 sm:gap-3' : 'space-y-2'}>
        {results.map((result, index) => (
          <div key={index} className="result-card p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <SourceIcon icon={result.sourceIcon} name={result.sourceName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h3 className="font-semibold text-surface-900 dark:text-surface-100 text-xs sm:text-sm">{result.sourceName}</h3>
                    <span
                      className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md font-medium ${getCategoryBadge(result.category)}`}
                      style={getCategoryStyle(result.category)}
                    >
                      {getCategoryLabel(result.category)}
                    </span>
                    {(() => { const badge = getSiteTypeBadge(result.siteType); return (
                      <span className={`hidden sm:inline text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    ); })()}
                    {isProxyEnabled && (
                      <span className="hidden sm:flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-medium bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400">
                        <ShieldCheck className="w-3 h-3" />代理
                      </span>
                    )}
                  </div>
                  {result.subtitle && (
                    <p className="text-[10px] sm:text-xs text-surface-500 dark:text-surface-400 mt-0.5 truncate">{result.subtitle}</p>
                  )}
                  {result.description && (
                    <p className="text-[10px] sm:text-xs text-surface-400 dark:text-surface-500 mt-0.5 line-clamp-1">{result.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {isAuthenticated && (
                  <button
                    onClick={() => onToggleFavorite(result)}
                    className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                      isFavorite(result.url || '')
                        ? 'text-error-500 bg-error-50 dark:bg-error-900/20'
                        : 'text-surface-400 hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20'
                    }`}
                    title={isFavorite(result.url || '') ? '取消收藏' : '收藏'}
                  >
                    <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isFavorite(result.url || '') ? 'fill-current' : ''}`} />
                  </button>
                )}
                {result.url && (
                  <button
                    onClick={() => window.open(isProxyEnabled ? convertToProxyUrl(result.url) : result.url, '_blank')}
                    className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-semibold text-white transition-all shadow-md ${
                      isProxyEnabled
                        ? 'bg-gradient-to-r from-success-500 to-teal-500 hover:from-success-600 hover:to-teal-600 shadow-success-500/25'
                        : 'bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 shadow-primary-500/25'
                    }`}
                  >
                    <span className="hidden sm:inline">前往</span>
                    <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
