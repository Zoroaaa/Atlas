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
  Flag,
  BookOpen,
  Library,
} from 'lucide-react';
import { Card, Button, Badge, Modal, TextArea } from '@/components/ui';
import { useCommunityStore } from '@/stores/communityStore';
import { CommentsSection } from './CommentsSection';
import { PostCard } from './PostCard';
import { useToast } from '@/components/ui/Toast';
import { getBackendBaseUrl } from '@/constants';

interface PostDetailProps {
  postId: string;
  onBack?: () => void;
}

const POST_TYPE_CONFIG = {
  jav: { label: '番号', icon: Film, color: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' },
  anime: { label: '动漫', icon: Tv, color: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' },
  movie: { label: '影视', icon: Film, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
  manga: { label: '漫画', icon: BookOpen, color: 'text-violet-500 bg-violet-50 dark:bg-violet-900/20' },
  novel: { label: '小说', icon: Library, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' },
  actress: { label: '女优', icon: Users, color: 'text-pink-500 bg-pink-50 dark:bg-pink-900/20' },
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
    {/* 基本信息 */}
    <div className="grid grid-cols-2 gap-3 text-sm">
      {data.code && (
        <div>
          <span className="text-stone-400">番号</span>
          <p className="font-mono font-semibold text-stone-900 dark:text-stone-100">{data.code}</p>
        </div>
      )}
      {data.releaseDate && (
        <div>
          <span className="text-stone-400">发布日期</span>
          <p className="text-stone-700 dark:text-stone-300">{data.releaseDate}</p>
        </div>
      )}
      {data.duration && (
        <div>
          <span className="text-stone-400">时长</span>
          <p className="text-stone-700 dark:text-stone-300">{data.duration}</p>
        </div>
      )}
      {(data.maker || data.publisher) && (
        <div>
          <span className="text-stone-400">制作商</span>
          <p className="text-stone-700 dark:text-stone-300">{data.maker || data.publisher}</p>
        </div>
      )}
      {data.series && (
        <div>
          <span className="text-stone-400">系列</span>
          <p className="text-stone-700 dark:text-stone-300">{data.series}</p>
        </div>
      )}
      {data.director && (
        <div>
          <span className="text-stone-400">导演</span>
          <p className="text-stone-700 dark:text-stone-300">{data.director}</p>
        </div>
      )}
    </div>

    {/* 演员列表 */}
    {data.actresses && Array.isArray(data.actresses) && data.actresses.length > 0 && (
      <div>
        <h4 className="flex items-center gap-2 font-medium text-sm text-stone-700 dark:text-stone-300 mb-2">
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
        <h4 className="font-medium text-sm text-stone-700 dark:text-stone-300 mb-2">标签</h4>
        <div className="flex flex-wrap gap-1.5">
          {data.tags.map((tag: string, idx: number) => (
            <span key={idx} className="px-2.5 py-1 text-xs rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
              {tag}
            </span>
          ))}
        </div>
      </div>
    )}

    {/* 磁力链接列表 */}
    {(data.magnetLinks || data.magnets) && Array.isArray(data.magnetLinks || data.magnets) && (data.magnetLinks || data.magnets).length > 0 && (
      <div>
        <h4 className="flex items-center gap-2 font-medium text-sm text-stone-700 dark:text-stone-300 mb-2">
          <LinkIcon className="w-4 h-4" />
          磁力链接 ({(data.magnetLinks || data.magnets).length})
        </h4>
        <div className="space-y-2">
          {(data.magnetLinks || data.magnets).map((link: any, idx: number) => (
            <ResourceItem key={idx} resource={link} index={idx + 1} />
          ))}
        </div>
      </div>
    )}
  </div>
);

// Anime 内容渲染
const AnimeContentRenderer: React.FC<{ data: Record<string, any> }> = ({ data }) => {
  const bgm = data.bgm?.[0];
  const allResources = [
    ...(data.nyaa || []),
    ...(data.mikan || []),
    ...(data.animetosho || []),
    ...(data.showrss || []),
  ];

  return (
    <div className="space-y-4">
      {/* BGM 作品信息 */}
      {bgm && (
        <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            {bgm.cover && (
              <img src={normalizeImageUrl(bgm.cover)} alt={bgm.nameCN || bgm.name} className="w-16 h-22 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <h4 className="font-semibold text-stone-900 dark:text-stone-100">{bgm.nameCN || bgm.name}</h4>
              {bgm.name && bgm.nameCN && bgm.name !== bgm.nameCN && (
                <p className="text-sm text-stone-500">{bgm.name}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                {bgm.rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-warning-500 text-warning-500" />
                    {bgm.rating}
                  </span>
                )}
                {bgm.eps > 0 && <span>共 {bgm.eps} 集</span>}
                {bgm.airDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />{bgm.airDate}
                  </span>
                )}
              </div>
            </div>
          </div>
          {bgm.summary && (
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-4">
              {bgm.summary}
            </p>
          )}
        </div>
      )}

      {/* 资源统计 */}
      {allResources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.nyaa?.length > 0 && <Badge variant="default" size="sm">Nyaa {data.nyaa.length}</Badge>}
          {data.mikan?.length > 0 && <Badge variant="default" size="sm">Mikan {data.mikan.length}</Badge>}
          {data.animetosho?.length > 0 && <Badge variant="default" size="sm">AnimeTosho {data.animetosho.length}</Badge>}
          {data.showrss?.length > 0 && <Badge variant="default" size="sm">ShowRSS {data.showrss.length}</Badge>}
        </div>
      )}

      {/* 资源列表 */}
      {allResources.length > 0 && (
        <div>
          <h4 className="flex items-center gap-2 font-medium text-sm text-stone-700 dark:text-stone-300 mb-2">
            <Download className="w-4 h-4" />
            资源 ({allResources.length})
          </h4>
          <div className="space-y-2">
            {allResources.slice(0, 10).map((resource: any, idx: number) => (
              <ResourceItem key={idx} resource={resource} index={idx + 1} />
            ))}
            {allResources.length > 10 && (
              <p className="text-xs text-center text-stone-400 py-2">还有 {allResources.length - 10} 条资源...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Movie 内容渲染
const MovieContentRenderer: React.FC<{ data: Record<string, any> }> = ({ data }) => {
  const movie = data.results?.[0];
  const resources = data.resources || [];

  return (
    <div className="space-y-4">
      {/* 影片信息 */}
      {movie && (
        <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            {movie.poster && (
              <img src={normalizeImageUrl(movie.poster)} alt={movie.title} className="w-20 h-28 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <h4 className="font-semibold text-stone-900 dark:text-stone-100">{movie.title}</h4>
              {movie.originalTitle && movie.originalTitle !== movie.title && (
                <p className="text-sm text-stone-500">{movie.originalTitle}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                {movie.rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-warning-500 text-warning-500" />
                    {movie.rating}
                  </span>
                )}
                {movie.releaseDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />{movie.releaseDate}
                  </span>
                )}
                {movie.mediaType && <Badge variant="default" size="sm">{movie.mediaType === 'tv' ? '剧集' : '电影'}</Badge>}
              </div>
            </div>
          </div>
          {movie.overview && (
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-4">
              {movie.overview}
            </p>
          )}
        </div>
      )}

      {/* 其他搜索结果 */}
      {data.results?.length > 1 && (
        <div>
          <h4 className="font-medium text-sm text-stone-700 dark:text-stone-300 mb-2">其他相关结果 ({data.results.length - 1})</h4>
          <div className="space-y-1.5">
            {data.results.slice(1, 6).map((r: any, idx: number) => (
              <div key={idx} className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                <span className="text-xs text-stone-400 w-12 shrink-0">{r.year || ''}</span>
                <span className="truncate">{r.title}</span>
                {r.originalTitle && r.originalTitle !== r.title && <span className="text-xs text-stone-400 truncate">/ {r.originalTitle}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 下载资源 */}
      {resources.length > 0 && (
        <div>
          <h4 className="flex items-center gap-2 font-medium text-sm text-stone-700 dark:text-stone-300 mb-2">
            <Download className="w-4 h-4" />
            下载资源 ({resources.length})
          </h4>
          <div className="space-y-2">
            {resources.slice(0, 10).map((resource: any, idx: number) => (
              <ResourceItem key={idx} resource={resource} index={idx + 1} />
            ))}
            {resources.length > 10 && (
              <p className="text-xs text-center text-stone-400 py-2">还有 {resources.length - 10} 条资源...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Manga 内容渲染
const MangaContentRenderer: React.FC<{ data: Record<string, any> }> = ({ data }) => {
  const mangaList = data.manga || [];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {mangaList.slice(0, 12).map((manga: any, idx: number) => (
          <div key={manga.id || idx} className="flex gap-3 p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
            {manga.cover && (
              <img src={normalizeImageUrl(manga.cover)} alt={manga.title} className="w-12 h-16 rounded-md object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-2">{manga.title}</h4>
              {manga.status && (
                <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                  {manga.status}
                </span>
              )}
              {manga.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {manga.tags.slice(0, 3).map((tag: string, i: number) => (
                    <span key={i} className="text-xs text-stone-400">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {mangaList.length > 12 && (
        <p className="text-xs text-center text-stone-400 py-2">还有 {mangaList.length - 12} 部漫画...</p>
      )}
    </div>
  );
};

// Novel 内容渲染
const NovelContentRenderer: React.FC<{ data: Record<string, any> }> = ({ data }) => {
  const novels = data.novels || [];
  return (
    <div className="space-y-3">
      {novels.slice(0, 10).map((novel: any, idx: number) => (
        <div key={novel.id || idx} className="flex gap-3 p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
          {novel.cover && (
            <img src={normalizeImageUrl(novel.cover)} alt={novel.title} className="w-12 h-16 rounded-md object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-1">{novel.title}</h4>
            {novel.author && <p className="text-xs text-stone-500">{novel.author}</p>}
            {novel.description && (
              <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed">{novel.description}</p>
            )}
            <div className="flex flex-wrap gap-2 text-xs text-stone-400">
              {novel.format && <span>{novel.format}</span>}
              {novel.size && <span>· {novel.size}</span>}
              {novel.language && <span>· {novel.language}</span>}
              {novel.year && <span>· {novel.year}</span>}
            </div>
          </div>
        </div>
      ))}
      {novels.length > 10 && (
        <p className="text-xs text-center text-stone-400 py-2">还有 {novels.length - 10} 本小说...</p>
      )}
    </div>
  );
};

// Actress 内容渲染
const ActressContentRenderer: React.FC<{ data: Record<string, any> }> = ({ data }) => (
  <div className="space-y-4">
    {/* 姓名信息 */}
    <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-xl space-y-2">
      <div className="flex items-baseline gap-3">
        <h4 className="text-lg font-bold text-stone-900 dark:text-stone-100">{data.name}</h4>
        {data.ruby && <span className="text-sm text-stone-500">{data.ruby}</span>}
      </div>
      {data.romaji && <p className="text-sm text-stone-500">{data.romaji}</p>}
      {data.alias && <p className="text-xs text-stone-400">别名：{data.alias}</p>}
    </div>

    {/* 基本资料 */}
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
      {data.birthday && (
        <div>
          <span className="text-xs text-stone-400">生日</span>
          <p className="text-sm text-stone-700 dark:text-stone-300">{data.birthday}</p>
        </div>
      )}
      {data.zodiac && (
        <div>
          <span className="text-xs text-stone-400">星座</span>
          <p className="text-sm text-stone-700 dark:text-stone-300">{data.zodiac}</p>
        </div>
      )}
      {data.height && (
        <div>
          <span className="text-xs text-stone-400">身高</span>
          <p className="text-sm text-stone-700 dark:text-stone-300">{data.height}</p>
        </div>
      )}
      {data.prefecture && (
        <div>
          <span className="text-xs text-stone-400">出身地</span>
          <p className="text-sm text-stone-700 dark:text-stone-300">{data.prefecture}</p>
        </div>
      )}
      {data.agency && (
        <div>
          <span className="text-xs text-stone-400">事务所</span>
          <p className="text-sm text-stone-700 dark:text-stone-300">{data.agency}</p>
        </div>
      )}
      {data.activePeriod && (
        <div>
          <span className="text-xs text-stone-400">活跃期</span>
          <p className="text-sm text-stone-700 dark:text-stone-300">{data.activePeriod}</p>
        </div>
      )}
    </div>

    {/* 身体数据 */}
    {(data.bust || data.cup || data.waist || data.hip) && (
      <div className="flex flex-wrap gap-2">
        {data.bust && (
          <span className="px-3 py-1 text-sm rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">B {data.bust}</span>
        )}
        {data.cup && (
          <span className="px-3 py-1 text-sm rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">{data.cup} Cup</span>
        )}
        {data.waist && (
          <span className="px-3 py-1 text-sm rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">W {data.waist}</span>
        )}
        {data.hip && (
          <span className="px-3 py-1 text-sm rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400">H {data.hip}</span>
        )}
      </div>
    )}
  </div>
);

// 资源项（统一处理磁力链接和种子资源）
const ResourceItem: React.FC<{ resource: any; index: number }> = ({ resource, index }) => {
  const [copied, setCopied] = useState(false);
  const isString = typeof resource === 'string';
  const url = isString ? resource : resource.magnet || resource.url || resource.link || '';
  const title = isString ? '' : resource.title || resource.name || '';
  const size = isString ? '' : resource.size || '';
  const seeders = isString ? undefined : resource.seeders;
  const sourceLabel = isString ? '' : resource.sourceLabel || resource.source || '';
  const date = isString ? '' : resource.date || '';

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
    <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-800/50 rounded-lg group hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
      <span className="text-xs font-semibold text-white w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center shrink-0">
        {index}
      </span>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-medium text-stone-700 dark:text-stone-300 truncate">{title}</p>}
        <div className="flex items-center gap-2 text-xs text-stone-400">
          {size && <span>{size}</span>}
          {seeders !== undefined && <span>· 种子 {seeders}</span>}
          {sourceLabel && <span>· {sourceLabel}</span>}
          {date && <span>· {date}</span>}
        </div>
        {!title && <code className="text-xs text-stone-400 truncate block font-mono">{url.slice(0, 60)}...</code>}
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
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
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

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
        <div className="h-8 w-48 bg-stone-200 dark:bg-stone-700 rounded-xl" />
        <div className="aspect-[16/9] bg-stone-200 dark:bg-stone-700 rounded-xl" />
        <div className="space-y-3">
          <div className="h-6 w-3/4 bg-stone-200 dark:bg-stone-700 rounded-xl" />
          <div className="h-4 w-full bg-stone-100 dark:bg-stone-800 rounded-lg" />
          <div className="h-4 w-2/3 bg-stone-100 dark:bg-stone-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!currentPost) {
    return (
      <div className="text-center py-20">
        <p className="text-stone-500">帖子不存在或已被删除</p>
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

  const handleReport = async () => {
    if (!reportReason.trim()) {
      toast.error('请选择或填写举报原因');
      return;
    }

    setReportSubmitting(true);
    try {
      const { communityApi } = await import('@/services/api');
      await communityApi.reportPost(postId, {
        reason: reportReason.trim(),
        details: reportDetails.trim() || undefined,
      });
      toast.success('举报已提交，我们会尽快处理');
      setReportModalOpen(false);
      setReportReason('');
      setReportDetails('');
    } catch (error: any) {
      const message = error?.message || '举报失败，请重试';
      toast.error(message);
    } finally {
      setReportSubmitting(false);
    }
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
      case 'manga':
        return <MangaContentRenderer data={contentData} />;
      case 'novel':
        return <NovelContentRenderer data={contentData} />;
      case 'actress':
        return <ActressContentRenderer data={contentData} />;
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
                src={normalizeImageUrl(currentPost.coverImage)}
                alt={currentPost.title}
                className="w-full max-h-[360px] object-contain bg-stone-100 dark:bg-stone-800"
              />
            </div>
          )}

          {/* 标题 */}
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 leading-tight">
            {currentPost.title}
          </h1>

          {/* 推荐语 */}
          {currentPost.caption && (
            <p className="text-base text-stone-600 dark:text-stone-400 leading-relaxed italic border-l-3 border-amber-400 pl-4 py-1 bg-amber-50/50 dark:bg-amber-900/10 rounded-r-lg">
              "{currentPost.caption}"
            </p>
          )}

          {/* 作者信息和时间 */}
          <div className="flex items-center gap-3 pt-2">
            {currentPost.userAvatar ? (
              <img
                src={currentPost.userAvatar}
                alt={currentPost.userName}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-stone-200 dark:ring-stone-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d4a853] to-[#f59e0b] flex items-center justify-center text-sm font-bold text-white">
                {currentPost.userName?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <div className="flex-1">
              <p className="font-medium text-stone-900 dark:text-stone-100 text-sm">
                {currentPost.userName || '匿名用户'}
              </p>
              <p className="text-xs text-stone-400">{formatDate(currentPost.createdAt)}</p>
            </div>
          </div>

          {/* 互动操作栏 */}
          <div className="flex items-center gap-4 pt-4 border-t border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-4 text-sm text-stone-500">
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
                    : 'text-stone-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
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
                    : 'text-stone-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                )}
              >
                <Bookmark className={clsx('w-4 h-4', currentPost.isFavorited && 'fill-current')} />
                收藏
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-stone-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
              >
                <Share2 className="w-4 h-4" />
                分享
              </button>
              <button
                onClick={() => setReportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-stone-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              >
                <Flag className="w-4 h-4" />
                举报
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
        <div className="space-y-4 pt-6 border-t border-stone-200 dark:border-stone-800">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-lg">
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

      {/* 举报弹窗 */}
      <Modal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setReportReason('');
          setReportDetails('');
        }}
        title="举报帖子"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
              举报原因 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {['内容违规', '虚假信息', '侵犯版权', '恶意广告', '其他原因'].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setReportReason(reason)}
                  className={clsx(
                    'w-full px-4 py-2.5 rounded-lg text-sm text-left transition-all',
                    reportReason === reason
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
                      : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700'
                  )}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          <TextArea
            label="详细说明（可选）"
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
            placeholder="请详细描述您要举报的问题..."
            rows={3}
            fullWidth
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setReportModalOpen(false);
                setReportReason('');
                setReportDetails('');
              }}
              disabled={reportSubmitting}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleReport}
              isLoading={reportSubmitting}
              disabled={!reportReason.trim()}
            >
              提交举报
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
