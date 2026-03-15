import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Award, Download, Eye, Heart, Calendar, User } from 'lucide-react';
import { Card, Button, Loading, SourceIcon } from '@/components/ui';
import { communityApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import type { SharedSource, Tag } from '@/types';
import { StarRating } from './shared';

export const TrendingTab: React.FC<{ tags: Tag[]; onImport: (source: SharedSource) => void }> = ({ tags, onImport }) => {
  const toast = useToast();
  const [popular, setPopular] = useState<SharedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const tagParam = selectedTag !== 'all' ? selectedTag : undefined;
        const p = await communityApi.getPopularSources(10, tagParam);
        if (p.success) setPopular(p.data);
      } catch { toast.error('加载失败'); } finally { setLoading(false); }
    };
    load();
  }, [selectedTag]);

  if (loading) return <div className="flex justify-center py-12"><Loading /></div>;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const handleImport = (source: SharedSource) => {
    onImport(source);
  };

  const SourceRow: React.FC<{ source: SharedSource; rank: number }> = ({ source, rank }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-all">
      <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0', rank <= 3 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-400')}>{rank}</div>
      <SourceIcon icon={source.sourceIcon} name={source.sourceName} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-surface-900 dark:text-surface-100 truncate">{source.sourceName}</p>
        <div className="flex items-center gap-3 text-xs text-surface-500 mt-0.5">
          <StarRating rating={Math.round(source.ratingScore)} />
          <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{source.viewCount}</span>
          <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{source.likeCount}</span>
          <span className="flex items-center gap-0.5"><Download className="w-3 h-3" />{source.downloadCount}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-surface-400 flex items-center gap-1 justify-end"><Calendar className="w-3 h-3" />{formatDate(source.createdAt)}</p>
        <p className="text-xs text-surface-400 flex items-center gap-1 justify-end"><User className="w-3 h-3" />{source.authorName || '匿名'}</p>
      </div>
      <Button variant="primary" size="sm" onClick={() => handleImport(source)} leftIcon={<Download className="w-3.5 h-3.5" />}>导入</Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" />
            最受欢迎排行
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-surface-500">按标签筛选：</span>
            <select 
              value={selectedTag} 
              onChange={e => setSelectedTag(e.target.value)} 
              className="px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm"
            >
              <option value="all">全部标签</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg">
          <p className="text-sm text-surface-600 dark:text-surface-400">
            <strong>排序规则：</strong>按浏览量、点赞数综合排序，浏览量和点赞数越高排名越靠前。
          </p>
        </div>
        
        <div className="space-y-1">
          {popular.map((s, i) => <SourceRow key={s.id} source={s} rank={i + 1} />)}
        </div>
        {popular.length === 0 && (
          <div className="text-center py-8">
            <Award className="w-12 h-12 mx-auto text-surface-300 mb-2" />
            <p className="text-sm text-surface-400">暂无数据</p>
          </div>
        )}
      </Card>
    </div>
  );
};
