import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Heart, Star, MessageSquare, Eye, Bookmark, Users, Film, Tv } from 'lucide-react';
import { Card, Badge, ProxyImage } from '@/components/ui';
import type { CommunityPost } from '@/types/community';
import { getBackendBaseUrl } from '@/constants';

interface PostCardProps {
  post: CommunityPost;
  onLike?: (postId: string) => void;
  onFavorite?: (postId: string) => void;
  onClick?: (postId: string) => void;
}

const POST_TYPE_CONFIG = {
  jav: { label: '番号', icon: Film, color: 'bg-rose-500', badgeVariant: 'error' as const },
  anime: { label: '动漫', icon: Tv, color: 'bg-rose-500', badgeVariant: 'accent' as const },
  movie: { label: '影视', icon: Film, color: 'bg-amber-500', badgeVariant: 'primary' as const },
};

/**
 * 规范化并重新代理图片URL
 * 解决问题：数据库中可能存储了旧域名的代理URL，需要更新为新域名
 */
const normalizeImageUrl = (url: string): string => {
  if (!url) return '';

  // 如果是代理URL（包含/api/jav/proxy-image），提取原始URL并重新代理
  const proxyMatch = url.match(/[?&]url=([^&]+)/);
  if (proxyMatch) {
    const originalUrl = decodeURIComponent(proxyMatch[1]);
    const baseUrl = getBackendBaseUrl();
    return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(originalUrl)}`;
  }

  // 如果是相对路径，直接返回
  if (url.startsWith('/')) return url;

  // 如果是完整的原始URL（非代理），添加代理
  if (url.startsWith('http')) {
    const baseUrl = getBackendBaseUrl();
    return `${baseUrl}/api/jav/proxy-image?url=${encodeURIComponent(url)}`;
  }

  return url;
};

const formatDate = (timestamp: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return d.toLocaleDateString('zh-CN');
};

export const PostCard: React.FC<PostCardProps> = ({ post, onLike, onFavorite, onClick }) => {
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [favAnimating, setFavAnimating] = useState(false);
  const typeConfig = POST_TYPE_CONFIG[post.postType];
  const TypeIcon = typeConfig.icon;

  let contentData: Record<string, any> = {};
  try {
    contentData = typeof post.contentData === 'string' ? JSON.parse(post.contentData) : (post.contentData || {});
  } catch {
    contentData = {};
  }

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onLike) {
      setLikeAnimating(true);
      onLike(post.id);
      setTimeout(() => setLikeAnimating(false), 400);
    }
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFavorite) {
      setFavAnimating(true);
      onFavorite(post.id);
      setTimeout(() => setFavAnimating(false), 400);
    }
  };

  const handleClick = () => {
    if (onClick) onClick(post.id);
  };

  return (
    <Card
      className="overflow-hidden group cursor-pointer"
      hover
      onClick={handleClick}
      padding="none"
    >
      {/* 封面图区域 */}
      <div className="relative aspect-[16/10] max-h-[200px] overflow-hidden bg-stone-100 dark:bg-stone-800" onClick={(e) => e.stopPropagation()}>
        {post.coverImage ? (
          <ProxyImage
            src={normalizeImageUrl(post.coverImage)}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <TypeIcon className="w-16 h-16 text-stone-300 dark:text-stone-600" />
          </div>
        )}

        {/* 类型标签 */}
        <div className="absolute top-3 left-3">
          <Badge variant={typeConfig.badgeVariant} size="sm">
            <TypeIcon className="w-3 h-3 mr-1" />
            {typeConfig.label}
          </Badge>
        </div>

        {/* 特殊标签 - JAV演员数/Anime评分/Movie星级 */}
        <div className="absolute top-3 right-3 flex gap-1.5">
          {post.postType === 'jav' && contentData.actresses?.length > 0 && (
            <Badge variant="default" size="sm" className="bg-black/60 text-white backdrop-blur-sm border-0">
              <Users className="w-3 h-3 mr-1" />
              {contentData.actresses.length}
            </Badge>
          )}
          {post.postType === 'anime' && contentData.rating && (
            <Badge variant="warning" size="sm" className="bg-black/60 text-white backdrop-blur-sm border-0">
              <Star className="w-3 h-3 mr-1 fill-current" />
              {contentData.rating}
            </Badge>
          )}
          {post.postType === 'movie' && contentData.rating && (
            <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={clsx(
                    'w-3 h-3',
                    star <= Math.round(contentData.rating / 2) && 'fill-warning-500 text-warning-500'
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* 渐变遮罩 */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

        {/* 浏览数 */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1 text-white/90 text-xs">
          <Eye className="w-3.5 h-3.5" />
          <span>{post.viewCount.toLocaleString()}</span>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-4 space-y-3">
        {/* 标题 */}
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-sm leading-snug line-clamp-1">
          {post.title}
        </h3>

        {/* 推荐语摘要 */}
        {post.caption && (
          <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 leading-relaxed">
            {post.caption.length > 50 ? post.caption.slice(0, 50) + '...' : post.caption}
          </p>
        )}

        {/* 作者信息 */}
        <div className="flex items-center gap-2">
          {post.userAvatar ? (
            <img
              src={post.userAvatar}
              alt={post.userName}
              className="w-6 h-6 rounded-full object-cover ring-1 ring-stone-200 dark:ring-stone-700"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center text-[10px] font-bold text-white">
              {post.userName?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
          <span className="text-xs text-stone-600 dark:text-stone-400 truncate flex-1">
            {post.userName || '匿名用户'}
          </span>
          <span className="text-xs text-stone-400 whitespace-nowrap">{formatDate(post.createdAt)}</span>
        </div>

        {/* 标签列表 */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 text-[10px] rounded-full bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-400"
              >
                {tag}
              </span>
            ))}
            {post.tags.length > 3 && (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-stone-100 dark:bg-stone-700 text-stone-400">
                +{post.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* 操作栏 */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-700/50">
          <div className="flex items-center gap-3 text-xs text-stone-500">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{post.commentCount}</span>
          </div>

          <div className="flex items-center gap-1">
            {/* 点赞按钮 */}
            <button
              onClick={handleLike}
              className={clsx(
                'p-1.5 rounded-lg transition-all duration-200',
                post.isLiked
                  ? 'text-red-500'
                  : 'text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20',
                likeAnimating && 'animate-bounce'
              )}
              title={post.isLiked ? '取消点赞' : '点赞'}
            >
              <Heart
                className={clsx(
                  'w-4 h-4 transition-all duration-300',
                  post.isLiked && 'fill-current scale-110',
                  likeAnimating && 'animate-ping'
                )}
              />
              <span className="ml-1 text-xs">{post.likeCount}</span>
            </button>

            {/* 收藏按钮 */}
            <button
              onClick={handleFavorite}
              className={clsx(
                'p-1.5 rounded-lg transition-all duration-200 ml-1',
                post.isFavorited
                  ? 'text-amber-500'
                  : 'text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20',
                favAnimating && 'animate-bounce'
              )}
              title={post.isFavorited ? '取消收藏' : '收藏'}
            >
              <Bookmark
                className={clsx(
                  'w-4 h-4 transition-all duration-300',
                  post.isFavorited && 'fill-current scale-110',
                  favAnimating && 'animate-ping'
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
};
