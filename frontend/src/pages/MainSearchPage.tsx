import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Loader2,
  Filter,
} from 'lucide-react';
import { useSearchStore, useSourceStore, useAuthStore, useProxyStore } from '@/stores';
import { searchApi, sourceApi, userApi, analyticsApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFeatureFlags } from '@/contexts';
import type {
  SearchResult,
  FavoriteItem,
  SearchHistoryItem,
  MajorCategory,
  Category,
  SearchSource,
  UserSourceConfig,
  JavDetail,
} from '@/types';

import { SearchResultsPanel, SearchHistoryPanel, FavoritesPanel, SourcesSidebar } from '@/components/search';
import { JavDetailPanel, JavRankingsPanel } from '@/components/jav';
import { UnifiedNavBar } from '@/components/layout';
import { useJavDetail } from '@/hooks';
import { FeedbackButton } from '@/components/feedback';
import { SEARCH_TABS } from '@/config/tabs';
import type { SearchTabType } from '@/types/source';

interface SearchResultItem extends SearchResult {
  subtitle?: string;
  siteType?: string;
  category?: string;
  description?: string;
}

interface SourceWithUserConfig extends SearchSource {
  userConfig?: UserSourceConfig | null;
}

interface CategoryWithSources extends Category {
  sources: SourceWithUserConfig[];
}

interface MajorCategoryWithCategories extends MajorCategory {
  categories: CategoryWithSources[];
}

const getSiteTypeBadge = (siteType?: string) => {
  const map: Record<string, string> = {
    search: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    browse: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    reference: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  };
  return map[siteType || 'search'] || map.search;
};

const getSiteTypeLabel = (siteType?: string) => {
  const map: Record<string, string> = { search: '搜索', browse: '浏览', reference: '参考' };
  return map[siteType || 'search'] || '搜索';
};

