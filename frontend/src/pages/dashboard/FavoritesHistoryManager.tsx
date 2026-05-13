import React, { useState, useEffect, useCallback } from 'react';
import {
  Heart,
  Search,
  Clock,
  Trash2,
  ExternalLink,
  Download,
  Upload,
  SortAsc,
  SortDesc,
  Calendar,
  Tag,
  BarChart2,
  Eye,
  EyeOff,
  Building2,
  User,
} from 'lucide-react';
import { Card, Button, Input, Badge, Modal, Loading, EmptyState } from '@/components/ui';
import { ProxyImage } from '@/components/ui';
import { userApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useNavigate } from 'react-router-dom';
import type { FavoriteItem, SearchHistoryItem } from '@/types';

const resolveUrl = (relativePath: string, referenceUrl: string): string => {
  try {
    const base = new URL(referenceUrl);
    return new URL(relativePath, base).href;
  } catch {
    return relativePath;
  }
};

const getProxyImageUrl = (url: string): string => {
  const baseUrl = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://backend.codeseek.pp.ua';
  return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(url)}`;
};

export const FavoritesManager: React.FC = () => {
  const toast = useToast();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  const [importModal, setImportModal] = useState(false);
  const [importData, setImportData] = useState('');

  const loadFavorites = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await userApi.getFavorites();
      if (response.success && response.data) {
        setFavorites(response.data.favorites);
      }
    } catch (_error) {
      toast.error('加载失败', '无法加载收藏数据');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleRemoveFavorite = async (id: string) => {
    try {
      await userApi.removeFavorite(id);
      setFavorites(prev => prev.filter(f => f.id !== id));
      toast.success('已移除收藏');
    } catch (_error) {
      toast.error('移除失败', '请稍后重试');
    }
  };

  const handleUpdateStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'want' ? 'watched' : 'want';
    try {
      const result = await userApi.updateFavoriteStatus(id, newStatus);
      if (result.success) {
        setFavorites(prev => prev.map(f => 
          f.id === id ? { ...f, status: newStatus } : f
        ));
        toast.success('状态更新成功');
      } else {
        toast.error(result.message || '状态更新失败');
      }
    } catch (_error) {
      toast.error('状态更新失败');
    }
  };

  const handleBatchRemove = async () => {
    if (selectedItems.size === 0) {
      toast.warning('请先选择要删除的收藏');
      return;
    }
    
    if (!confirm(`确定要删除选中的 ${selectedItems.size} 个收藏吗？`)) return;
    
    try {
      await Promise.all(Array.from(selectedItems).map(id => userApi.removeFavorite(id)));
      setFavorites(prev => prev.filter(f => !selectedItems.has(f.id)));
      setSelectedItems(new Set());
      toast.success('批量删除成功');
    } catch (_error) {
      toast.error('删除失败', '部分收藏可能未删除');
    }
  };

  const handleExport = () => {
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

  const handleImport = async () => {
    if (!importData.trim()) {
      toast.error('请输入导入数据');
      return;
    }
    
    try {
      const data = JSON.parse(importData);
      if (!Array.isArray(data)) {
        toast.error('数据格式错误');
        return;
      }
      
      let successCount = 0;
      for (const item of data) {
        if (!item.title || !item.url) continue;
        try {
          const res = await userApi.addFavorite({ title: item.title, url: item.url, subtitle: item.subtitle, icon: item.icon, keyword: item.keyword });
          if (res.success) successCount++;
        } catch (_e) { /* skip duplicates/errors */ }
      }
      toast.success(`成功导入 ${successCount} 个收藏`);
      setImportModal(false);
      setImportData('');
      loadFavorites();
    } catch (_error) {
      toast.error('导入失败', '请检查数据格式');
    }
  };

  const filteredFavorites = favorites
    .filter(f => f.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'date') {
        return sortOrder === 'asc' 
          ? a.createdAt - b.createdAt 
          : b.createdAt - a.createdAt;
      }
      return sortOrder === 'asc' 
        ? a.title.localeCompare(b.title) 
        : b.title.localeCompare(a.title);
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" text="加载收藏..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-error-500 to-pink-500 flex items-center justify-center shadow-lg shadow-error-500/25">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              我的收藏
            </h2>
            <p className="text-surface-500 dark:text-surface-400">
              共 {favorites.length} 个收藏
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            leftIcon={<Upload className="w-4 h-4" />}
            onClick={() => setImportModal(true)}
          >
            导入
          </Button>
          <Button
            variant="outline"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={handleExport}
            disabled={favorites.length === 0}
          >
            导出
          </Button>
        </div>
      </div>

      <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="搜索收藏..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-5 h-5" />}
              fullWidth
            />
          </div>
          <div className="flex gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'title')}
              className="px-4 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500"
            >
              <option value="date">按日期排序</option>
              <option value="title">按标题排序</option>
            </select>
            <Button
              variant="outline"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </Card>

      {selectedItems.size > 0 && (
        <Card className="p-4 bg-gradient-to-r from-error-50 to-error-100/50 dark:from-error-900/20 dark:to-error-800/20 border-error-200 dark:border-error-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-error-700 dark:text-error-300">
              已选择 {selectedItems.size} 个收藏
            </span>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={handleBatchRemove}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                批量删除
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedItems(new Set())}
              >
                取消选择
              </Button>
            </div>
          </div>
        </Card>
      )}

      {filteredFavorites.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFavorites.map(favorite => (
            <Card key={favorite.id} className="p-3 sm:p-4 border-surface-200/50 dark:border-surface-700/50 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex flex-col gap-2 sm:gap-3">
                <div className="flex gap-3">
                  {favorite.cover ? (
                    <ProxyImage
                      src={getProxyImageUrl(resolveUrl(favorite.cover, favorite.url))}
                      alt={favorite.title}
                      className="w-28 h-20 sm:w-36 sm:h-24 object-cover rounded-md flex-shrink-0"
                    />
                  ) : favorite.icon ? (
                    <img src={favorite.icon} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-contain flex-shrink-0" loading="lazy" />
                  ) : null}
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-2 py-1">
                    <div className="flex flex-col gap-1.5 flex-wrap">
                      {favorite.status && (
                        <button
                          onClick={() => handleUpdateStatus(favorite.id, favorite.status!)}
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all hover:opacity-80 w-fit ${
                            favorite.status === 'want'
                              ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                              : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
                          }`}
                        >
                          {favorite.status === 'want' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {favorite.status === 'want' ? '想看' : '已看过'}
                        </button>
                      )}
                      {favorite.code && (
                        <span className="text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded w-fit">
                          {favorite.code}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <button
                        onClick={() => window.open(favorite.url, '_blank')}
                        className="p-1.5 rounded-lg text-surface-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveFavorite(favorite.id)}
                        className="p-1.5 rounded-lg text-surface-400 hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-1 pl-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-surface-100 break-words">{favorite.title}</p>
                  {favorite.subtitle && (
                    <p className="text-xs text-surface-500 truncate">{favorite.subtitle}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {favorite.actors && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <User className="w-3 h-3" />
                        {favorite.actors}
                      </span>
                    )}
                    {favorite.duration && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Clock className="w-3 h-3" />
                        {favorite.duration}分钟
                      </span>
                    )}
                    {favorite.releaseDate && (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <Calendar className="w-3 h-3" />
                        {favorite.releaseDate}
                      </span>
                    )}
                    {favorite.publisher && (
                      <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                        <Building2 className="w-3 h-3" />
                        {favorite.publisher}
                      </span>
                    )}
                  </div>
                  {(favorite.tags || (favorite.keyword && !favorite.code)) && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {favorite.tags && (
                        <>
                          {favorite.tags.split(',').slice(0, 6).map((tag, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
                                {tag.trim()}
                            </span>
                          ))}
                        </>
                      )}
                      {favorite.keyword && !favorite.code && (
                        <span className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded truncate max-w-[150px]">
                          <Tag className="w-3 h-3" />
                          {favorite.keyword}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart className="w-12 h-12" />}
          title="暂无收藏"
          description="搜索时点击收藏按钮即可添加收藏"
        />
      )}

      <Modal
        isOpen={importModal}
        onClose={() => {
          setImportModal(false);
          setImportData('');
        }}
        title="导入收藏"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-surface-600 dark:text-surface-400">
            请粘贴导出的 JSON 数据，或输入符合格式的 JSON 数组
          </p>
          <textarea
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            placeholder='[{"title": "示例", "url": "https://example.com", ...}]'
            rows={10}
            className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 font-mono text-sm"
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setImportModal(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleImport}>
              导入
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export const HistoryManager: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showKeywordCloud, setShowKeywordCloud] = useState(false);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await userApi.getSearchHistory();
      if (response.success && response.data) {
        setHistory(response.data.history);
      }
    } catch (_error) {
      toast.error('加载失败', '无法加载搜索历史');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleClearHistory = async () => {
    if (!confirm('确定要清空所有搜索历史吗？此操作不可撤销。')) return;
    
    try {
      await userApi.clearSearchHistory();
      setHistory([]);
      toast.success('历史已清空');
    } catch (_error) {
      toast.error('清空失败', '请稍后重试');
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await userApi.deleteSearchHistoryItem(id);
      setHistory(prev => prev.filter(h => h.id !== id));
      toast.success('已删除');
    } catch (_error) {
      toast.error('删除失败', '请稍后重试');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedItems.size === 0) {
      toast.warning('请先选择要删除的记录');
      return;
    }
    
    try {
      await Promise.all(Array.from(selectedItems).map(id => userApi.deleteSearchHistoryItem(id)));
      setHistory(prev => prev.filter(h => !selectedItems.has(h.id)));
      setSelectedItems(new Set());
      toast.success('批量删除成功');
    } catch (_error) {
      toast.error('删除失败', '部分记录可能未删除');
    }
  };

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const filterByDate = (item: SearchHistoryItem) => {
    const itemDate = new Date(item.createdAt);
    const now = new Date();
    
    switch (dateFilter) {
      case 'today':
        return itemDate.toDateString() === now.toDateString();
      case 'week': {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return itemDate >= weekAgo;
      }
      case 'month': {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return itemDate >= monthAgo;
      }
      default:
        return true;
    }
  };

  const filteredHistory = history
    .filter(h => h.query.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(filterByDate);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const groupedHistory = filteredHistory.reduce((groups, item) => {
    const date = new Date(item.createdAt).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(item);
    return groups;
  }, {} as Record<string, SearchHistoryItem[]>);

  // ── 统计计算 ──
  const uniqueKeywords = new Set(history.map(h => h.query)).size;
  const activeDays = new Set(history.map(h => new Date(h.createdAt).toDateString())).size;
  const todayCount = history.filter(h => new Date(h.createdAt).toDateString() === new Date().toDateString()).length;

  const kwFreq: Record<string, number> = {};
  history.forEach(h => {
    const kw = h.query?.trim();
    if (kw) kwFreq[kw] = (kwFreq[kw] || 0) + 1;
  });
  const topKeywords = Object.entries(kwFreq)
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const handleExportHistory = () => {
    const data = JSON.stringify({
      searchHistory: history,
      stats: { total: history.length, uniqueKeywords, activeDays },
      exportTime: new Date().toISOString(),
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('导出成功');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" text="加载历史..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
              搜索历史
            </h2>
            <p className="text-surface-500 dark:text-surface-400">
              共 {history.length} 条记录
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={handleExportHistory}
            disabled={history.length === 0}
          >
            导出
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<BarChart2 className="w-4 h-4" />}
            onClick={() => setShowKeywordCloud(v => !v)}
          >
            {showKeywordCloud ? '隐藏' : '关键词云'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 className="w-4 h-4" />}
            onClick={handleClearHistory}
            disabled={history.length === 0}
          >
            清空
          </Button>
        </div>
      </div>

      {/* 统计小卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '总记录', value: history.length, color: 'from-primary-500 to-primary-600' },
          { label: '今日搜索', value: todayCount, color: 'from-accent-500 to-accent-600' },
          { label: '不同关键词', value: uniqueKeywords, color: 'from-success-500 to-emerald-600' },
          { label: '活跃天数', value: activeDays, color: 'from-warning-500 to-orange-600' },
        ].map(stat => (
          <div key={stat.label} className="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-800/60 rounded-xl border border-surface-200/50 dark:border-surface-700/30">
            <div className={`w-2 h-8 rounded-full bg-gradient-to-b ${stat.color} flex-shrink-0`} />
            <div>
              <p className="text-xs text-surface-500 dark:text-surface-400">{stat.label}</p>
              <p className="text-lg font-bold text-surface-900 dark:text-surface-100">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 关键词云 */}
      {showKeywordCloud && topKeywords.length > 0 && (
        <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-surface-400" />
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">热门搜索关键词</h3>
            <Badge variant="outline" className="ml-auto text-xs">{topKeywords.length} 个</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {topKeywords.map(({ keyword, count }) => {
              const max = topKeywords[0].count;
              const min = topKeywords[topKeywords.length - 1].count;
              const ratio = max === min ? 0.5 : (count - min) / (max - min);
              const size = 11 + Math.round(ratio * 12);
              return (
                <button
                  key={keyword}
                  onClick={() => navigate('/main')}
                  className="px-2.5 py-1 rounded-full bg-surface-100 dark:bg-surface-800 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 border border-surface-200 dark:border-surface-700 hover:border-primary-300 dark:hover:border-primary-700 transition-all"
                  style={{ fontSize: size }}
                  title={`搜索 ${count} 次`}
                >
                  {keyword}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-5 border-surface-200/50 dark:border-surface-700/50 shadow-lg">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="搜索历史记录..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-5 h-5" />}
              fullWidth
            />
          </div>
          <div className="flex gap-3">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
              className="px-4 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">全部时间</option>
              <option value="today">今天</option>
              <option value="week">最近一周</option>
              <option value="month">最近一月</option>
            </select>
          </div>
        </div>
      </Card>

      {selectedItems.size > 0 && (
        <Card className="p-4 bg-gradient-to-r from-error-50 to-error-100/50 dark:from-error-900/20 dark:to-error-800/20 border-error-200 dark:border-error-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-error-700 dark:text-error-300">
              已选择 {selectedItems.size} 条记录
            </span>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={handleBatchDelete}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                批量删除
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedItems(new Set())}
              >
                取消选择
              </Button>
            </div>
          </div>
        </Card>
      )}

      {Object.keys(groupedHistory).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedHistory).map(([date, items]) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-surface-500 dark:text-surface-400 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {new Date(date).toLocaleDateString('zh-CN', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h3>
              <Card className="divide-y divide-surface-200 dark:divide-surface-700 border-surface-200/50 dark:border-surface-700/50 shadow-lg overflow-hidden">
                {items.map(item => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-4 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                        className="rounded border-surface-300 dark:border-surface-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.code && (
                            <span className="text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded flex-shrink-0">
                              {item.code}
                            </span>
                          )}
                          <p className="font-medium text-surface-900 dark:text-surface-100">
                            {item.title || item.query}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-surface-500 dark:text-surface-400 mt-1 flex-wrap">
                          <span>{formatDate(item.createdAt)}</span>
                          {item.resultsCount !== undefined && (
                            <span className="px-2 py-0.5 bg-surface-100 dark:bg-surface-800 rounded">
                              {item.resultsCount}条
                            </span>
                          )}
                          {item.source && (
                            <Badge variant="outline">{item.source}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate('/main')}
                          title="重新搜索此关键词"
                          className="text-primary-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                        >
                          <Search className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-error-500 hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {(item.subtitle || item.actors || item.duration || item.releaseDate || item.publisher || item.tags) && (
                      <div className="space-y-1.5 pl-10">
                        {item.subtitle && (
                          <p className="text-xs text-surface-500 truncate">{item.subtitle}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          {item.actors && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <User className="w-2.5 h-2.5" />
                              {item.actors}
                            </span>
                          )}
                          {item.duration && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <Clock className="w-2.5 h-2.5" />
                              {item.duration}分钟
                            </span>
                          )}
                          {item.releaseDate && (
                            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                              <Calendar className="w-2.5 h-2.5" />
                              {item.releaseDate}
                            </span>
                          )}
                          {item.publisher && (
                            <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                              <Building2 className="w-2.5 h-2.5" />
                              {item.publisher}
                            </span>
                          )}
                        </div>
                        {item.tags && (
                          <div className="flex items-center gap-1 flex-wrap mt-1">
                            {item.tags.split(',').slice(0, 4).map((tag, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Clock className="w-12 h-12" />}
          title="暂无搜索历史"
          description="开始搜索后，历史记录将显示在这里"
        />
      )}
    </div>
  );
};
