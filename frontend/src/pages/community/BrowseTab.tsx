import React, { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import {
  Globe,
  Search,
  Heart,
  Download,
  Eye,
  User,
  MessageSquare,
  RefreshCw,
  Flag,
  Plus,
  Share2,
} from 'lucide-react';
import { Card, Button, Input, Modal, Loading, EmptyState, SourceIcon } from '@/components/ui';
import { communityApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores';
import type { SharedSource, Tag, CreateSharedSourceRequest } from '@/types';
import { StarRating, Pagination } from './shared';

export const BrowseTab: React.FC<{ tags: Tag[]; onImport: (source: SharedSource) => void }> = ({ tags, onImport }) => {
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const [sources, setSources] = useState<SharedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'rating'>('popular');
  const [detailSource, setDetailSource] = useState<SharedSource | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [reportModal, setReportModal] = useState<{ open: boolean; sourceId: string }>({ open: false, sourceId: '' });
  const [reportReason, setReportReason] = useState('');

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 500);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  const [shareModal, setShareModal] = useState(false);
  const [shareForm, setShareForm] = useState<CreateSharedSourceRequest>({
    sourceName: '', sourceSubtitle: '', sourceIcon: '', sourceUrlTemplate: '', sourceCategory: '', description: '', tags: [],
  });
  const [shareLoading, setShareLoading] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize: 12, status: 'active', sort: sortBy };
      if (searchDebounced) params.search = searchDebounced;
      if (selectedTag !== 'all') params.tags = [selectedTag];
      const res = await communityApi.getSharedSources(params);
      if (res.success && res.data) {
        setSources(res.data.items);
        setTotalPages(res.data.totalPages);
        setTotal(res.data.total);
        const likedSet = new Set<string>();
        res.data.items.forEach(s => {
          if (s.isLiked) likedSet.add(s.id);
        });
        setLikedIds(likedSet);
      }
    } catch { toast.error('加载失败'); } finally { setLoading(false); }
  }, [page, searchDebounced, selectedTag, sortBy]);

  useEffect(() => { loadSources(); }, [loadSources]);

  const handleLike = async (e: React.MouseEvent, sourceId: string) => {
    e.stopPropagation();
    if (!isAuthenticated) { toast.warning('请先登录'); return; }
    try {
      const res = await communityApi.likeSharedSource(sourceId);
      if (res.success) {
        setLikedIds(prev => {
          const next = new Set(prev);
          if (res.data.liked) { next.add(sourceId); } else { next.delete(sourceId); }
          return next;
        });
        setSources(prev => prev.map(s => s.id === sourceId ? { ...s, likeCount: s.likeCount + (res.data.liked ? 1 : -1) } : s));
        toast.success(res.data.liked ? '已点赞' : '已取消点赞');
      }
    } catch { toast.error('操作失败'); }
  };

  const openDetail = async (source: SharedSource) => {
    setDetailSource(source);
    try {
      const res = await communityApi.getReviews(source.id);
      if (res.success && res.data) setReviews(res.data.items);
    } catch (_error) {
      console.error('加载评论失败:', _error);
    }
  };

  const openImportModal = (e: React.MouseEvent, source: SharedSource) => {
    e.stopPropagation();
    if (!isAuthenticated) { toast.warning('请先登录'); return; }
    onImport(source);
  };

  const submitReview = async () => {
    if (!detailSource || !isAuthenticated) return;
    setSubmittingReview(true);
    try {
      const res = await communityApi.createReview({ sharedSourceId: detailSource.id, rating: reviewForm.rating, comment: reviewForm.comment });
      if (res.success) {
        toast.success('评价已提交');
        const res2 = await communityApi.getReviews(detailSource.id);
        if (res2.success) setReviews(res2.data.items);
        setReviewForm({ rating: 5, comment: '' });
      }
    } catch { toast.error('提交失败'); } finally { setSubmittingReview(false); }
  };

  const handleReport = async () => {
    if (!reportReason.trim()) { toast.error('请选择举报原因'); return; }
    try {
      await communityApi.reportSharedSource(reportModal.sourceId, { reason: reportReason });
      toast.success('举报已提交');
      setReportModal({ open: false, sourceId: '' });
      setReportReason('');
    } catch { toast.error('提交失败'); }
  };

  const handleShare = async () => {
    if (!isAuthenticated) { toast.warning('请先登录'); return; }
    if (!shareForm.sourceName || !shareForm.sourceUrlTemplate || !shareForm.sourceCategory) { 
      toast.error('请填写必填字段（名称、URL模板、分类）'); 
      return; 
    }
    setShareLoading(true);
    try {
      const res = await communityApi.createSharedSource(shareForm);
      if (res.success) { 
        toast.success('分享成功！'); 
        setShareModal(false); 
        setShareForm({ 
          sourceName: '', 
          sourceSubtitle: '', 
          sourceIcon: '', 
          sourceUrlTemplate: '', 
          sourceCategory: '', 
          description: '', 
          tags: [] 
        }); 
        loadSources(); 
      }
    } catch { toast.error('分享失败'); } finally { setShareLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loading size="lg" text="加载社区内容..." /></div>;

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input placeholder="搜索搜索源名称、描述..." value={search} onChange={e => setSearch(e.target.value)} leftIcon={<Search className="w-4 h-4" />} fullWidth />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={selectedTag} onChange={e => { setSelectedTag(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm">
              <option value="all">所有标签</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={sortBy} onChange={e => { setSortBy(e.target.value as any); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm">
              <option value="popular">最受欢迎</option>
              <option value="recent">最新发布</option>
              <option value="rating">评分最高</option>
            </select>
            <Button variant="outline" size="sm" onClick={loadSources}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>
      </Card>

      {sources.length === 0 ? (
        <EmptyState icon={<Globe className="w-12 h-12" />} title="没有找到搜索源" description="尝试调整筛选条件" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map(source => (
            <Card
              key={source.id}
              className="p-5 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col cursor-pointer"
              onClick={() => openDetail(source)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <SourceIcon icon={source.sourceIcon} name={source.sourceName} size="lg" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-surface-900 dark:text-surface-100 truncate">{source.sourceName}</h3>
                    {source.sourceSubtitle && <p className="text-xs text-surface-500 truncate">{source.sourceSubtitle}</p>}
                    <div className="mt-1"><StarRating rating={Math.round(source.ratingScore)} /></div>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setReportModal({ open: true, sourceId: source.id }); setReportReason(''); }}
                  className="p-1.5 rounded-lg text-surface-300 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all flex-shrink-0"
                  title="举报"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-sm text-surface-600 dark:text-surface-400 line-clamp-2 mb-3 flex-1">{source.description || '暂无描述'}</p>

              <div className="flex flex-wrap gap-1 mb-3">
                <span className="px-1.5 py-0.5 text-xs bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 rounded">{source.sourceCategory}</span>
                {source.tags.slice(0, 2).map(tagId => {
                  const tag = tags.find(t => t.id === tagId);
                  return tag ? <span key={tagId} className="px-1.5 py-0.5 text-xs rounded border" style={{ borderColor: tag.color + '60', color: tag.color }}>{tag.name}</span> : null;
                })}
                {source.tags.length > 2 && <span className="px-1.5 py-0.5 text-xs bg-surface-100 dark:bg-surface-700 text-surface-500 rounded">+{source.tags.length - 2}</span>}
              </div>

              <div className="flex items-center justify-between text-xs text-surface-500 mb-3">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{source.viewCount}</span>
                  <span className="flex items-center gap-1"><Download className="w-3 h-3" />{source.downloadCount}</span>
                  <span className="flex items-center gap-1"><Heart className={clsx('w-3 h-3', likedIds.has(source.id) && 'fill-current text-red-500')} />{source.likeCount}</span>
                </div>
                <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{source.ratingCount}</span>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-surface-200 dark:border-surface-700" onClick={e => e.stopPropagation()}>
                <span className="text-xs text-surface-400">by {source.authorName || '匿名'}</span>
                <div className="flex gap-2">
                  <button
                    onClick={e => handleLike(e, source.id)}
                    className={clsx('p-1.5 rounded-lg transition-all', likedIds.has(source.id) ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20')}
                  >
                    <Heart className={clsx('w-4 h-4', likedIds.has(source.id) && 'fill-current')} />
                  </button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={e => openImportModal(e, source)}
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                  >导入</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      {/* 详情弹窗 */}
      <Modal isOpen={!!detailSource} onClose={() => setDetailSource(null)} title="搜索源详情" size="lg">
        {detailSource && (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <SourceIcon icon={detailSource.sourceIcon} name={detailSource.sourceName} size="xl" />
              <div>
                <h3 className="text-xl font-bold text-surface-900 dark:text-surface-100">{detailSource.sourceName}</h3>
                {detailSource.sourceSubtitle && <p className="text-surface-500 text-sm">{detailSource.sourceSubtitle}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <StarRating rating={Math.round(detailSource.ratingScore)} />
                  <span className="text-sm text-surface-500">({detailSource.ratingCount} 评价)</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl text-sm text-surface-700 dark:text-surface-300">{detailSource.description || '暂无描述'}</div>

            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: Eye, label: '浏览', value: detailSource.viewCount, color: 'text-blue-500' },
                { icon: Download, label: '导入', value: detailSource.downloadCount, color: 'text-green-500' },
                { icon: Heart, label: '点赞', value: detailSource.likeCount, color: 'text-red-500' },
                { icon: User, label: '作者', value: detailSource.authorName || '匿名', color: 'text-purple-500' },
              ].map(item => (
                <div key={item.label} className="text-center p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
                  <item.icon className={clsx('w-5 h-5 mx-auto mb-1', item.color)} />
                  <p className="text-sm font-bold text-surface-900 dark:text-surface-100 truncate">{item.value}</p>
                  <p className="text-xs text-surface-500">{item.label}</p>
                </div>
              ))}
            </div>

            <div>
              <h4 className="font-semibold text-surface-900 dark:text-surface-100 mb-3">用户评价 ({reviews.length})</h4>
              {reviews.length > 0 ? (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {reviews.map(r => (
                    <div key={r.id} className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm text-surface-900 dark:text-surface-100">{r.userName || '匿名用户'}</span>
                        <StarRating rating={r.rating} />
                      </div>
                      {r.comment && <p className="text-sm text-surface-600 dark:text-surface-400">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-surface-400">暂无评价</p>}

              {isAuthenticated && (
                <div className="mt-4 p-4 border border-surface-200 dark:border-surface-700 rounded-xl space-y-3">
                  <h5 className="font-medium text-sm text-surface-900 dark:text-surface-100">写评价</h5>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-surface-500">评分：</span>
                    <StarRating rating={reviewForm.rating} interactive onRate={r => setReviewForm(f => ({ ...f, rating: r }))} />
                  </div>
                  <textarea value={reviewForm.comment} onChange={e => setReviewForm(f => ({ ...f, comment: e.target.value }))} placeholder="分享你的使用体验..." rows={2} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm" />
                  <div className="flex justify-end">
                    <Button variant="primary" size="sm" onClick={submitReview} disabled={submittingReview}>提交评价</Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDetailSource(null)}>关闭</Button>
              <Button
                variant="primary"
                onClick={(e) => { openImportModal(e as any, detailSource); setDetailSource(null); }}
                leftIcon={<Download className="w-4 h-4" />}
              >导入到我的列表</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 举报弹窗 */}
      <Modal isOpen={reportModal.open} onClose={() => setReportModal({ open: false, sourceId: '' })} title="举报搜索源">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">举报原因</label>
            <select value={reportReason} onChange={e => setReportReason(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
              <option value="">请选择原因</option>
              <option value="invalid_url">链接无效</option>
              <option value="spam">垃圾内容</option>
              <option value="misleading">误导性内容</option>
              <option value="illegal">违法内容</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setReportModal({ open: false, sourceId: '' })}>取消</Button>
            <Button variant="primary" onClick={handleReport}>提交举报</Button>
          </div>
        </div>
      </Modal>

      {/* 分享搜索源弹窗 */}
      <Modal isOpen={shareModal} onClose={() => setShareModal(false)} title="分享搜索源" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="名称 *" value={shareForm.sourceName} onChange={e => setShareForm(f => ({ ...f, sourceName: e.target.value }))} placeholder="搜索源名称" fullWidth />
            <Input label="副标题" value={shareForm.sourceSubtitle || ''} onChange={e => setShareForm(f => ({ ...f, sourceSubtitle: e.target.value }))} placeholder="简短描述" fullWidth />
          </div>
          <Input label="URL模板 *" value={shareForm.sourceUrlTemplate} onChange={e => setShareForm(f => ({ ...f, sourceUrlTemplate: e.target.value }))} placeholder="https://example.com/search?q={keyword}" fullWidth />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="分类 *" value={shareForm.sourceCategory} onChange={e => setShareForm(f => ({ ...f, sourceCategory: e.target.value }))} placeholder="视频、音乐、软件..." fullWidth />
            <Input label="图标URL" value={shareForm.sourceIcon || ''} onChange={e => setShareForm(f => ({ ...f, sourceIcon: e.target.value }))} placeholder="https://..." fullWidth />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">描述</label>
            <textarea value={shareForm.description} onChange={e => setShareForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm" placeholder="详细描述搜索源特点..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">标签</label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button key={tag.id} type="button" onClick={() => setShareForm(f => ({ ...f, tags: f.tags?.includes(tag.id) ? f.tags.filter(t => t !== tag.id) : [...(f.tags || []), tag.id] }))} className={clsx('px-3 py-1 rounded-full text-sm transition-all', shareForm.tags?.includes(tag.id) ? 'text-white shadow-md' : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600')} style={shareForm.tags?.includes(tag.id) ? { backgroundColor: tag.color } : {}}>
                  {tag.name}
                </button>
              ))}
              {tags.length === 0 && <span className="text-sm text-surface-400">暂无标签</span>}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShareModal(false)}>取消</Button>
            <Button variant="primary" onClick={handleShare} disabled={shareLoading} leftIcon={<Share2 className="w-4 h-4" />}>
              {shareLoading ? '提交中...' : '提交分享'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 悬浮分享按钮 */}
      <button
        onClick={() => {
          if (!isAuthenticated) { toast.warning('请先登录'); return; }
          setShareForm({ sourceName: '', sourceSubtitle: '', sourceIcon: '', sourceUrlTemplate: '', sourceCategory: '', description: '', tags: [] });
          setShareModal(true);
        }}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-50 group"
        title="分享搜索源"
      >
        <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
      </button>
    </div>
  );
};
