// 从 @codeseek/shared 导入核心类型
export type {
  PostStatus,
  PostType,
  LikeType,
  CommunityPost,
  CommunityTag,
  CommunityComment,
  CreatePostRequest,
  UpdatePostRequest,
  CreateCommentRequest,
  CreateTagRequest,
  UpdateTagRequest,
  ReportRequest,
  CommunityUserStats,
  CommunityStats,
  CommunityNotification,
} from '@codeseek/shared';

// 前端特有的响应类型
export interface PostsResponse {
  items: import('@codeseek/shared').CommunityPost[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CommentsResponse {
  items: import('@codeseek/shared').CommunityComment[];
  total: number;
}

export interface NotificationsResponse {
  items: import('@codeseek/shared').CommunityNotification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
