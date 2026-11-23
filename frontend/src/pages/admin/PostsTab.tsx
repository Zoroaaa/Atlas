/**
 * 管理后台 · 社区帖子：按状态/类型/关键词检索，隐藏或恢复帖子。
 *
 * 对应接口：GET /community/posts?status=…（管理员可查 hidden）与
 * PUT /community/posts/:id/status；普通用户只能看到 active。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Eye, EyeOff, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { communityApi } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/hooks/useNotification';
import type { CommunityPost } from '@/types';
import { formatDate, Pagination, TableWrapper } from './shared';

const PAGE_SIZE = 20;
const POST_TYPES = ['jav', 'anime', 'movie', 'manga', 'novel', 'actress'] as const;

export const PostsTab: React.FC = () => {
  const { t } = useTranslation(['admin']);
  const toast = useToast();

  const [status, setStatus] = useState<'active' | 'hidden'>('active');
  const [postType, setPostType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await communityApi.getPosts({
        page,
        pageSize: PAGE_SIZE,
        status,
        postType: postType || undefined,
        search: search || undefined,
      });
      setPosts(data.items || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      toast.error(t('admin:posts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, status, postType, search, toast, t]);

  useEffect(() => { void load(); }, [load]);

  const toggleStatus = async (post: CommunityPost) => {
    const next = post.status === 'hidden' ? 'active' : 'hidden';
    setUpdatingId(post.id);
    try {
      await communityApi.updatePostStatus(post.id, next);
      toast.success(next === 'hidden' ? t('admin:posts.hiddenToast') : t('admin:posts.restoredToast'));
      await load();
    } catch {
      toast.error(t('admin:posts.opFailed'));
    } finally {
      setUpdatingId(null);
    }
  };

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as 'active' | 'hidden'); setPage(1); }}
          className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"
        >
          <option value="active">{t('admin:posts.filterActive')}</option>
          <option value="hidden">{t('admin:posts.filterHidden')}</option>
        </select>
        <select
          value={postType}
          onChange={(e) => { setPostType(e.target.value); setPage(1); }}
          className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"
        >
          <option value="">{t('admin:posts.allTypes')}</option>
          {POST_TYPES.map((type) => (
            <option key={type} value={type}>{t(`admin:posts.types.${type}`)}</option>
          ))}
        </select>
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder={t('admin:posts.searchPlaceholder')}
            leftIcon={<Search className="h-4 w-4" />}
            fullWidth
          />
          <Button variant="outline" size="sm" onClick={applySearch}>{t('admin:posts.search')}</Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />{t('admin:posts.refresh')}
        </Button>
      </div>

      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>
              {[t('admin:posts.table.title'), t('admin:posts.table.author'), t('admin:posts.table.type'), t('admin:posts.table.stats'), t('admin:posts.table.status'), t('admin:posts.table.time'), t('admin:posts.table.actions')].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">{t('admin:posts.loading')}</td></tr>
            ) : posts.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">{t('admin:posts.empty')}</td></tr>
            ) : posts.map((post) => (
              <tr key={post.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                <td className="max-w-[280px] px-4 py-3">
                  <Link
                    to={`/community/post/${post.id}`}
                    className="line-clamp-1 font-medium text-surface-900 hover:text-primary-600 dark:text-surface-100"
                  >
                    {post.title || t('admin:posts.untitled')}
                  </Link>
                  {post.caption ? <p className="mt-0.5 line-clamp-1 text-xs text-surface-500">{post.caption}</p> : null}
                </td>
                <td className="px-4 py-3 text-surface-700 dark:text-surface-300">{post.userName || t('admin:posts.anonymous')}</td>
                <td className="px-4 py-3 text-surface-500">{t(`admin:posts.types.${post.postType}`)}</td>
                <td className="px-4 py-3 text-xs text-surface-500">
                  {t('admin:posts.stats', { views: post.viewCount, likes: post.likeCount, comments: post.commentCount })}
                </td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                    post.status === 'hidden'
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                  )}>
                    {post.status === 'hidden' ? t('admin:posts.statusHidden') : t('admin:posts.statusActive')}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-surface-500">{formatDate(post.createdAt)}</td>
                <td className="px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={updatingId === post.id}
                    disabled={updatingId === post.id}
                    onClick={() => void toggleStatus(post)}
                  >
                    {post.status === 'hidden'
                      ? <><Eye className="mr-1.5 h-3.5 w-3.5" />{t('admin:posts.restore')}</>
                      : <><EyeOff className="mr-1.5 h-3.5 w-3.5" />{t('admin:posts.hide')}</>}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableWrapper>
    </div>
  );
};
