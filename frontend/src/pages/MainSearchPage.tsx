import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search } from 'lucide-react';
import { useAuthStore, useSourceStore, useProxyStore } from '@/stores';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SearchTabType, JavSubMode } from '@/types/source';
import type { JavEnrichedData } from '@/types/search';
import { TAB_IDS, JAV_SUB_MODES } from '@/types/source';
import {
  AnnouncementBar,
  SearchDock,
  SearchWorkspace,
  SearchHistoryPanel,
  FavoritesPanel,
  SourcesSidebar,
  QuickActionsPanel,
} from '@/components/search';
import { useFeatureFlags } from '@/contexts/ConfigContext';
import { JavRankingsPanel, ActressesPanel, JavRecommendationsPanel } from '@/components/jav';
import { UnifiedNavBar } from '@/components/layout';
import { Panel, PanelSection, PanelRail, EmptyBlock } from '@/components/workbench';
import { useSearchFlow } from '@/hooks/useSearchFlow';
import { useFavoritesManager } from '@/hooks/useFavoritesManager';
import { useSearchHistoryManager } from '@/hooks/useSearchHistoryManager';
import { useJavSearchFlow } from '@/hooks/useJavSearchFlow';
import { useSourceManager } from '@/hooks/useSourceManager';
import { FeedbackButton } from '@/components/feedback';
import { SEARCH_TABS } from '@/config/tabs';
import { getSiteTypeBadge, getSiteTypeLabel } from '@/utils/siteType';
import { useTranslation } from 'react-i18next';

