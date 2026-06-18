import { apiClient } from './client';
import type {
  CommunityTag,
  CommunityPost,
  CommunityComment,
  CreateTagRequest,
  UpdateTagRequest,
  CreatePostRequest,
  UpdatePostRequest,
  CreateCommentRequest,
  ReportRequest,
  CommunityUserStats,
  CommunityStats,
  PostsResponse,
  CommentsResponse,
  NotificationsResponse,
} from '@/types';

export const communityApi = {
  // ==================== 标签管理 ====================

  getTags: async (): Promise<CommunityTag[]> => {
    const response = await apiClient.get<{ success: boolean; data: CommunityTag[] }>('/community/tags');
    return response.success ? response.data : [];
  },

  getTag: async (id: string): Promise<CommunityTag> => {
    const response = await apiClient.get<{ success: boolean; data: CommunityTag }>(`/community/tags/${id}`);
    return response.data;
  },

  createTag: async (data: CreateTagRequest): Promise<{ data: CommunityTag; message: string }> => {
    return apiClient.post('/community/tags', data);
  },

  updateTag: async (id: string, data: UpdateTagRequest): Promise<{ message: string }> => {
    return apiClient.put(`/community/tags/${id}`, data);
  },

  deleteTag: async (id: string): Promise<{ message: string }> => {
    return apiClient.delete(`/community/tags/${id}`);
  },

  // ==================== 帖子管理 ====================

  getPosts: async (params?: {
    page?: number;
    pageSize?: number;
    postType?: string;
    tags?: string;
    sort?: string;
    search?: string;
  }): Promise<PostsResponse> => {
    const queryParams = new URLSearchParams();
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    queryParams.append('page', String(page));
    queryParams.append('pageSize', String(pageSize));
    if (params?.postType) queryParams.append('postType', params.postType);
    if (params?.tags) queryParams.append('tags', params.tags);
    if (params?.sort) queryParams.append('sort', params.sort);
    if (params?.search) queryParams.append('search', params.search);

    const response = await apiClient.get<{ success: boolean; data: PostsResponse }>(`/community/posts?${queryParams.toString()}`);
    return response.data;
  },

  getPost: async (id: string): Promise<CommunityPost> => {
    const response = await apiClient.get<{ success: boolean; data: CommunityPost }>(`/community/posts/${id}`);
    return response.data;
  },

  createPost: async (data: CreatePostRequest): Promise<{ data: CommunityPost; message: string }> => {
    return apiClient.post('/community/posts', data);
  },

  updatePost: async (id: string, data: UpdatePostRequest): Promise<{ message: string }> => {
    return apiClient.put(`/community/posts/${id}`, data);
  },

  deletePost: async (id: string): Promise<{ message: string }> => {
    return apiClient.delete(`/community/posts/${id}`);
  },

  // ==================== 互动功能 ====================

  toggleLike: async (postId: string): Promise<{ liked: boolean }> => {
    const response = await apiClient.post<{ success: boolean; data: { liked: boolean }; message: string }>(
      `/community/posts/${postId}/like`,
      {}
    );
    return response.success && response.data ? response.data : { liked: false };
  },

  toggleFavorite: async (postId: string): Promise<{ favorited: boolean }> => {
    const response = await apiClient.post<{ success: boolean; data: { favorited: boolean }; message: string }>(
      `/community/posts/${postId}/favorite`,
      {}
    );
    return response.success && response.data ? response.data : { favorited: false };
  },

  // ==================== 评论管理 ====================

  getComments: async (postId: string): Promise<CommentsResponse> => {
    const response = await apiClient.get<{ success: boolean; data: CommentsResponse }>(`/community/posts/${postId}/comments`);
    return response.data;
  },

  createComment: async (data: CreateCommentRequest): Promise<{ data: CommunityComment; message: string }> => {
    return apiClient.post('/community/comments', data);
  },

  deleteComment: async (id: string): Promise<{ message: string }> => {
    return apiClient.delete(`/community/comments/${id}`);
  },

  // ==================== 举报功能 ====================

  reportPost: async (postId: string, data: ReportRequest): Promise<{ data: { reportId: string }; message: string }> => {
    return apiClient.post(`/community/posts/${postId}/report`, data);
  },

  // ==================== 个人中心 ====================

  getMyPosts: async (params?: { page?: number; pageSize?: number; status?: string }): Promise<PostsResponse> => {
    const queryParams = new URLSearchParams();
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    queryParams.append('page', String(page));
    queryParams.append('pageSize', String(pageSize));
    if (params?.status) queryParams.append('status', params.status);

    const response = await apiClient.get<{ success: boolean; data: PostsResponse }>(`/community/posts/my-posts?${queryParams.toString()}`);
    return response.data;
  },

  getMyFavorites: async (params?: { page?: number; pageSize?: number }): Promise<PostsResponse> => {
    const queryParams = new URLSearchParams();
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    queryParams.append('page', String(page));
    queryParams.append('pageSize', String(pageSize));

    const response = await apiClient.get<{ success: boolean; data: PostsResponse }>(`/community/posts/my-favorites?${queryParams.toString()}`);
    return response.data;
  },

  // ==================== 统计数据 ====================

  getCommunityStats: async (): Promise<CommunityStats> => {
    const response = await apiClient.get<{ success: boolean; data: CommunityStats }>('/community/stats');
    return response.data;
  },

  getUserStats: async (): Promise<CommunityUserStats> => {
    const response = await apiClient.get<{ success: boolean; data: CommunityUserStats }>('/community/user-stats');
    return response.data;
  },

  // ==================== 通知管理 ====================

  getNotifications: async (params?: { page?: number; pageSize?: number }): Promise<NotificationsResponse> => {
    const queryParams = new URLSearchParams();
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    queryParams.append('page', String(page));
    queryParams.append('pageSize', String(pageSize));

    const response = await apiClient.get<{ success: boolean; data: NotificationsResponse }>(`/community/notifications?${queryParams.toString()}`);
    return response.data;
  },
};
