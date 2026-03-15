import React, { useState, useEffect, useCallback } from 'react';
import { Heart, Download, RefreshCw } from 'lucide-react';
import { Card, Button, Loading, EmptyState, SourceIcon } from '@/components/ui';
import { communityApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores';
import type { SharedSource, Tag } from '@/types';
import { StarRating, Pagination } from './shared';

export const FavoritesTab: React.FC<{ tags: Tag[]; onImport: (source: SharedSource) => void }> = ({ onImport }) => {
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const [sources, setSources] = useState<SharedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await communityApi.getMyFavorites(page, 12);
      if (res.success && res.data) {
        setSources(res.data.items);
        setTotalPages(res.data.totalPages);
        setTotal(res.data.total);
      }
    } catch { toast.error('加载失败'); } finally { setLoading(false); }
  }, [page, isAuthenticated]);

  useEffect(() => { load(); }, [load]);

  const handleImport = (source: SharedSource) => {
    if (!isAuthenticated) { toast.warning('请先登录'); return; }
    onImport(source);
  };

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<Heart className="w-10 h-10" />}
        title="请先登录"
        description="登录后可查看你点赞收藏的搜索源"
      />
    );
  }

  if (loading) return <div className="flex justify-center py-12"><Loading /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-surface-500">
          <Heart className="w-4 h-4 text-red-400" />
          <span>你点赞收藏的搜索源（共 {total} 个）</span>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" />刷新
        </Button>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          icon={<Heart className="w-10 h-10" />}
          title="还没有收藏"
          description="在社区浏览页点赞搜索源，它们将出现在这里"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map(source => (
            <Card key={source.id} className="p-4">
              <div className="flex items-center gap-3 min-w-0 mb-3">
                <SourceIcon icon={source.sourceIcon} name={source.sourceName} size="md" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-surface-900 dark:text-surface-100 truncate text-sm">{source.sourceName}</h3>
                  {source.sourceSubtitle && (
                    <p className="text-xs text-surface-500 truncate">{source.sourceSubtitle}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-surface-500 mt-0.5">
                    <StarRating rating={Math.round(source.ratingScore)} />
                    <span>({source.ratingCount})</span>
                  </div>
                </div>
              </div>
              {source.description && (
                <p className="text-xs text-surface-500 line-clamp-2 mb-3">{source.description}</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-surface-100 dark:border-surface-700">
                <span className="text-xs text-surface-400">
                  {source.sourceCategory} · by {source.authorName || '匿名'}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleImport(source)}
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                >
                  导入
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
    </div>
  );
};
