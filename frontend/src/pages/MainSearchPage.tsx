import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useAuthStore, useSourceStore, useProxyStore } from '@/stores';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SearchTabType, JavSubMode } from '@/types/source';
import { TAB_IDS } from '@/types/source';
import { SearchResultsPanel, SearchHistoryPanel, FavoritesPanel, SourcesSidebar, AnnouncementPanel, SearchSuggestionsDropdown } from '@/components/search';
import { JavDetailPanel, JavRankingsPanel, ActressesPanel } from '@/components/jav';
import { UnifiedNavBar } from '@/components/layout';
import { useSearchFlow } from '@/hooks/useSearchFlow';
import { useFavoritesManager } from '@/hooks/useFavoritesManager';
import { useSearchHistoryManager } from '@/hooks/useSearchHistoryManager';
import { useJavSearchFlow } from '@/hooks/useJavSearchFlow';
import { useSourceManager } from '@/hooks/useSourceManager';
import { useDarkMode } from '@/hooks/useDarkMode';
import { FeedbackButton } from '@/components/feedback';
import { SEARCH_TABS } from '@/config/tabs';
import { getSiteTypeBadge, getSiteTypeLabel } from '@/utils/siteType';
import { getResultPanel } from '@/config/resultPanels';

export const MainSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  const { activeTab, setActiveTab } = useSourceStore();
  const { isEnabled: isProxyEnabled, initializeProxy } = useProxyStore();
  const { isDark: darkMode } = useDarkMode();

  const javFlow = useJavSearchFlow();
  const sourceManager = useSourceManager();
  const [javSubMode, setJavSubMode] = useState<JavSubMode>('code');

  // ── URL 同步：搜索时更新 URL ──
  const programmaticUrlRef = useRef(false);
  const handleSearchUrlSync = useCallback((keyword: string) => {
    programmaticUrlRef.current = true;
    setSearchParams({ tab: activeTab, q: keyword }, { replace: true });
  }, [setSearchParams, activeTab]);

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

  // ── UI-only state ──
  const [showHistory, setShowHistory] = useState(true);
  const [showFavorites, setShowFavorites] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'grid' : 'list'
  );
  const [isInputFocused, setIsInputFocused] = useState(false);

  // ── URL 初始化 + 浏览器前进/后退恢复搜索 ──
  useEffect(() => {
    const qParam = searchParams.get('q');
    if (!qParam) return;
    if (programmaticUrlRef.current) {
      programmaticUrlRef.current = false;
      return;
    }
    searchFlow.setKeyword(qParam);
    searchFlow.handleSearch(qParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && TAB_IDS.includes(tabParam as SearchTabType)) {
      setActiveTab(tabParam as SearchTabType);
    }
  }, [searchParams, setActiveTab]);

  useEffect(() => {
    const handleResize = () => { if (window.innerWidth < 768) setViewMode('list'); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { initializeProxy(); }, [initializeProxy]);

  // ── Tab 切换 ──
  const handleTabChange = useCallback((tab: SearchTabType) => {
    if (tab === 'community') { navigate('/community'); return; }
    setActiveTab(tab);
    const params: Record<string, string> = { tab };
    if (searchFlow.keyword.trim()) params.q = searchFlow.keyword.trim();
    programmaticUrlRef.current = true;
    setSearchParams(params, { replace: true });
    searchFlow.resetResults();
  }, [setActiveTab, setSearchParams, navigate, searchFlow.keyword, searchFlow.resetResults]);

  const isAdmin = isAuthenticated && user != null && (user.role === 'admin' || user.role === 'super_admin');

  const renderFavoritesPanel = () => isAuthenticated && (
    <FavoritesPanel favorites={favoritesManager.favorites} isLoading={favoritesManager.isLoadingFavorites} show={showFavorites} isProxyEnabled={isProxyEnabled} onToggle={() => setShowFavorites(!showFavorites)} onRemove={favoritesManager.handleRemoveFavorite} onExport={favoritesManager.handleExportFavorites} onUpdate={() => favoritesManager.refetchFavorites()} />
  );

  return (
    <div className="min-h-screen page-bg pb-16 md:pb-0">
      <UnifiedNavBar activeTab={activeTab} onTabChange={handleTabChange} isAuthenticated={isAuthenticated} user={user} isAdmin={isAdmin} />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="mb-4 sm:mb-6 animate-fade-in">
          <h1 className="text-lg sm:text-xl lg:text-2xl text-heading">
            嗨，<span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
              {isAuthenticated ? user?.username : '访客'}
            </span> 👋
          </h1>
          <p className="text-xs sm:text-sm text-caption mt-0.5">{SEARCH_TABS[activeTab].description}</p>
        </div>

        {activeTab !== 'sources' && (
        <div className="bg-white dark:bg-[#111113]/80 rounded-2xl shadow-xl shadow-surface-900/5 border border-surface-200/60 dark:border-surface-700/60 p-3 sm:p-5 mb-4 sm:mb-6 backdrop-blur-sm animate-slide-up relative z-30 overflow-visible">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-500 via-accent-500 to-amber-500"></div>
          {/* JAV 子搜索模式切换 */}
          {activeTab === 'jav' && (
            <div className="flex gap-2 mb-3 relative z-10">
              {[
                { id: 'code' as const, label: '番号搜索', placeholder: '输入番号搜索，如 SONE-520' },
                { id: 'actress' as const, label: '女优搜索', placeholder: '输入女优名搜索' },
                { id: 'title' as const, label: '影片标题', placeholder: '输入影片标题搜索' },
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setJavSubMode(sub.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                    javSubMode === sub.id
                      ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-sm'
                      : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 relative z-10">
            <div className="search-input-wrapper">
              <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none">
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <input type="text" placeholder={
                activeTab === 'jav'
                  ? javSubMode === 'code'
                    ? '输入番号搜索，如 SONE-520'
                    : javSubMode === 'actress'
                      ? '输入女优名搜索'
                      : '输入影片标题搜索'
                  : SEARCH_TABS[activeTab].placeholder
              } value={searchFlow.keyword}
                onChange={(e) => searchFlow.setKeyword(e.target.value)} onKeyDown={searchFlow.handleKeyDown}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => {
                  // 延迟关闭，避免点击建议项时触发 onBlur 导致无法选中
                  setTimeout(() => setIsInputFocused(false), 200);
                }}
                className={`search-input ${activeTab === 'jav' && javSubMode === 'code' && searchFlow.keyword.trim().length > 0 && !searchFlow.javFormatValid ? 'search-input-error' : ''}`} />
              <SearchSuggestionsDropdown suggestions={searchFlow.suggestions}
                visible={isInputFocused && searchFlow.showSuggestions && searchFlow.keyword.trim().length > 0}
                isLoading={searchFlow.isLoadingSuggestions}
                onSelect={(item) => {
                  searchFlow.handleSuggestionSelect(item);
                  setIsInputFocused(false); // 选中后关闭建议框
                }}
                onClose={() => searchFlow.setShowSuggestions(false)} />
            </div>
            <button onClick={() => searchFlow.handleSearch()} disabled={searchFlow.isSearching || (activeTab === 'jav' && javSubMode === 'code' && searchFlow.keyword.trim().length > 0 && !searchFlow.javFormatValid)} className="search-btn flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover-lift">
              {searchFlow.isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" strokeWidth={2.5} />}
              <span>搜索</span>
            </button>
          </div>
          {/* JAV 子模式提示 */}
          {activeTab === 'jav' && (
            <div className="relative z-10">
              {/* 番号格式错误提示：仅在输入框未聚焦时显示，避免与搜索建议冲突 */}
              {javSubMode === 'code' && !isInputFocused && searchFlow.keyword.trim().length > 0 && !searchFlow.javFormatValid && (
                <p className="text-xs text-red-400 mt-2 ml-1">格式請按照【SONE-520】或【SONE520】搜尋</p>
              )}
              {javSubMode === 'actress' && (
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-2 ml-1">提示：請嘗試按照維基百科使用繁體中文名或是日文名，如【水菜麗】請改成【みづなれい】搜尋</p>
              )}
              {javSubMode === 'title' && (
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-2 ml-1">提示：請嘗試縮短字數，並優先使用【日文】搜尋</p>
              )}
            </div>
          )}

        </div>
        )}

        {activeTab === 'sources' ? (
          <SourcesSidebar show={true} layoutMode="panel" collapsible={false} defaultExpanded={true} allSources={sourceManager.allSources} majorCategoriesWithCategories={sourceManager.getMajorCategoriesWithCategories()} expandedMajorCategories={sourceManager.expandedMajorCategories} expandedCategories={sourceManager.expandedCategories} batchCheckResults={sourceManager.batchCheckResults} isBatchChecking={sourceManager.isBatchChecking} isProxyEnabled={isProxyEnabled} onToggle={() => {}} onToggleMajorCategory={sourceManager.toggleMajorCategory} onToggleCategory={sourceManager.toggleCategory} onBatchCheck={sourceManager.handleBatchCheckSources} onCheckSingle={sourceManager.handleCheckSingleSource} getSiteTypeBadge={getSiteTypeBadge} getSiteTypeLabel={getSiteTypeLabel} />
        ) : (
        <>
          {activeTab === 'jav' && (
            <JavDetailPanel detail={javFlow.javDetail} status={javFlow.javDetailStatus} onClose={() => javFlow.resetJavDetail()} onFavorite={favoritesManager.handleFavoriteJavDetail} isFavorited={javFlow.javDetail ? favoritesManager.favoritedCodes.has(javFlow.javDetail.code) : false} isAuthenticated={isAuthenticated} onLoginRequired={() => { navigate('/login'); }} />
          )}
          {(() => {
            const resultType = searchFlow.enrichedData?.resultType;
            const Panel = getResultPanel(resultType);

            if (searchFlow.enrichedData && Panel) {
              const commonProps = {
                isDark: darkMode,
                isAuthenticated,
                isProxyEnabled,
                favorites: favoritesManager.favorites,
                onLoginRequired: () => navigate('/login'),
              };
              const getToggleFavorite = () => {
                if (resultType === 'anime') return favoritesManager.handleToggleFavoriteAnime;
                if (resultType === 'manga') return favoritesManager.handleToggleFavoriteManga;
                return favoritesManager.handleToggleFavoriteMovie;
              };
              return (
                <Panel
                  data={searchFlow.enrichedData}
                  {...commonProps}
                  onRefresh={() => searchFlow.handleSearch(searchFlow.keyword, searchFlow.enrichedPage)}
                  onPageChange={(p: number) => searchFlow.handleSearch(searchFlow.keyword, p)}
                  onToggleFavorite={getToggleFavorite()}
                />
              );
            }

            // jav 以及任何未注册专属面板的类型，都走这里——props 形状和 Panel 分支不通用，不能合并
            return (
              <SearchResultsPanel
                results={searchFlow.searchResults}
                viewMode={viewMode}
                isAuthenticated={isAuthenticated}
                isProxyEnabled={isProxyEnabled}
                favorites={favoritesManager.favorites}
                categories={sourceManager.categories}
                majorCategories={sourceManager.majorCategories}
                onViewModeChange={setViewMode}
                onClose={() => searchFlow.resetResults()}
                onToggleFavorite={favoritesManager.handleToggleFavorite}
              />
            );
          })()}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="lg:col-span-2 flex flex-col gap-3 sm:gap-4">
              {activeTab === 'jav' && <JavRankingsPanel onCodeClick={searchFlow.handleCodeClick} />}
              {activeTab === 'jav' && <ActressesPanel onCodeClick={searchFlow.handleCodeClick} />}
              {isAuthenticated && (
                <SearchHistoryPanel history={historyManager.searchHistory} isLoading={historyManager.isLoadingHistory} show={showHistory} onToggle={() => setShowHistory(!showHistory)} onItemClick={(query) => searchFlow.setKeyword(query)} onClear={historyManager.handleClearHistory} onDeleteSelected={historyManager.handleDeleteSelected} />
              )}
            </div>
            <div className="hidden lg:flex flex-col gap-3 sm:gap-4 self-start">
              {activeTab === 'jav' && <AnnouncementPanel />}
              {renderFavoritesPanel()}
            </div>
          </div>
          {activeTab === 'jav' && <div className="lg:hidden mt-3 sm:mt-4"><AnnouncementPanel /></div>}
          {isAuthenticated && (
            <div className="lg:hidden mt-3 sm:mt-4">{renderFavoritesPanel()}</div>
          )}
        </>
        )}
      </div>
      <FeedbackButton />
    </div>
  );
};
