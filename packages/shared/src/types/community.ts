/**
 * 社区模块共享类型定义
 * 资源分享模型 - 支持帖子、标签、评论、统计和通知
 */

// ==================== 基础枚举类型 ====================

/** 帖子状态 */
export type PostStatus = 'active' | 'pending' | 'rejected' | 'hidden';

/** 帖子类型 */
export type PostType = 'jav' | 'anime' | 'movie';

/** 互动类型 */
export type LikeType = 'like' | 'favorite';

// ==================== 核心实体类型 ====================

/** 社区资源帖子 */
export interface CommunityPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  postType: PostType;
  title: string;
  coverImage: string;
  contentData: string;      // JSON string
  caption: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
  shareCount: number;
  status: PostStatus;
  isFeatured: boolean;
  createdAt: number;
  updatedAt: number;
  // 可选的客户端字段
  isLiked?: boolean;
  isFavorited?: boolean;
}

/** 社区标签 */
export interface CommunityTag {
  id: string;
  tagName: string;
  tagDescription?: string;
  tagColor: string;
  isActive: boolean;
  postsCount?: number;     // 使用此标签的帖子数
  createdAt: number;
  createdBy: string;
}

/** 社区评论 */
export interface CommunityComment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// ==================== 请求/响应类型 ====================

/** 创建帖子请求 */
export interface CreatePostRequest {
  postType: PostType;
  title: string;
  coverImage: string;
  contentData: string;     // JSON string of search result data
  caption?: string;
  tags?: string[];
}

/** 更新帖子请求 */
export interface UpdatePostRequest {
  caption?: string;
  tags?: string[];
}

/** 创建评论请求 */
export interface CreateCommentRequest {
  postId: string;
  content: string;
}

/** 创建标签请求 */
export interface CreateTagRequest {
  name: string;
  description?: string;
  color?: string;
}

/** 更新标签请求 */
export interface UpdateTagRequest {
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

/** 举报请求 */
export interface ReportRequest {
  reason: string;
  details?: string;
}

// ==================== 统计类型 ====================

/** 用户社区统计 */
export interface CommunityUserStats {
  postsCount: number;
  likesReceived: number;
  favoritesReceived: number;
  commentsCount: number;
  recentPosts: CommunityPost[];
}

/** 社区整体统计 */
export interface CommunityStats {
  totalPosts: number;
  totalUsers: number;
  totalComments: number;
  totalLikes: number;
  totalFavorites: number;
  averageEngagement: number;
  postsByType: { type: string; count: number }[];
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    createdAt: number;
  }>;
}

// ==================== 通知类型 ====================

/** 社区通知 */
export interface CommunityNotification {
  id: string;
  type: 'like' | 'comment' | 'favorite' | 'report_resolved';
  postId: string;
  postTitle: string;
  postCoverImage: string;
  actorName?: string;
  content: string;
  createdAt: number;
  isRead: boolean;
}