export const MainSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  const { keyword, setKeyword, setResults, isSearching, setSearching } = useSearchStore();
  const { majorCategories, setMajorCategories, categories, setCategories, activeTab, setActiveTab } = useSourceStore();
  const {
    isEnabled: isProxyEnabled,
    initializeProxy,
  } = useProxyStore();
  const { communityEnabled } = useFeatureFlags();

  // 从 URL 参数初始化 Tab 状态
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['jav', 'anime', 'movie', 'sources'].includes(tabParam)) {
      setActiveTab(tabParam as SearchTabType);
    }
  }, []);

  // Tab 切换处理函数（包含 URL 同步和分类联动）
  const handleTabChange = useCallback((tab: SearchTabType) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
    
    // 根据选中的 Tab 更新 UI 上下文
    switch (tab) {
      case 'jav':
        setSelectedCategory(null);
        break;
      case 'anime': {
        const animeMC = majorCategories.find(mc => mc.id === 'anime_sources');
        if (animeMC) {
          const defaultCat = categories.find(c =>
            c.majorCategoryId === animeMC.id && c.defaultSearchable
          );
          setSelectedCategory(defaultCat?.id || null);
        }
        break;
      }
      case 'movie': {
        const movieMC = majorCategories.find(mc => mc.id === 'movie_sources');
        if (movieMC) {
          const defaultCat = categories.find(c =>
            c.majorCategoryId === movieMC.id && c.defaultSearchable
          );
          setSelectedCategory(defaultCat?.id || null);
        }
        break;
      }
      case 'sources':
        setSelectedCategory(null);
        break;
    }
  }, [setActiveTab, setSearchParams, majorCategories, categories]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [showFavorites, setShowFavorites] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'grid' : 'list'
  );



  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);

  // JAV 磁力提取
  const { detail: javDetail, status: javDetailStatus, fetch: fetchJavDetail, reset: resetJavDetail } = useJavDetail();
  const [allSources, setAllSources] = useState<SourceWithUserConfig[]>([]);
  const [expandedMajorCategories, setExpandedMajorCategories] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const [batchCheckResults, setBatchCheckResults] = useState<Record<string, {
    status: string;
    available: boolean;
    responseTime: number;
    error: string | null;
  }>>({});

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setViewMode('list');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [majorCategoriesData, allCategoriesData, allSourcesData] = await Promise.all([
          sourceApi.getMajorCategories(),
          sourceApi.getCategories(),
          sourceApi.getSourcesWithUserConfig(),
        ]);
        if (majorCategoriesData.success && majorCategoriesData.data) {
          setMajorCategories(majorCategoriesData.data);
          setExpandedMajorCategories(new Set(majorCategoriesData.data.map(c => c.id)));
        }
        if (allCategoriesData.success && allCategoriesData.data) {
          setCategories(allCategoriesData.data);
          setExpandedCategories(new Set(allCategoriesData.data.map(c => c.id)));
        }
        if (allSourcesData.success && allSourcesData.data) {
          setAllSources(allSourcesData.data);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    loadData();
    initializeProxy();
  }, [setMajorCategories, setCategories, initializeProxy, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadHistory();
      loadFavorites();
    }
  }, [isAuthenticated]);

  // 注意：不在 selectedCategory 变化时自动搜索，避免 Tab 切换等场景下触发意外搜索
  // 用户需要手动点击搜索按钮或按 Enter 键来执行搜索

  // JAV详情提取成功后自动更新搜索历史
  useEffect(() => {
    if (!isAuthenticated || !javDetail || javDetailStatus !== 'success' || !searchHistory.length) return;

    const updateHistoryWithJavDetail = async () => {
      try {
        const targetHistory = searchHistory.find(h =>
          h.query.toUpperCase().includes(javDetail!.code.toUpperCase()) ||
          javDetail!.code.toUpperCase().includes(h.query.toUpperCase())
        );

        if (targetHistory) {
          await userApi.updateSearchHistory(targetHistory.id, {
            title: javDetail.title,
            code: javDetail.code,
            actors: javDetail.actresses?.join(', '),
            duration: javDetail.duration,
            tags: javDetail.tags?.join(', '),
            releaseDate: javDetail.releaseDate,
            publisher: javDetail.publisher || javDetail.maker,
            keyword: javDetail.code,
          });

          setSearchHistory(prev => prev.map(h =>
            h.id === targetHistory.id
              ? { ...h,
                  title: javDetail!.title,
                  code: javDetail!.code,
                  actors: javDetail!.actresses?.join(', '),
                  duration: javDetail!.duration,
                  tags: javDetail!.tags?.join(', '),
                  releaseDate: javDetail!.releaseDate,
                  publisher: javDetail!.publisher || javDetail!.maker,
                  keyword: javDetail!.code,
                }
              : h
          ));
        }
      } catch (error) {
        console.error('Failed to update search history with JAV detail:', error);
      }
    };

    updateHistoryWithJavDetail();
  }, [javDetail, javDetailStatus, isAuthenticated]);

  const loadHistory = async () => {
    if (!isAuthenticated) return;
    setIsLoadingHistory(true);
    try {
      const response = await userApi.getSearchHistory(20);
      if (response.success && response.data) setSearchHistory(response.data.history);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadFavorites = async () => {
    if (!isAuthenticated) return;
    setIsLoadingFavorites(true);
    try {
      const response = await userApi.getFavorites();
      if (response.success && response.data) setFavorites(response.data.favorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setIsLoadingFavorites(false);
    }
  };

  const handleSearch = useCallback(async (overrideKeyword?: string) => {
    const query = overrideKeyword || keyword;
    if (!query.trim()) {
      toast.warning('请输入搜索关键词');
      return;
    }
    const sessionId = sessionStorage.getItem('analytics_session_id') || (() => {
      const id = Math.random().toString(36).slice(2);
      sessionStorage.setItem('analytics_session_id', id);
      return id;
    })();
    analyticsApi.recordEvent({
      userId: user?.id,
      sessionId,
      eventType: 'search',
      eventData: { keyword: query.trim() },
    }).catch(() => {});
    setSearching(true);
    try {
      const response = await searchApi.search({
        keyword: query.trim(),
        categoryId: selectedCategory || undefined,
      }) as unknown as {
        success: boolean;
        data: { keyword: string; results: Array<{ id: string; name: string; subtitle?: string; icon?: string; url: string; siteType: string; category: string; description?: string }> };
      };
      if (response.success && response.data) {
        const mappedResults: SearchResultItem[] = response.data.results.map(r => ({
          sourceId: r.id,
          sourceName: r.name,
          sourceIcon: r.icon,
          url: r.url,
          subtitle: r.subtitle,
          siteType: r.siteType,
          category: r.category,
          description: r.description,
        }));
        setResults(mappedResults as unknown as SearchResult[]);
        setSearchResults(mappedResults);
        if (mappedResults.length === 0) {
          toast.info('未找到结果', '尝试更换关键词搜索');
        } else {
          loadHistory();
        }
        // 若输入符合番号格式，自动触发磁力提取
        const trimmed = query.trim().toUpperCase();
        if (/^[A-Z]{2,8}-?\d{2,6}$/.test(trimmed)) {
          fetchJavDetail(trimmed);
        } else {
          resetJavDetail();
        }
      }
    } catch {
      toast.error('搜索失败', '请稍后重试');
    } finally {
      setSearching(false);
    }
  }, [keyword, selectedCategory, setResults, setSearching, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const getFavoriteId = (url: string) => favorites.find(f => f.url === url)?.id;

  const handleToggleFavorite = async (result: SearchResultItem) => {
    if (!isAuthenticated) { toast.warning('请先登录'); navigate('/login'); return; }
    const existingFavoriteId = getFavoriteId(result.url || '');
    if (existingFavoriteId) {
      try {
        await userApi.removeFavorite(existingFavoriteId);
        setFavorites(prev => prev.filter(f => f.id !== existingFavoriteId));
        toast.success('已取消收藏');
      } catch { toast.error('取消收藏失败', '请稍后重试'); }
    } else {
      try {
        const response = await userApi.addFavorite({
          title: result.sourceName,
          url: result.url || '',
          subtitle: result.subtitle,
          keyword: keyword.trim() || undefined,
        });
        if (response.success && response.data) setFavorites(prev => [response.data, ...prev]);
        toast.success('已添加到收藏');
      } catch { toast.error('收藏失败', '请稍后重试'); }
    }
  };

  const handleFavoriteJavDetail = async (detail: JavDetail) => {
    if (!isAuthenticated) { toast.warning('请先登录'); navigate('/login'); return; }
    const detailUrl = detail.detailUrl || `https://javdb.com/search?q=${detail.code}&f=all`;
    const existingFavoriteId = getFavoriteId(detailUrl);
    if (existingFavoriteId) {
      try {
        await userApi.removeFavorite(existingFavoriteId);
        setFavorites(prev => prev.filter(f => f.id !== existingFavoriteId));
        toast.success('已取消收藏');
      } catch { toast.error('取消收藏失败', '请稍后重试'); }
    } else {
      try {
        const response = await userApi.addFavorite({
          title: detail.title,
          url: detailUrl,
          code: detail.code,
          cover: detail.cover,
          actors: detail.actresses?.join(', '),
          duration: detail.duration,
          tags: detail.tags?.join(', '),
          releaseDate: detail.releaseDate,
          publisher: detail.publisher || detail.maker,
          keyword: detail.code,
        });
        if (response.success && response.data) setFavorites(prev => [response.data, ...prev]);
        toast.success('已添加到收藏');
      } catch { toast.error('收藏失败', '请稍后重试'); }
    }
  };

  const handleRemoveFavorite = async (id: string) => {
    try {
      await userApi.removeFavorite(id);
      setFavorites(prev => prev.filter(f => f.id !== id));
      toast.success('已移除收藏');
    } catch { toast.error('移除失败', '请稍后重试'); }
  };

  const handleExportFavorites = () => {
    const data = JSON.stringify(favorites, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `favorites-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('导出成功');
  };

  const handleClearHistory = async () => {
    if (!confirm('确定要清空所有搜索历史吗？')) return;
    try {
      await userApi.clearSearchHistory();
      setSearchHistory([]);
      toast.success('历史已清空');
    } catch { toast.error('清空失败', '请稍后重试'); }
  };

  const toggleMajorCategory = (id: string) => {
    const next = new Set(expandedMajorCategories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedMajorCategories(next);
  };

  const toggleCategory = (id: string) => {
    const next = new Set(expandedCategories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedCategories(next);
  };

  const getMajorCategoriesWithCategories = (): MajorCategoryWithCategories[] =>
    majorCategories.map(mc => {
      const cats = categories.filter(c => c.majorCategoryId === mc.id);
      const categoriesWithSources: CategoryWithSources[] = cats.map(cat => ({
        ...cat,
        sources: allSources.filter(s => s.categoryId === cat.id),
      })).filter(c => c.sources.length > 0);
      return { ...mc, categories: categoriesWithSources };
    }).filter(mc => mc.categories.length > 0);

  const handleBatchCheckSources = async () => {
    const checkableSources = allSources.filter(s => s.searchable || s.homepageUrl);
    if (checkableSources.length === 0) { toast.warning('没有可检查的搜索源'); return; }
    setIsBatchChecking(true);
    setBatchCheckResults({});
    let totalAvailable = 0;
    let totalChecked = 0;
    try {
      const sourceIds = checkableSources.map(s => s.id);
      for (let i = 0; i < sourceIds.length; i += 20) {
        const batch = sourceIds.slice(i, i + 20);
        try {
          const response = await sourceApi.batchCheckSourceStatus(batch);
          if (response.success && response.data) {
            const newResults: typeof batchCheckResults = {};
            response.data.results.forEach(result => {
              newResults[result.sourceId] = { status: result.status, available: result.available, responseTime: result.responseTime, error: result.error };
              if (result.available) totalAvailable++;
              totalChecked++;
            });
            setBatchCheckResults(prev => ({ ...prev, ...newResults }));
          }
        } catch { /* 单批失败不中断 */ }
      }
      const unavailable = totalChecked - totalAvailable;
      if (unavailable === 0) {
        toast.success(`检查完成：全部 ${totalChecked} 个搜索源均可正常访问 ✓`);
      } else {
        toast.warning(`检查完成：${totalAvailable}/${totalChecked} 可用，${unavailable} 个无法访问`);
      }
    } catch { toast.error('批量检查失败', '请检查网络连接后重试'); }
    finally { setIsBatchChecking(false); }
  };

  const handleCheckSingleSource = async (sourceId: string) => {
    try {
      const response = await sourceApi.checkSourceStatus(sourceId);
      if (response.success && response.data) {
        setBatchCheckResults(prev => ({
          ...prev,
          [sourceId]: { status: response.data.status, available: response.data.available, responseTime: response.data.responseTime, error: response.data.error },
        }));
        const { status, available, responseTime, error } = response.data;
        if (available) {
          toast.success(status === 'restricted' ? '在线（访问受限）' : '在线', `响应时间 ${responseTime}ms`);
        } else {
          toast.error('检查失败', status === 'timeout' ? '请求超时' : error || '无法访问');
        }
      }
    } catch { toast.error('检查失败', '请检查网络连接后重试'); }
  };

  const isAdmin = isAuthenticated && user != null && (user.role === 'admin' || user.role === 'super_admin');

  const favoritedCodes = React.useMemo(() => {
    const codes = new Set<string>();
    favorites.forEach(f => { if (f.code) codes.add(f.code); });
    return codes;
  }, [favorites]);
  const searchableCategories = categories.filter(cat => {
    const mc = majorCategories.find(mc => mc.id === cat.majorCategoryId);
    // 双重门控：属于当前Tab对应的大类 AND 分类本身标记为可搜索
    const isInCurrentMajorCategory = mc?.id === SEARCH_TABS[activeTab].majorCategoryId;
    return isInCurrentMajorCategory && cat.defaultSearchable === true;
  });

  const handleCodeClick = (code: string) => {
    setKeyword(code);
    handleSearch(code);
  };

  return (
    <div className="min-h-screen page-bg pb-16 md:pb-0">

      {/* 新的统一导航栏 */}
      <UnifiedNavBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isAuthenticated={isAuthenticated}
        user={user}
        isAdmin={isAdmin}
        communityEnabled={communityEnabled}
      />

      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">

        <div className="mb-4 sm:mb-6 animate-fade-in">
          <h1 className="text-lg sm:text-xl lg:text-2xl text-heading">
            嗨，<span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
              {isAuthenticated ? user?.username : '访客'}
            </span> 👋
          </h1>
          <p className="text-xs sm:text-sm text-caption mt-0.5">{SEARCH_TABS[activeTab].description}</p>
        </div>

        {/* 搜索框区域：仅在搜索类 Tab 显示（sources Tab 不需要） */}
        {activeTab !== 'sources' && (
        <div className="bg-white dark:bg-surface-900/80 rounded-2xl shadow-xl shadow-surface-900/5 border border-surface-200/60 dark:border-surface-700/60 p-3 sm:p-5 mb-4 sm:mb-6 backdrop-blur-sm animate-slide-up relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-500 via-accent-500 to-cyan-500"></div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 relative z-10">
            <div className="search-input-wrapper">
              <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none">
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <input
                type="text"
                placeholder={SEARCH_TABS[activeTab].placeholder}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="search-input"
              />
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={isSearching}
              className="search-btn flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover-lift"
            >
              {isSearching
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Search className="w-4 h-4" strokeWidth={2.5} />}
              <span>搜索</span>
            </button>
          </div>

          {searchableCategories.length > 0 && (
            <div className="category-filter-wrapper">
              <div className="flex items-center gap-1.5 shrink-0">
                <Filter className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-xs text-surface-400 font-medium hidden sm:inline">分类</span>
              </div>
              <div className="flex items-center gap-1.5 flex-nowrap">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`category-filter-btn ${selectedCategory === null ? 'active' : ''}`}
                >
                  全部
                </button>
                {searchableCategories
                  .filter(cat => {
                    const mc = majorCategories.find(mc => mc.id === cat.majorCategoryId);
                    return mc?.id === SEARCH_TABS[activeTab].majorCategoryId;
                  })
                  .map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`category-filter-btn ${selectedCategory === category.id ? 'active' : ''}`}
                    >
                      {category.icon && <span className="mr-1">{category.icon}</span>}
                      {category.name}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* 根据 Tab 渲染不同内容 */}
        {activeTab === 'sources' ? (
          /* 搜索源访问：仅显示搜索源管理面板（全宽） */
          <SourcesSidebar
            show={true}
            layoutMode="panel"
            collapsible={false}
            defaultExpanded={true}
            allSources={allSources}
            majorCategoriesWithCategories={getMajorCategoriesWithCategories()}
            expandedMajorCategories={expandedMajorCategories}
            expandedCategories={expandedCategories}
            batchCheckResults={batchCheckResults}
            isBatchChecking={isBatchChecking}
            isProxyEnabled={isProxyEnabled}
            onToggle={() => {}}
            onToggleMajorCategory={toggleMajorCategory}
            onToggleCategory={toggleCategory}
            onBatchCheck={handleBatchCheckSources}
            onCheckSingle={handleCheckSingleSource}
            getSiteTypeBadge={getSiteTypeBadge}
            getSiteTypeLabel={getSiteTypeLabel}
          />
        ) : (
        /* 搜索类 Tab（JAV/动漫/影视）：恢复原来三栏布局，不含源面板 */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 左列：JAV详情 + 排行榜 + 历史 */}
          <div className="flex flex-col gap-4">
            {activeTab === 'jav' && (
              <JavDetailPanel
                detail={javDetail}
                status={javDetailStatus}
                onClose={resetJavDetail}
                onFavorite={handleFavoriteJavDetail}
                isFavorited={javDetail ? favoritedCodes.has(javDetail.code) : false}
              />
            )}

            {activeTab === 'jav' && (
              <JavRankingsPanel onCodeClick={handleCodeClick} />
            )}

            {isAuthenticated && (
              <SearchHistoryPanel
                history={searchHistory}
                isLoading={isLoadingHistory}
                show={showHistory}
                onToggle={() => setShowHistory(!showHistory)}
                onItemClick={(query) => setKeyword(query)}
                onClear={handleClearHistory}
              />
            )}
          </div>

          {/* 中列：搜索结果 */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <SearchResultsPanel
              results={searchResults}
              viewMode={viewMode}
              isAuthenticated={isAuthenticated}
              isProxyEnabled={isProxyEnabled}
              favorites={favorites}
              categories={categories}
              majorCategories={majorCategories}
              onViewModeChange={setViewMode}
              onClose={() => { setSearchResults([]); resetJavDetail(); }}
              onToggleFavorite={handleToggleFavorite}
            />

            {/* 收藏面板 */}
            {isAuthenticated && (
              <FavoritesPanel
                favorites={favorites}
                isLoading={isLoadingFavorites}
                show={showFavorites}
                isProxyEnabled={isProxyEnabled}
                onToggle={() => setShowFavorites(!showFavorites)}
                onRemove={handleRemoveFavorite}
                onExport={handleExportFavorites}
                onUpdate={loadFavorites}
              />
            )}
          </div>

        </div>
        )}
      </div>

      {/* 悬浮反馈按钮 */}
      <FeedbackButton />
    </div>
  );
};
