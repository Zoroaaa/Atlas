import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Moon,
  Sun,
  LogOut,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Filter,
  LayoutDashboard,
  Globe,
  Film,
  Tv2,
} from 'lucide-react';
import { useSearchStore, useSourceStore, useAuthStore, useThemeStore, useProxyStore } from '@/stores';
import { searchApi, sourceApi, userApi, analyticsApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useNavigate, Link } from 'react-router-dom';
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

import { SearchResultsPanel, SearchHistoryPanel, FavoritesPanel, SourcesPanel, QuickActionsPanel } from '@/components/search';
import { JavDetailPanel, JavRankingsPanel } from '@/components/jav';
import { useJavDetail } from '@/hooks';
import { FeedbackButton } from '@/components/feedback';

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

const getProxyButtonClass = (isEnabled: boolean, status: string) => {
  if (isEnabled) return 'proxy-toggle-btn enabled';
  if (status === 'error') return 'proxy-toggle-btn error';
  return 'proxy-toggle-btn disabled';
};

export const MainSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { keyword, setKeyword, setResults, isSearching, setSearching } = useSearchStore();
  const { majorCategories, setMajorCategories, categories, setCategories } = useSourceStore();
  const {
    isEnabled: isProxyEnabled,
    status: proxyStatus,
    isLoading: isProxyLoading,
    toggleProxy,
    initializeProxy,
  } = useProxyStore();
  const { communityEnabled } = useFeatureFlags();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [showFavorites, setShowFavorites] = useState(true);
  const [showSources, setShowSources] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'grid' : 'list'
  );



  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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

  useEffect(() => {
    if (hasSearched && keyword.trim()) {
      handleSearch();
    }
  }, [selectedCategory]);

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
    setHasSearched(true);
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
    return mc?.requiresKeyword === true;
  });

  const handleCodeClick = (code: string) => {
    setKeyword(code);
    handleSearch(code);
  };

  return (
    <div className="min-h-screen page-bg">

      <header className="mobile-header">
        <div className="max-w-7xl mx-auto">
          <div className="mobile-header-inner">
            <a href={window.location.pathname} className="flex items-center gap-2 group cursor-pointer" title="刷新页面">
              <img
                src="/logo.png"
                alt="磁力快搜"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl shadow-lg shadow-primary-500/20 group-hover:shadow-primary-500/40 transition-all object-cover"
              />
              <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent hidden xs:block tracking-tight">
                磁力快搜
              </span>
            </a>

            <nav className="hidden md:flex items-center gap-1">
              <Link to="/main" className="px-3.5 py-2 text-sm font-semibold rounded-xl text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 transition-all flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />搜索
              </Link>
              <Link to="/dashboard" className="px-3.5 py-2 text-sm font-medium rounded-xl text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-all flex items-center gap-1.5">
                <LayoutDashboard className="w-3.5 h-3.5" />控制台
              </Link>
              {communityEnabled && (
                <Link to="/community" className="px-3.5 py-2 text-sm font-medium rounded-xl text-surface-500 dark:text-surface-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />社区
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin-panel" className="px-3.5 py-2 text-sm font-medium rounded-xl text-surface-500 dark:text-surface-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />管理
                </Link>
              )}
            </nav>

            <div className="mobile-header-actions">
              {isAuthenticated && (
                <button
                  onClick={toggleProxy}
                  disabled={isProxyLoading}
                  className={getProxyButtonClass(isProxyEnabled, proxyStatus)}
                  title={isProxyEnabled ? '代理已启用 - 点击关闭' : '代理已关闭 - 点击启用'}
                >
                  {isProxyLoading
                    ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                    : isProxyEnabled
                      ? <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                      : proxyStatus === 'error'
                        ? <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
                        : <Shield className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              )}

              <button onClick={toggleTheme} className="theme-toggle-btn">
                {resolvedTheme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>

              <Link to="/dashboard" className="mobile-header-btn md:hidden" title="控制台">
                <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
              </Link>

              {communityEnabled && (
                <Link to="/community" className="mobile-header-btn md:hidden" title="社区">
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
                </Link>
              )}

              {isAdmin && (
                <Link to="/admin-panel" className="mobile-header-btn md:hidden text-red-500 hover:text-red-600" title="管理后台">
                  <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
                </Link>
              )}

              {isAuthenticated ? (
                <>
                  <div className="mobile-user-info">
                    <div className="mobile-user-avatar">
                      {user?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <span className="text-sm font-medium text-surface-700 dark:text-surface-300 max-w-[80px] truncate">
                      {user?.username}
                    </span>
                  </div>
                  <button onClick={() => { logout(); navigate('/'); }} className="mobile-logout-btn" title="退出登录">
                    <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </>
              ) : (
                <Link to="/login" className="ml-2 px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-600 hover:to-accent-600 shadow-lg shadow-primary-500/25 transition-all">
                  登录
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">

        <div className="mb-4 sm:mb-6 animate-fade-in">
          <h1 className="text-lg sm:text-xl lg:text-2xl text-heading">
            嗨，<span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
              {isAuthenticated ? user?.username : '访客'}
            </span> 👋
          </h1>
          <p className="text-xs sm:text-sm text-caption mt-0.5">搜索全网资源，一步直达</p>
        </div>

        <div className="bg-white dark:bg-surface-900/80 rounded-2xl shadow-xl shadow-surface-900/5 border border-surface-200/60 dark:border-surface-700/60 p-3 sm:p-5 mb-4 sm:mb-6 backdrop-blur-sm animate-slide-up relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-500 via-accent-500 to-cyan-500"></div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 relative z-10">
            <div className="search-input-wrapper">
              <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none">
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <input
                type="text"
                placeholder="输入番号、关键词搜索资源..."
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
                {searchableCategories.map((category) => (
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

          {/* 专题搜索入口 */}
          <div className="flex gap-2 sm:gap-3 mt-3">
            <button
              onClick={() => navigate('/anime')}
              className="flex-1 flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium
                         bg-violet-50 dark:bg-violet-900/15 text-violet-700 dark:text-violet-300
                         border border-violet-200/60 dark:border-violet-800/40
                         hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:border-violet-300 dark:hover:border-violet-700/60
                         transition-all active:scale-[0.98]"
            >
              <Film className="w-4 h-4 sm:w-5 sm:h-5 text-violet-500 dark:text-violet-400" />
              <span>动漫搜索</span>
              <span className="text-[10px] xs:text-xs text-violet-400/70 dark:text-violet-500/50 ml-auto hidden sm:inline">Bangumi + Nyaa + Mikan</span>
            </button>
            <button
              onClick={() => navigate('/movie')}
              className="flex-1 flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium
                         bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300
                         border border-blue-200/60 dark:border-blue-800/40
                         hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700/60
                         transition-all active:scale-[0.98]"
            >
              <Tv2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 dark:text-blue-400" />
              <span>影视搜索</span>
              <span className="text-[10px] xs:text-xs text-blue-400/70 dark:text-blue-500/50 ml-auto hidden sm:inline">TMDB + 磁力资源</span>
            </button>
          </div>
        </div>

        <JavDetailPanel
          detail={javDetail}
          status={javDetailStatus}
          onClose={resetJavDetail}
          onFavorite={handleFavoriteJavDetail}
          isFavorited={javDetail ? favoritedCodes.has(javDetail.code) : false}
        />

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

        {/* 主内容区：左侧JAV+历史 / 右侧收藏，右列高度精确跟随左列 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">

          <div className="lg:col-span-2 flex flex-col gap-3 sm:gap-4">
            <JavRankingsPanel onCodeClick={handleCodeClick} />

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

          {/* 右列：高度由 FavoritesPanel 内部常量决定，自动与左列对齐 */}
          {isAuthenticated && (
            <div className="hidden lg:block self-start">
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
            </div>
          )}

        </div>

        {/* 移动端：我的收藏 */}
        {isAuthenticated && (
          <div className="lg:hidden mt-3 sm:mt-4">
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
          </div>
        )}

        <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
          <SourcesPanel
            show={showSources}
            allSources={allSources}
            majorCategoriesWithCategories={getMajorCategoriesWithCategories()}
            expandedMajorCategories={expandedMajorCategories}
            expandedCategories={expandedCategories}
            batchCheckResults={batchCheckResults}
            isBatchChecking={isBatchChecking}
            isProxyEnabled={isProxyEnabled}
            onToggle={() => setShowSources(!showSources)}
            onToggleMajorCategory={toggleMajorCategory}
            onToggleCategory={toggleCategory}
            onBatchCheck={handleBatchCheckSources}
            onCheckSingle={handleCheckSingleSource}
            getSiteTypeBadge={getSiteTypeBadge}
            getSiteTypeLabel={getSiteTypeLabel}
          />

          <QuickActionsPanel isAdmin={isAdmin} communityEnabled={communityEnabled} layout="horizontal" />
        </div>
      </div>

      {/* 悬浮反馈按钮 */}
      <FeedbackButton />
    </div>
  );
};
