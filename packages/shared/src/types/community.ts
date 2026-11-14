/**
 * 社区模块共享类型定义
 * 资源分享模型 - 支持帖子、标签、评论、统计和通知
 */

// ==================== 基础枚举类型 ====================

/** 帖子状态 */
export type PostStatus = 'active' | 'pending' | 'rejected' | 'hidden';

/** 帖子类型 */
export type PostType = 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';

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
  status: PostStatus;
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

// 请求契约类型统一由 zod schema 推导
export type {
  CreatePostRequest,
  UpdatePostRequest,
  CreateCommentRequest,
  CreateTagRequest,
  ReportRequest,
} from '../schemas/community';

// 更新标签没有前端调用方，schema 留在后端，类型仍手写
export interface UpdateTagRequest {
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
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