export const MainSearchPage: React.FC = () => {
  const { t } = useTranslation(['tabs', 'home', 'search']);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  const { activeTab, setActiveTab } = useSourceStore();
  const { isEnabled: isProxyEnabled, initializeProxy } = useProxyStore();
  const { communityEnabled } = useFeatureFlags();

  const javFlow = useJavSearchFlow();
  const sourceManager = useSourceManager();
  const [javSubMode, setJavSubMode] = useState<JavSubMode>('code');

  // ── URL 同步：搜索时更新 URL ──
  const programmaticUrlRef = useRef(false);
  const handleSearchUrlSync = useCallback((keyword: string, subMode?: JavSubMode) => {
    programmaticUrlRef.current = true;
    const params: Record<string, string> = { tab: activeTab, q: keyword };
    if (activeTab === 'jav') params.sub = subMode ?? javSubMode;
    setSearchParams(params, { replace: true });
  }, [setSearchParams, activeTab, javSubMode]);

  const searchFlow = useSearchFlow({
    activeTab,
    fetchJavDetail: javFlow.fetchJavDetail,
    resetJavDetail: javFlow.resetJavDetail,
    javEnrichedDetail: javFlow.javEnrichedDetail,
    setJavEnrichedDetail: javFlow.setJavEnrichedDetail,
    javSubMode,
    onSearch: handleSearchUrlSync,
  });

  const favoritesManager = useFavoritesManager({ keyword: searchFlow.keyword });
  const historyManager = useSearchHistoryManager();

  const javEnrichedData = searchFlow.enrichedData?.resultType === 'jav'
    ? (searchFlow.enrichedData as JavEnrichedData)
    : null;
  const javRelatedSeed = javEnrichedData
    ? javEnrichedData.detail
      ? {
          code: javEnrichedData.detail.code,
          actors: javEnrichedData.detail.actresses,
          tags: javEnrichedData.detail.tags,
          publisher: javEnrichedData.detail.publisher || javEnrichedData.detail.maker,
        }
      : javSubMode === 'actress' && javEnrichedData.normalizedKeyword
        ? { actress: javEnrichedData.normalizedKeyword }
        : undefined
    : undefined;
  const javExcludeCodes = javEnrichedData
    ? [
        ...(javEnrichedData.detail ? [javEnrichedData.detail.code] : []),
        ...((javEnrichedData.actressWorks || []).map((work) => work.code)),
      ]
    : [];

  // ── UI-only state ──
  const [showHistory, setShowHistory] = useState(true);
  const [showFavorites, setShowFavorites] = useState(true);

  // 搜索结束后刷新配额展示（isSearching 由 true 落回 false 视为一次搜索完成）
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const wasSearchingRef = useRef(false);
  useEffect(() => {
    if (wasSearchingRef.current && !searchFlow.isSearching) {
      setQuotaRefreshKey((key) => key + 1);
    }
    wasSearchingRef.current = searchFlow.isSearching;
  }, [searchFlow.isSearching]);

  // ── URL 初始化 + 浏览器前进/后退恢复搜索 ──
  useEffect(() => {
    const qParam = searchParams.get('q');
    if (!qParam) return;
    if (programmaticUrlRef.current) {
      programmaticUrlRef.current = false;
      return;
    }
    const tabParam = searchParams.get('tab');
    const subParam = searchParams.get('sub');
    let overrideSubMode: JavSubMode | undefined;
    if (tabParam === 'jav' && subParam && JAV_SUB_MODES.includes(subParam as JavSubMode)) {
      overrideSubMode = subParam as JavSubMode;
      setJavSubMode(overrideSubMode);
    }
    searchFlow.setKeyword(qParam);
    searchFlow.handleSearch(qParam, 1, overrideSubMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && TAB_IDS.includes(tabParam as SearchTabType)) {
      setActiveTab(tabParam as SearchTabType);
    }
    const subParam = searchParams.get('sub');
    if (subParam && JAV_SUB_MODES.includes(subParam as JavSubMode)) {
      setJavSubMode(subParam as JavSubMode);
    }
  }, [searchParams, setActiveTab]);

  useEffect(() => { initializeProxy(); }, [initializeProxy]);

  // ── Tab 切换 ──
  const handleTabChange = useCallback((tab: SearchTabType) => {
    if (tab === 'community') { navigate('/community'); return; }
    setActiveTab(tab);
    const params: Record<string, string> = { tab };
    if (searchFlow.keyword.trim()) params.q = searchFlow.keyword.trim();
    if (tab === 'jav') params.sub = javSubMode;
    programmaticUrlRef.current = true;
    setSearchParams(params, { replace: true });
    searchFlow.resetResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActiveTab, setSearchParams, navigate, searchFlow.keyword, searchFlow.resetResults, javSubMode]);

  const isAdmin = isAuthenticated && user != null && (user.role === 'admin' || user.role === 'super_admin');

  const handleActressWorkClick = (code: string) => {
    setJavSubMode('code');
    searchFlow.setKeyword(code);
    searchFlow.handleSearch(code, 1, 'code');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleActressClick = (name: string) => {
    setJavSubMode('actress');
    searchFlow.setKeyword(name);
    searchFlow.handleSearch(name, 1, 'actress');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubModeChange = (mode: JavSubMode) => {
    setJavSubMode(mode);
    programmaticUrlRef.current = true;
    const params: Record<string, string> = { tab: 'jav', sub: mode };
    if (searchFlow.keyword.trim()) params.q = searchFlow.keyword.trim();
    setSearchParams(params, { replace: true });
  };

  const handleExitResults = useCallback(() => {
    searchFlow.resetResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFlow.resetResults]);

  const showIdleHint = activeTab !== 'jav'
    && activeTab !== 'sources'
    && (!isAuthenticated || historyManager.searchHistory.length === 0);

  return (
    <div className="min-h-screen page-bg pb-16 md:pb-0">
      <UnifiedNavBar activeTab={activeTab} onTabChange={handleTabChange} isAuthenticated={isAuthenticated} user={user} isAdmin={isAdmin} />

      <main className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-4 sm:mb-5">
          <h1 className="type-page-title text-heading">
            {t('home:javSubmode.greeting')}，<span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
              {isAuthenticated ? user?.username : t('home:javSubmode.guest')}
            </span> 👋
          </h1>
          <p className="type-meta mt-1">{t(SEARCH_TABS[activeTab].descriptionKey)}</p>
        </header>

        <Panel>
          <AnnouncementBar />

          {activeTab !== 'sources' ? (
            <SearchDock
              activeTab={activeTab}
              javSubMode={javSubMode}
              onSubModeChange={handleSubModeChange}
              keyword={searchFlow.keyword}
              setKeyword={searchFlow.setKeyword}
              isSearching={searchFlow.isSearching}
              onSubmit={() => searchFlow.handleSearch()}
              onKeyDown={searchFlow.handleKeyDown}
              suggestions={searchFlow.suggestions}
              isLoadingSuggestions={searchFlow.isLoadingSuggestions}
              showSuggestions={searchFlow.showSuggestions}
              onSuggestionSelect={searchFlow.handleSuggestionSelect}
              onCloseSuggestions={() => searchFlow.setShowSuggestions(false)}
              quotaRefreshKey={quotaRefreshKey}
              javFormatHintVisible={searchFlow.javFormatHintVisible}
            />
          ) : null}

          {activeTab === 'sources' ? (
            <SourcesSidebar
              show={true}
              layoutMode="panel"
              collapsible={false}
              defaultExpanded={true}
              allSources={sourceManager.allSources}
              majorCategoriesWithCategories={sourceManager.getMajorCategoriesWithCategories()}
              expandedMajorCategories={sourceManager.expandedMajorCategories}
              expandedCategories={sourceManager.expandedCategories}
              batchCheckResults={sourceManager.batchCheckResults}
              isBatchChecking={sourceManager.isBatchChecking}
              isProxyEnabled={isProxyEnabled}
              onToggle={() => {}}
              onToggleMajorCategory={sourceManager.toggleMajorCategory}
              onToggleCategory={sourceManager.toggleCategory}
              onBatchCheck={sourceManager.handleBatchCheckSources}
              onCheckSingle={sourceManager.handleCheckSingleSource}
              getSiteTypeBadge={getSiteTypeBadge}
              getSiteTypeLabel={getSiteTypeLabel}
            />
          ) : searchFlow.hasSearched ? (
            <SearchWorkspace
              activeTab={activeTab}
              javSubMode={javSubMode}
              searchFlow={searchFlow}
              javFlow={javFlow}
              favoritesManager={favoritesManager}
              sourceManager={sourceManager}
              isAuthenticated={isAuthenticated}
              isProxyEnabled={isProxyEnabled}
              navigate={navigate}
              onExit={handleExitResults}
              onActressWorkClick={handleActressWorkClick}
              javRelatedSeed={javRelatedSeed}
              javExcludeCodes={javExcludeCodes}
            />
          ) : (
            <div className="border-t border-surface-100 dark:border-surface-800/70">
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                <div className="min-w-0">
                  {activeTab === 'jav' ? (
                    <>
                      <JavRecommendationsPanel variant="for-you" onCodeClick={searchFlow.handleCodeClick} />
                      <JavRankingsPanel onCodeClick={searchFlow.handleCodeClick} />
                      <ActressesPanel onActressClick={handleActressClick} />
                    </>
                  ) : null}
                  {isAuthenticated ? (
                    <SearchHistoryPanel
                      history={historyManager.searchHistory}
                      isLoading={historyManager.isLoadingHistory}
                      show={showHistory}
                      onToggle={() => setShowHistory((value) => !value)}
                      onItemClick={(query) => searchFlow.setKeyword(query)}
                      onClear={historyManager.handleClearHistory}
                      onDeleteSelected={historyManager.handleDeleteSelected}
                    />
                  ) : null}
                  {showIdleHint ? (
                    <PanelSection className="p-4 sm:p-5">
                      <EmptyBlock
                        icon={<Search className="h-8 w-8" />}
                        title={t(SEARCH_TABS[activeTab].placeholderKey)}
                        hint={t(SEARCH_TABS[activeTab].descriptionKey)}
                        className="bg-transparent"
                      />
                    </PanelSection>
                  ) : null}
                </div>

                <PanelRail className="min-w-0">
                  {isAuthenticated ? (
                    <FavoritesPanel
                      favorites={favoritesManager.favorites}
                      isLoading={favoritesManager.isLoadingFavorites}
                      show={showFavorites}
                      isProxyEnabled={isProxyEnabled}
                      onToggle={() => setShowFavorites((value) => !value)}
                      onRemove={favoritesManager.handleRemoveFavorite}
                      onExport={favoritesManager.handleExportFavorites}
                      onUpdate={() => favoritesManager.refetchFavorites()}
                    />
                  ) : null}
                  <QuickActionsPanel isAdmin={isAdmin} communityEnabled={communityEnabled} />
                </PanelRail>
              </div>
            </div>
          )}
        </Panel>
      </main>

      <FeedbackButton />
    </div>
  );
};
