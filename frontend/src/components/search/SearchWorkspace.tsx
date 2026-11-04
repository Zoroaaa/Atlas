import React from 'react';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NavigateFunction } from 'react-router-dom';
import {
  PanelSection,
  PanelHeader,
  IconAction,
  LoadingBlock,
  EmptyBlock,
} from '@/components/workbench';
import { SearchResultsPanel } from './SearchResultsPanel';
import { getResultPanel } from '@/config/resultPanels';
import { JavDetailPanel, JavActressResultsPanel, JavRecommendationsPanel } from '@/components/jav';
import { useSearchFlow, useJavSearchFlow, useFavoritesManager, useSourceManager } from '@/hooks';
import type { SearchTabType, JavSubMode } from '@/types/source';
import type { JavRecommendationSeed } from '@/types';
import type { JavEnrichedData, NovelEnrichedData } from '@/types/search';

interface SearchWorkspaceProps {
  activeTab: SearchTabType;
  javSubMode: JavSubMode;
  searchFlow: ReturnType<typeof useSearchFlow>;
  javFlow: ReturnType<typeof useJavSearchFlow>;
  favoritesManager: ReturnType<typeof useFavoritesManager>;
  sourceManager: ReturnType<typeof useSourceManager>;
  isAuthenticated: boolean;
  isProxyEnabled: boolean;
  navigate: NavigateFunction;
  onExit: () => void;
  onActressWorkClick: (code: string) => void;
  javRelatedSeed?: JavRecommendationSeed;
  javExcludeCodes?: string[];
}

