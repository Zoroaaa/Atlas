import React from 'react';
import { Globe, Heart, ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SourceIcon } from '@/components/ui';
import { PanelSection, PanelHeader, ResourceRow, Chip, CountBadge, IconAction } from '@/components/workbench';
import { convertToProxyUrl } from '@/services/proxy';
import type { SearchResult, FavoriteRef, Category, MajorCategory } from '@/types';

interface SearchResultItem extends SearchResult {
  subtitle?: string;
  siteType?: string;
  category?: string;
  description?: string;
}

interface SearchResultsPanelProps {
  results: SearchResultItem[];
  isAuthenticated: boolean;
  isProxyEnabled: boolean;
  favorites: FavoriteRef[];
  categories: Category[];
  majorCategories: MajorCategory[];
  onToggleFavorite: (result: SearchResultItem) => void;
}

/** 多源直达：紧凑行列表，不再有列表/网格切换。 */
export const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({
  results,
  isAuthenticated,
  isProxyEnabled,
  favorites,
  categories,
  majorCategories,
  onToggleFavorite,
}) => {
  const { t } = useTranslation(['search']);
  const isFavorite = (url: string) => favorites.some((favorite) => favorite.url === url);

  const getCategory = (categoryId?: string) => {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return null;
    const major = majorCategories.find((item) => item.id === category.majorCategoryId);
    return { category, major };
  };

  const getSiteTypeLabel = (siteType?: string) => {
    const map: Record<string, string> = {
      search: t('search:results.siteTypeSearch'),
      browse: t('search:results.siteTypeBrowse'),
      reference: t('search:results.siteTypeReference'),
    };
    return map[siteType || 'search'] ?? map.search;
  };

  if (results.length === 0) return null;

  return (
    <PanelSection>
      <PanelHeader
        icon={<Globe className="h-4 w-4" />}
        title={t('search:results.title')}
        count={<CountBadge>{results.length}</CountBadge>}
      />
      <div className="divide-y divide-surface-100 px-2 pb-2 dark:divide-surface-800/70 sm:px-3 sm:pb-3">
        {results.map((result, index) => {
          const categoryInfo = getCategory(result.category);
          return (
            <ResourceRow
              key={`${result.url}-${index}`}
              leading={<SourceIcon icon={result.sourceIcon} name={result.sourceName} size="md" />}
              title={<span className="font-semibold text-surface-900 dark:text-surface-100">{result.sourceName}</span>}
              badges={
                <>
                  {categoryInfo ? (
                    <span
                      className="inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: categoryInfo.major?.color ? `${categoryInfo.major.color}20` : undefined,
                        color: categoryInfo.major?.color,
                      }}
                    >
                      {categoryInfo.category.name}
                    </span>
                  ) : (
                    <Chip tone="warning" size="xs">{t('search:results.defaultCategoryLabel')}</Chip>
                  )}
                  <Chip tone="source" size="xs">{getSiteTypeLabel(result.siteType)}</Chip>
                  {isProxyEnabled ? (
                    <Chip tone="proxy" size="xs">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      {t('search:results.proxy')}
                    </Chip>
                  ) : null}
                </>
              }
              meta={[result.subtitle, result.description].filter(Boolean) as React.ReactNode[]}
              trailing={
                <>
                  {isAuthenticated ? (
                    <IconAction
                      icon={<Heart className={`h-3.5 w-3.5 ${isFavorite(result.url || '') ? 'fill-current' : ''}`} />}
                      label={isFavorite(result.url || '') ? t('search:results.unfavorite') : t('search:results.favorite')}
                      tone={isFavorite(result.url || '') ? 'danger' : 'default'}
                      onClick={() => onToggleFavorite(result)}
                    />
                  ) : null}
                  {result.url ? (
                    <button
                      type="button"
                      onClick={() => window.open(isProxyEnabled ? convertToProxyUrl(result.url) : result.url, '_blank')}
                      className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-white ${
                        isProxyEnabled
                          ? 'bg-success-600 hover:bg-success-700'
                          : 'bg-primary-500 hover:bg-primary-600'
                      }`}
                    >
                      <span className="hidden sm:inline">{t('search:results.go')}</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : null}
                </>
              }
            />
          );
        })}
      </div>
    </PanelSection>
  );
};
