import React, { useState, useEffect } from 'react';
import { Film, Tv, BookOpen, Eye, Heart, MessageSquare, Bookmark, Calendar, User, Award, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Loading, Badge } from '@/components/ui';
import { communityApi } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import type { CommunityPost } from '@/types/community';

const POST_TYPE_CONFIG = {
  jav: { label: '番号', icon: Film, color: 'text-rose-500' },
  anime: { label: '动漫', icon: Tv, color: 'text-rose-500' },
  movie: { label: '影视', icon: Film, color: 'text-amber-500' },
  manga: { label: '漫画', icon: BookOpen, color: 'text-violet-500' },
  actress: { label: '女优', icon: Users, color: 'text-pink-500' },
};

export const TrendingTab: React.FC = () => {
  const toast = useToast();
  const [popular, setPopular] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await communityApi.getPosts({ sort: 'hot', pageSize: 10 });
        if (!cancelled) setPopular(response.items || []);
      } catch { if (!cancelled) toast.error('加载失败'); } finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loading /></div>;

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const PostRow: React.FC<{ post: CommunityPost; rank: number }> = ({ post, rank }) => {
    const typeConfig = POST_TYPE_CONFIG[post.postType];
    const TypeIcon = typeConfig.icon;

    return (
      <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-all">
        <div className={clsx(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
          rank <= 3 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30' : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400'
        )}>
          {rank}
        </div>
        {/* 封面缩略图 */}
        <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-stone-100 dark:bg-stone-800">
          {post.coverImage ? (
            <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <TypeIcon className="w-5 h-5 text-stone-300 dark:text-stone-600" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-stone-900 dark:text-stone-100 truncate">{post.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="default" size="sm" className={typeConfig.color}>
              <TypeIcon className="w-3 h-3 mr-1" />
              {typeConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-stone-500 mt-1">
            <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{post.viewCount}</span>
            <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{post.likeCount}</span>
            <span className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{post.commentCount}</span>
            <span className="flex items-center gap-0.5"><Bookmark className="w-3 h-3" />{post.favoriteCount}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-stone-400 flex items-center gap-1 justify-end">
            <Calendar className="w-3 h-3" />{formatDate(post.createdAt)}
          </p>
          <p className="text-xs text-stone-400 flex items-center gap-1 justify-end">
            <User className="w-3 h-3" />{post.userName || '匿名'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" />
            最受欢迎排行
          </h3>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 p-3 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            <strong>排序规则：</strong>按浏览量、点赞数综合排序，浏览量和点赞数越高排名越靠前。
          </p>
        </div>

        <div className="space-y-1">
          {popular.map((post, i) => <PostRow key={post.id} post={post} rank={i + 1} />)}
        </div>
        {popular.length === 0 && (
          <div className="text-center py-8">
            <Award className="w-12 h-12 mx-auto text-stone-300 mb-2" />
            <p className="text-sm text-stone-400">暂无数据</p>
          </div>
        )}
      </Card>
    </div>
  );
};
