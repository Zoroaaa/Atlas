import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import {
  ArrowLeft,
  Heart,
  Bookmark,
  Share2,
  Eye,
  MessageSquare,
  Film,
  Tv,
  Star,
  Users,
  Link as LinkIcon,
  Copy,
  Download,
  Calendar,
  Clock,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { CommentsSection } from './CommentsSection';
import { PostCard } from './PostCard';
import { useToast } from '@/components/ui/Toast';

interface PostDetailProps {
  postId: string;
  onBack?: () => void;
}

const POST_TYPE_CONFIG = {
  jav: { label: '番号', icon: Film, color: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' },
  anime: { label: '动漫', icon: Tv, color: 'text-violet-500 bg-violet-50 dark:bg-violet-900/20' },
  movie: { label: '影视', icon: Film, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
};

const formatDate = (timestamp: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// JAV 内容渲染
const JAVContentRenderer: React.FC<{ data: Record<string, any> }> = ({ data }) => (
  <div className="space-y-4">
    {/* 封面大图 */}
    {(data.coverImage || data.cover) && (
      <div className="rounded-xl overflow-hidden">
        <img src={data.coverImage || data.cover} alt={data.title || ''} className="w-full max-h-[400px] object-cover" />
      </div>
    )}

    {/* 基本信息 */}
    <div className="grid grid-cols-2 gap-3 text-sm">
      {data.code && (
        <div>
          <span className="text-slate-400">番号</span>
          <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">{data.code}</p>
        </div>
      )}
      {data.releaseDate && (
        <div>
          <span className="text-slate-400">发布日期</span>
          <p className="text-slate-700 dark:text-slate-300">{data.releaseDate}</p>
        </div>
      )}
      {data.duration && (
        <div>
          <span className="text-slate-400">时长</span>
          <p className="text-slate-700 dark:text-slate-300">{data.duration}</p>
        </div>
      )}
      {(data.studio || data.publisher || data.maker) && (
        <div>
          <span className="text-slate-400">制作商</span>
          <p className="text-slate-700 dark:text-slate-300">{data.studio || data.publisher || data.maker}</p>
        </div>
      )}
    </div>

    {/* 演员列表 */}
    {data.actresses && Array.isArray(data.actresses) && data.actresses.length > 0 && (
      <div>
        <h4 className="flex items-center gap-2 font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">
          <Users className="w-4 h-4" />
          演员 ({data.actresses.length})
        </h4>
        <div className="flex flex-wrap gap-2">
          {data.actresses.map((actress: string | { name?: string }, idx: number) => (
            <Badge key={idx} variant="default" size="md">
              {typeof actress === 'string' ? actress : actress.name}
            </Badge>
          ))}
        </div>
      </div>
    )}

    {/* 标签 */}
    {data.tags && Array.isArray(data.tags) && data.tags.length > 0 && (
      <div>
        <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">标签</h4>
        <div className="flex flex-wrap gap-1.5">
          {data.tags.map((tag: string, idx: number) => (
            <span key={idx} className="px-2.5 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tag}
            </span>
          ))}
        </div>
      </div>
    )}

    {/* 磁力链接列表 */}
    {(data.magnetLinks || data.magnets) && Array.isArray(data.magnetLinks || data.magnets) && (data.magnetLinks || data.magnets).length > 0 && (
      <div>
        <h4 className="flex items-center gap-2 font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">
          <LinkIcon className="w-4 h-4" />
          磁力链接 ({(data.magnetLinks || data.magnets).length})
        </h4>
        <div className="space-y-2">
          {(data.magnetLinks || data.magnets).map((link: any, idx: number) => (
            <MagnetLinkItem key={idx} link={link} index={idx + 1} />
          ))}
        </div>
      </div>
    )}
  </div>
);

// Anime 内容渲染
const AnimeContentRenderer: React.FC<{ data: Record<string, any> }> = ({ data }) => (
  <div className="space-y-4">
    {/* 封面 */}
    {(data.coverImage || data.cover) && (
      <div className="rounded-xl overflow-hidden">
        <img src={data.coverImage || data.cover} alt={data.title || ''} className="w-full max-h-[350px] object-cover" />
      </div>
    )}

    {/* BGM 信息和评分 */}
    <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
      {data.rating && (
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={clsx(
                'w-5 h-5',
                star <= Math.round(data.rating / 2)
                  ? 'fill-warning-500 text-warning-500'
                  : 'text-slate-300 dark:text-slate-600'
              )}
            />
          ))}
          <span className="font-bold text-slate-900 dark:text-slate-100 ml-1">{data.rating}</span>
        </div>
      )}
      {data.bgmId && (
        <Badge variant="primary" size="sm">
          BGM: {data.bgmId}
        </Badge>
      )}
      {data.episodeCount && (
        <span className="text-sm text-slate-600 dark:text-slate-400">共 {data.episodeCount} 集</span>
      )}
      {data.airDate && (
        <span className="text-sm text-slate-500 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />{data.airDate}
        </span>
      )}
    </div>

    {/* 简介 */}
    {data.synopsis && (
      <div>
        <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">简介</h4>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
          {data.synopsis}
        </p>
      </div>
    )}

    {/* 资源列表 */}
    {data.resources && Array.isArray(data.resources) && data.resources.length > 0 && (
      <div>
        <h4 className="flex items-center gap-2 font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">
          <Download className="w-4 h-4" />
          资源 ({data.resources.length})
        </h4>
        <div className="space-y-2">
          {data.resources.map((resource: any, idx: number) => (
            <ResourceItem key={idx} resource={resource} index={idx + 1} />
          ))}
        </div>
      </div>
    )}
  </div>
);

// Movie 内容渲染
const MovieContentRenderer: React.FC<{ data: Record<string, any> }> = ({ data }) => (
  <div className="space-y-4">
    {/* 海报 */}
    {(data.posterPath || data.coverImage || data.cover) && (
      <div className="rounded-xl overflow-hidden max-w-xs mx-auto">
        <img src={data.posterPath || data.coverImage || data.cover} alt={data.title || ''} className="w-full object-cover" />
      </div>
    )}

    {/* TMDB 信息 */}
    {(data.tmdbRating || data.releaseDate || data.runtime) && (
      <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center">
        {data.tmdbRating && (
          <div>
            <div className="flex justify-center items-center gap-1 mb-1">
              <Star className="w-4 h-4 fill-warning-500 text-warning-500" />
              <span className="font-bold text-lg text-slate-900 dark:text-slate-100">{data.tmdbRating}</span>
            </div>
            <span className="text-xs text-slate-400">TMDB评分</span>
          </div>
        )}
        {data.releaseDate && (
          <div>
            <Calendar className="w-5 h-5 mx-auto mb-1 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{data.releaseDate}</p>
            <span className="text-xs text-slate-400">上映日期</span>
          </div>
        )}
        {data.runtime && (
          <div>
            <Clock className="w-5 h-5 mx-auto mb-1 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{data.runtime}分钟</p>
            <span className="text-xs text-slate-400">片长</span>
          </div>
        )}
      </div>
    )}

    {/* 简介 */}
    {data.overview && (
      <div>
        <h4 className="font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">简介</h4>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
          {data.overview}
        </p>
      </div>
    )}

    {/* 下载资源 */}
    {data.downloadResources && Array.isArray(data.downloadResources) && data.downloadResources.length > 0 && (
      <div>
        <h4 className="flex items-center gap-2 font-medium text-sm text-slate-700 dark:text-slate-300 mb-2">
          <Download className="w-4 h-4" />
          下载资源 ({data.downloadResources.length})
        </h4>
        <div className="space-y-2">
          {data.downloadResources.map((resource: any, idx: number) => (
            <ResourceItem key={idx} resource={resource} index={idx + 1} />
          ))}
        </div>
      </div>
    )}
  </div>
);

// 磁力链接项
const MagnetLinkItem: React.FC<{ link: any; index: number }> = ({ link, index }) => {
  const [copied, setCopied] = useState(false);
  const magnetUrl = typeof link === 'string' ? link : link.url || link.magnet || '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(magnetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
      <span className="text-xs font-mono text-slate-400 w-6 shrink-0">#{index}</span>
      <code className="flex-1 text-xs text-slate-600 dark:text-slate-400 truncate font-mono">
        {magnetUrl.slice(0, 60)}...
      </code>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all opacity-0 group-hover:opacity-100"
        title="复制磁力链接"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      {copied && <span className="text-xs text-success-500 shrink-0">已复制!</span>}
    </div>
  );
};