export const SearchWorkspace: React.FC<SearchWorkspaceProps> = ({
  activeTab,
  javSubMode,
  searchFlow,
  javFlow,
  favoritesManager,
  sourceManager,
  isAuthenticated,
  isProxyEnabled,
  navigate,
  onExit,
  onActressWorkClick,
  javRelatedSeed,
  javExcludeCodes = [],
}) => {
  const { t } = useTranslation(['search', 'tabs', 'jav']);

  const enrichedData = searchFlow.enrichedData;
  const resultType = enrichedData?.resultType;
  const javData = resultType === 'jav' ? (enrichedData as JavEnrichedData) : undefined;
  const isActressMode = activeTab === 'jav' && javSubMode === 'actress' && Boolean(javData);
  const hasSourceLinks = searchFlow.searchResults.length > 0;
  const hasJavPrimary = activeTab === 'jav' && !isActressMode
    && (javFlow.javDetailStatus !== 'idle' || Boolean(javFlow.javDetail));

  const commonPanelProps = {
    isAuthenticated,
    isProxyEnabled,
    favorites: favoritesManager.favorites,
    onLoginRequired: () => navigate('/login'),
    onRefresh: () => searchFlow.handleSearch(searchFlow.keyword, searchFlow.enrichedPage),
    onPageChange: (page: number) => searchFlow.handleSearch(searchFlow.keyword, page),
  };

  const getToggleFavorite = () => {
    if (resultType === 'anime') return favoritesManager.handleToggleFavoriteAnime;
    if (resultType === 'manga') return favoritesManager.handleToggleFavoriteManga;
    if (resultType === 'novel') return favoritesManager.handleToggleFavoriteNovel;
    return favoritesManager.handleToggleFavoriteMovie;
  };

  const renderPrimary = () => {
    if (isActressMode && javData) {
      return (
        <JavActressResultsPanel
          data={javData}
          favoritedCodes={favoritesManager.favoritedCodes}
          isAuthenticated={isAuthenticated}
          isProxyEnabled={isProxyEnabled}
          onToggleFavorite={favoritesManager.handleToggleFavoriteActress}
          onLoginRequired={() => navigate('/login')}
          onWorkClick={onActressWorkClick}
        />
      );
    }

    if (hasJavPrimary) {
      return (
        <>
          <JavDetailPanel
            detail={javFlow.javDetail}
            status={javFlow.javDetailStatus}
            onClose={() => javFlow.resetJavDetail()}
            onRetry={javFlow.retryJavDetail}
            onFavorite={favoritesManager.handleFavoriteJavDetail}
            isFavorited={javFlow.javDetail ? favoritesManager.favoritedCodes.has(javFlow.javDetail.code) : false}
            isAuthenticated={isAuthenticated}
            onLoginRequired={() => navigate('/login')}
          />
          {javRelatedSeed ? (
            <JavRecommendationsPanel
              variant="related"
              seed={javRelatedSeed}
              excludeCodes={javExcludeCodes}
              onCodeClick={searchFlow.handleCodeClick}
            />
          ) : null}
        </>
      );
    }

    const Panel = getResultPanel(resultType);
    if (enrichedData && Panel) {
      return (
        <Panel
          data={enrichedData as NovelEnrichedData}
          {...commonPanelProps}
          onToggleFavorite={getToggleFavorite()}
        />
      );
    }

    return (
      <SearchResultsPanel
        results={searchFlow.searchResults}
        isAuthenticated={isAuthenticated}
        isProxyEnabled={isProxyEnabled}
        favorites={favoritesManager.favorites}
        categories={sourceManager.categories}
        majorCategories={sourceManager.majorCategories}
        onToggleFavorite={favoritesManager.handleToggleFavorite}
      />
    );
  };

  const showRail = Boolean(enrichedData) && hasSourceLinks && (isActressMode || hasJavPrimary || resultType === 'novel');
  const showEmpty = !searchFlow.isSearching && !enrichedData && searchFlow.searchResults.length === 0;

  return (
    <PanelSection>
      <PanelHeader
        icon={<Search className="h-4 w-4" />}
        title={searchFlow.keyword || t('search:results.title')}
        meta={t(SEARCH_TABS_META[activeTab] ?? 'search:results.title')}
        actions={
          <>
            {enrichedData ? (
              <IconAction
                icon={<RefreshCw className={`h-3.5 w-3.5 ${searchFlow.isSearching ? 'animate-spin' : ''}`} />}
                label={t('search:results.title')}
                onClick={() => searchFlow.handleSearch(searchFlow.keyword, searchFlow.enrichedPage)}
                disabled={searchFlow.isSearching}
              />
            ) : null}
            <button
              type="button"
              onClick={onExit}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800 dark:hover:text-surface-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('search:results.backToDiscovery')}</span>
            </button>
          </>
        }
      />

      {searchFlow.isSearching && !enrichedData ? (
        <div className="border-t border-surface-100 px-4 pb-4 pt-3 dark:border-surface-800/70 sm:px-5 sm:pb-5">
          <LoadingBlock rows={6} />
        </div>
      ) : showEmpty ? (
        <div className="border-t border-surface-100 px-4 pb-4 pt-3 dark:border-surface-800/70 sm:px-5 sm:pb-5">
          <EmptyBlock
            icon={<Search className="h-7 w-7" />}
            title={t('search:results.title')}
            action={
              <button
                type="button"
                onClick={onExit}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-[11px] font-medium text-white transition-colors hover:bg-primary-600"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('search:results.backToDiscovery')}
              </button>
            }
          />
        </div>
      ) : showRail ? (
        <div className="border-t border-surface-100 dark:border-surface-800/70 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="min-w-0">{renderPrimary()}</div>
          <div className="panel-rail xl:sticky xl:top-[84px] xl:self-start">
            <SearchResultsPanel
              results={searchFlow.searchResults}
              isAuthenticated={isAuthenticated}
              isProxyEnabled={isProxyEnabled}
              favorites={favoritesManager.favorites}
              categories={sourceManager.categories}
              majorCategories={sourceManager.majorCategories}
              onToggleFavorite={favoritesManager.handleToggleFavorite}
            />
          </div>
        </div>
      ) : (
        <div className="min-w-0 border-t border-surface-100 dark:border-surface-800/70">{renderPrimary()}</div>
      )}
    </PanelSection>
  );
};

const SEARCH_TABS_META: Record<string, string> = {
  jav: 'tabs:jav.label',
  anime: 'tabs:anime.label',
  movie: 'tabs:movie.label',
  manga: 'tabs:manga.label',
  novel: 'tabs:novel.label',
  sources: 'tabs:sources.label',
};