// 资源项
const ResourceItem: React.FC<{ resource: any; index: number }> = ({ resource, index }) => {
  const [copied, setCopied] = useState(false);
  const url = resource.url || resource.link || resource.magnet || '';
  const name = resource.name || resource.title || `资源 ${index}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
      <span className="text-xs font-semibold text-white w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shrink-0">
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{name}</p>
        {resource.size && (
          <span className="text-xs text-slate-400">{resource.size}</span>
        )}
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
        title="复制链接"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      {copied && <span className="text-xs text-success-500 shrink-0">已复制!</span>}
    </div>
  );
};

export const PostDetail: React.FC<PostDetailProps> = ({ postId, onBack }) => {
  const toast = useToast();
  const {
    currentPost,
    postsLoading,
    posts,
    fetchPost,
    toggleLike,
    toggleFavorite,
  } = useCommunityStore();

  const [relatedPosts, setRelatedPosts] = useState<typeof posts>([]);

  useEffect(() => {
    if (postId) {
      fetchPost(postId);
    }
  }, [postId, fetchPost]);

  // 获取相关推荐
  useEffect(() => {
    if (currentPost) {
      const related = posts
        .filter(p => p.id !== currentPost.id && p.postType === currentPost.postType)
        .slice(0, 6);
      setRelatedPosts(related);
    }
  }, [currentPost, posts]);

  if (postsLoading && !currentPost) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        <div className="aspect-[16/9] bg-slate-200 dark:bg-slate-700 rounded-xl" />
        <div className="space-y-3">
          <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-lg" />
          <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!currentPost) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">帖子不存在或已被删除</p>
        {onBack && (
          <Button variant="outline" onClick={onBack} className="mt-4">
            返回
          </Button>
        )}
      </div>
    );
  }

  let contentData: Record<string, any> = {};
  try {
    contentData = typeof currentPost.contentData === 'string' ? JSON.parse(currentPost.contentData) : (currentPost.contentData || {});
  } catch {
    contentData = {};
  }

  const typeConfig = POST_TYPE_CONFIG[currentPost.postType];
  const TypeIcon = typeConfig.icon;

  const handleShare = () => {
    const url = `${window.location.origin}/community/post/${postId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('链接已复制到剪贴板');
    }).catch(() => {
      toast.error('复制失败');
    });
  };

  // 根据类型选择渲染器
  const renderContent = () => {
    switch (currentPost.postType) {
      case 'jav':
        return <JAVContentRenderer data={contentData} />;
      case 'anime':
        return <AnimeContentRenderer data={contentData} />;
      case 'movie':
        return <MovieContentRenderer data={contentData} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回
          </Button>
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: typeConfig.color.includes('bg-') ? undefined : undefined }}>
          <TypeIcon className={clsx('w-4 h-4', typeConfig.color.split(' ')[0])} />
          <span className={clsx('text-sm font-medium', typeConfig.color.split(' ')[0])}>{typeConfig.label}</span>
        </div>
      </div>

      {/* 帖子头部 */}
      <Card padding="lg">
        <div className="space-y-4">
          {/* 帖子封面 */}
          {currentPost.coverImage && (
            <div className="rounded-xl overflow-hidden -mt-2 -mx-2 mb-4">
              <img
                src={currentPost.coverImage}
                alt={currentPost.title}
                className="w-full max-h-[360px] object-contain bg-slate-100 dark:bg-slate-800"
              />
            </div>
          )}

          {/* 标题 */}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
            {currentPost.title}
          </h1>

          {/* 推荐语 */}
          {currentPost.caption && (
            <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed italic border-l-3 border-blue-400 pl-4 py-1 bg-blue-50/50 dark:bg-blue-900/10 rounded-r-lg">
              "{currentPost.caption}"
            </p>
          )}

          {/* 作者信息和时间 */}
          <div className="flex items-center gap-3 pt-2">
            {currentPost.userAvatar ? (
              <img
                src={currentPost.userAvatar}
                alt={currentPost.userName}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-sm font-bold text-white">
                {currentPost.userName?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                {currentPost.userName || '匿名用户'}
              </p>
              <p className="text-xs text-slate-400">{formatDate(currentPost.createdAt)}</p>
            </div>
          </div>

          {/* 互动操作栏 */}
          <div className="flex items-center gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{currentPost.viewCount.toLocaleString()}</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" />{currentPost.commentCount}</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleLike(currentPost.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                  currentPost.isLiked
                    ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                )}
              >
                <Heart className={clsx('w-4 h-4', currentPost.isLiked && 'fill-current')} />
                {currentPost.likeCount}
              </button>
              <button
                onClick={() => toggleFavorite(currentPost.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                  currentPost.isFavorited
                    ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                )}
              >
                <Bookmark className={clsx('w-4 h-4', currentPost.isFavorited && 'fill-current')} />
                收藏
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
              >
                <Share2 className="w-4 h-4" />
                分享
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* 内容数据渲染区 */}
      <Card padding="lg">
        {renderContent()}
      </Card>

      {/* 标签展示 */}
      {currentPost.tags && currentPost.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {currentPost.tags.map((tag, idx) => (
            <Badge key={idx} variant="outline" size="md">
              #{tag}
            </Badge>
          ))}
        </div>
      )}

      {/* 评论区 */}
      <CommentsSection postId={postId} />

      {/* 相关推荐 */}
      {relatedPosts.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">
            相关推荐
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {relatedPosts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLike={(id) => toggleLike(id)}
                onFavorite={(id) => toggleFavorite(id)}
                onClick={(_id) => {} /* 在详情页内点击不处理，可扩展为切换帖子 */}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
