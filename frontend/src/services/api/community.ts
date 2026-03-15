import { apiClient } from './client';
import type {
  Tag,
  SharedSource,
  Review,
  CreateTagRequest,
  UpdateTagRequest,
  CreateSharedSourceRequest,
  UpdateSharedSourceRequest,
  CreateReviewRequest,
  UpdateReviewRequest,
  ReportRequest,
  CommunityUserStats,
  CommunityStats,
  PaginatedResponse,
} from '@/types';

export const communityApi = {
  getTags: async (): Promise<{ success: boolean; data: Tag[] }> => {
    const response = await apiClient.get<{ success: boolean; data: Array<{
      id: string;
      tag_name: string;
      tag_description: string | null;
      tag_color: string;
      usage_count: number;
      is_official: number;
      tag_active: number;
      created_by: string;
      created_at: number;
      updated_at: number;
    }> }>('/community/tags');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.map(t => ({
          id: t.id,
          name: t.tag_name,
          description: t.tag_description || undefined,
          color: t.tag_color,
          usageCount: t.usage_count,
          isActive: t.tag_active === 1,
          createdAt: new Date(t.created_at).toISOString(),
          createdBy: t.created_by,
        }))
      };
    }
    return { success: false, data: [] };
  },

  getTag: async (id: string): Promise<{ success: boolean; data: Tag }> => {
    return apiClient.get(`/community/tags/${id}`);
  },

  createTag: async (data: CreateTagRequest): Promise<{ success: boolean; data: Tag; message: string }> => {
    return apiClient.post('/community/tags', data);
  },

  updateTag: async (id: string, data: UpdateTagRequest): Promise<{ success: boolean; message: string }> => {
    return apiClient.put(`/community/tags/${id}`, data);
  },

  deleteTag: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/community/tags/${id}`);
  },

  getSharedSources: async (options?: {
    page?: number;
    pageSize?: number;
    status?: string;
    category?: string;
    search?: string;
    tags?: string[];
    sort?: string;
  }): Promise<{ 
    success: boolean; 
    data: PaginatedResponse<SharedSource> 
  }> => {
    const params = new URLSearchParams();
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (options?.status) params.append('status', options.status);
    if (options?.category) params.append('category', options.category);
    if (options?.search) params.append('search', options.search);
    if (options?.tags && options.tags.length > 0) params.append('tags', options.tags.join(','));
    if (options?.sort) params.append('sort', options.sort);
    
    const response = await apiClient.get<{ 
      success: boolean; 
      data: {
        items: Array<{
          id: string;
          user_id: string;
          source_name: string;
          source_subtitle: string | null;
          source_icon: string | null;
          source_url_template: string;
          source_category: string;
          description: string | null;
          tags: string;
          download_count: number;
          like_count: number;
          view_count: number;
          rating_score: number;
          rating_count: number;
          is_verified: number;
          is_featured: number;
          status: string;
          created_at: number;
          updated_at: number;
          author_name?: string;
          is_liked?: number;
        }>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }
    }>(`/community/sources?${params.toString()}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          items: response.data.items.map(s => ({
            id: s.id,
            sourceName: s.source_name,
            sourceSubtitle: s.source_subtitle || undefined,
            sourceIcon: s.source_icon || undefined,
            sourceUrlTemplate: s.source_url_template,
            sourceCategory: s.source_category,
            description: s.description || undefined,
            tags: JSON.parse(s.tags || '[]'),
            authorId: s.user_id,
            authorName: s.author_name || '',
            viewCount: s.view_count,
            downloadCount: s.download_count,
            likeCount: s.like_count,
            ratingScore: s.rating_score,
            ratingCount: s.rating_count,
            status: s.status as 'pending' | 'active' | 'rejected',
            createdAt: new Date(s.created_at).toISOString(),
            updatedAt: new Date(s.updated_at).toISOString(),
            isLiked: s.is_liked === 1,
          })),
          total: response.data.total,
          page: response.data.page,
          pageSize: response.data.pageSize,
          totalPages: response.data.totalPages,
        }
      };
    }
    return { success: false, data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } };
  },

  getSharedSource: async (id: string): Promise<{ success: boolean; data: SharedSource }> => {
    return apiClient.get(`/community/sources/${id}`);
  },

  createSharedSource: async (data: CreateSharedSourceRequest): Promise<{ 
    success: boolean; 
    data: SharedSource; 
    message: string 
  }> => {
    return apiClient.post('/community/sources', data);
  },

  updateSharedSource: async (id: string, data: UpdateSharedSourceRequest): Promise<{ 
    success: boolean; 
    message: string 
  }> => {
    return apiClient.put(`/community/sources/${id}`, data);
  },

  deleteSharedSource: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/community/sources/${id}`);
  },

  approveSharedSource: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.put(`/community/sources/${id}/status`, { status: 'active' });
  },

  rejectSharedSource: async (id: string, reason: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.put(`/community/sources/${id}/status`, { status: 'rejected', reason });
  },

  likeSharedSource: async (id: string): Promise<{ 
    success: boolean; 
    data: { liked: boolean; likeCount: number }; 
    message: string 
  }> => {
    const response = await apiClient.post<{ 
      success: boolean; 
      data: { liked: boolean }; 
      message: string 
    }>(`/community/sources/${id}/like`, {});
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          liked: response.data.liked,
          likeCount: 0,
        },
        message: response.message,
      };
    }
    return { success: false, data: { liked: false, likeCount: 0 }, message: '' };
  },

  getReviews: async (sourceId: string, page = 1, pageSize = 20): Promise<{ 
    success: boolean; 
    data: {
      items: Array<Review & { userName: string }>;
      total: number;
      page: number;
      pageSize: number;
    } 
  }> => {
    const response = await apiClient.get<{ 
      success: boolean; 
      data: Array<{
        id: string;
        shared_source_id: string;
        user_id: string;
        username: string;
        rating: number;
        comment: string | null;
        is_anonymous: number;
        created_at: number;
        updated_at: number;
      }>
    }>(`/community/sources/${sourceId}/reviews?page=${page}&pageSize=${pageSize}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          items: response.data.map(r => ({
            id: r.id,
            sharedSourceId: r.shared_source_id,
            userId: r.user_id,
            userName: r.username,
            rating: r.rating,
            comment: r.comment || undefined,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
          })),
          total: response.data.length,
          page,
          pageSize,
        }
      };
    }
    return { success: false, data: { items: [], total: 0, page: 1, pageSize: 20 } };
  },

  createReview: async (data: CreateReviewRequest): Promise<{ 
    success: boolean; 
    data: Review; 
    message: string 
  }> => {
    return apiClient.post('/community/reviews', data);
  },

  updateReview: async (id: string, data: UpdateReviewRequest): Promise<{ 
    success: boolean; 
    data: Review; 
    message: string 
  }> => {
    return apiClient.put(`/community/reviews/${id}`, data);
  },

  deleteReview: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(`/community/reviews/${id}`);
  },

  reportSharedSource: async (id: string, data: ReportRequest): Promise<{ 
    success: boolean; 
    data: { reportId: string }; 
    message: string 
  }> => {
    return apiClient.post(`/community/sources/${id}/report`, data);
  },

  downloadSharedSource: async (id: string): Promise<{ 
    success: boolean; 
    data: { newSourceId: string; source: SharedSource }; 
    message: string 
  }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>(`/community/sources/${id}/download`, {});
    return {
      success: response.success,
      data: { newSourceId: '', source: {} as SharedSource },
      message: response.message,
    };
  },

  getMyFavorites: async (page = 1, pageSize = 20): Promise<{
    success: boolean;
    data: PaginatedResponse<SharedSource>;
  }> => {
    const response = await apiClient.get<{
      success: boolean;
      data: {
        items: Array<{
          id: string;
          user_id: string;
          source_name: string;
          source_subtitle: string | null;
          source_icon: string | null;
          source_url_template: string;
          source_category: string;
          description: string | null;
          tags: string;
          download_count: number;
          like_count: number;
          view_count: number;
          rating_score: number;
          rating_count: number;
          status: string;
          created_at: number;
          updated_at: number;
          author_name?: string;
        }>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
    }>(`/community/sources/my-favorites?page=${page}&pageSize=${pageSize}`);

    if (response.success && response.data) {
      return {
        success: true,
        data: {
          items: response.data.items.map(s => ({
            id: s.id,
            sourceName: s.source_name,
            sourceSubtitle: s.source_subtitle || undefined,
            sourceIcon: s.source_icon || undefined,
            sourceUrlTemplate: s.source_url_template,
            sourceCategory: s.source_category,
            description: s.description || undefined,
            tags: JSON.parse(s.tags || '[]'),
            authorId: s.user_id,
            authorName: s.author_name || '',
            viewCount: s.view_count,
            downloadCount: s.download_count,
            likeCount: s.like_count,
            ratingScore: s.rating_score,
            ratingCount: s.rating_count,
            status: s.status as 'pending' | 'active' | 'rejected',
            createdAt: new Date(s.created_at).toISOString(),
            updatedAt: new Date(s.updated_at).toISOString(),
          })),
          total: response.data.total,
          page: response.data.page,
          pageSize: response.data.pageSize,
          totalPages: response.data.totalPages,
        },
      };
    }
    return { success: false, data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } };
  },

  getMySources: async (page = 1, pageSize = 20, status?: string): Promise<{ 
    success: boolean; 
    data: PaginatedResponse<SharedSource> 
  }> => {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (status) params.append('status', status);
    
    const response = await apiClient.get<{ 
      success: boolean; 
      data: {
        items: Array<{
          id: string;
          user_id: string;
          source_name: string;
          source_subtitle: string | null;
          source_icon: string | null;
          source_url_template: string;
          source_category: string;
          description: string | null;
          tags: string;
          download_count: number;
          like_count: number;
          view_count: number;
          rating_score: number;
          rating_count: number;
          status: string;
          created_at: number;
          updated_at: number;
        }>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }
    }>(`/community/sources/my-sources?${params.toString()}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          items: response.data.items.map(s => ({
            id: s.id,
            sourceName: s.source_name,
            sourceSubtitle: s.source_subtitle || undefined,
            sourceIcon: s.source_icon || undefined,
            sourceUrlTemplate: s.source_url_template,
            sourceCategory: s.source_category,
            description: s.description || undefined,
            tags: JSON.parse(s.tags || '[]'),
            authorId: s.user_id,
            authorName: '',
            viewCount: s.view_count,
            downloadCount: s.download_count,
            likeCount: s.like_count,
            ratingScore: s.rating_score,
            ratingCount: s.rating_count,
            status: s.status as 'pending' | 'active' | 'rejected',
            createdAt: new Date(s.created_at).toISOString(),
            updatedAt: new Date(s.updated_at).toISOString(),
          })),
          total: response.data.total,
          page: response.data.page,
          pageSize: response.data.pageSize,
          totalPages: response.data.totalPages,
        }
      };
    }
    return { success: false, data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } };
  },

  getPopularSources: async (limit = 10, tag?: string): Promise<{ success: boolean; data: SharedSource[] }> => {
    let url = `/community/sources/popular?limit=${limit}`;
    if (tag) url += `&tag=${encodeURIComponent(tag)}`;
    
    const response = await apiClient.get<{ 
      success: boolean; 
      data: Array<{
        id: string;
        user_id: string;
        source_name: string;
        source_subtitle: string | null;
        source_icon: string | null;
        source_url_template: string;
        source_category: string;
        description: string | null;
        tags: string;
        download_count: number;
        like_count: number;
        view_count: number;
        rating_score: number;
        rating_count: number;
        status: string;
        created_at: number;
        updated_at: number;
        author_name?: string;
      }>
    }>(url);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.map(s => ({
          id: s.id,
          sourceName: s.source_name,
          sourceSubtitle: s.source_subtitle || undefined,
          sourceIcon: s.source_icon || undefined,
          sourceUrlTemplate: s.source_url_template,
          sourceCategory: s.source_category,
          description: s.description || undefined,
          tags: JSON.parse(s.tags || '[]'),
          authorId: s.user_id,
          authorName: s.author_name || '',
          viewCount: s.view_count,
          downloadCount: s.download_count,
          likeCount: s.like_count,
          ratingScore: s.rating_score,
          ratingCount: s.rating_count,
          status: s.status as 'pending' | 'active' | 'rejected',
          createdAt: new Date(s.created_at).toISOString(),
          updatedAt: new Date(s.updated_at).toISOString(),
        }))
      };
    }
    return { success: false, data: [] };
  },

  getRecentSources: async (limit = 10): Promise<{ success: boolean; data: SharedSource[] }> => {
    const response = await apiClient.get<{ 
      success: boolean; 
      data: Array<{
        id: string;
        user_id: string;
        source_name: string;
        source_subtitle: string | null;
        source_icon: string | null;
        source_url_template: string;
        source_category: string;
        description: string | null;
        tags: string;
        download_count: number;
        like_count: number;
        view_count: number;
        rating_score: number;
        rating_count: number;
        status: string;
        created_at: number;
        updated_at: number;
      }>
    }>(`/community/sources/recent?limit=${limit}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.map(s => ({
          id: s.id,
          sourceName: s.source_name,
          sourceSubtitle: s.source_subtitle || undefined,
          sourceIcon: s.source_icon || undefined,
          sourceUrlTemplate: s.source_url_template,
          sourceCategory: s.source_category,
          description: s.description || undefined,
          tags: JSON.parse(s.tags || '[]'),
          authorId: s.user_id,
          authorName: '',
          viewCount: s.view_count,
          downloadCount: s.download_count,
          likeCount: s.like_count,
          ratingScore: s.rating_score,
          ratingCount: s.rating_count,
          status: s.status as 'pending' | 'active' | 'rejected',
          createdAt: new Date(s.created_at).toISOString(),
          updatedAt: new Date(s.updated_at).toISOString(),
        }))
      };
    }
    return { success: false, data: [] };
  },

  getUserStats: async (): Promise<{ 
    success: boolean; 
    data: CommunityUserStats 
  }> => {
    const response = await apiClient.get<{ 
      success: boolean; 
      data: {
        general: {
          sharedSources: number;
          pendingSources: number;
          totalDownloads: number;
          totalLikes: number;
          totalViews: number;
          avgRating: number;
          reviewsGiven: number;
          tagsCreated: number;
        };
        recentShares: Array<{
          id: string;
          source_name: string;
          status: string;
          download_count: number;
          like_count: number;
          view_count: number;
          rating_score: number;
          created_at: number;
        }>;
      }
    }>('/community/sources/user-stats');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          sharedSources: response.data.general.sharedSources,
          pendingSources: response.data.general.pendingSources,
          totalDownloads: response.data.general.totalDownloads,
          totalLikes: response.data.general.totalLikes,
          totalViews: response.data.general.totalViews,
          avgRating: response.data.general.avgRating,
          reviewsGiven: response.data.general.reviewsGiven,
          tagsCreated: response.data.general.tagsCreated,
          recentShares: response.data.recentShares.map(s => ({
            id: s.id,
            sourceName: s.source_name,
            status: s.status,
            downloadCount: s.download_count,
            likeCount: s.like_count,
            viewCount: s.view_count,
            ratingScore: s.rating_score,
            createdAt: s.created_at,
          })),
        }
      };
    }
    return { success: false, data: {} as CommunityUserStats };
  },

  getCommunityStats: async (): Promise<{ 
    success: boolean; 
    data: CommunityStats 
  }> => {
    const response = await apiClient.get<{ 
      success: boolean; 
      data: {
        totalSources: number;
        totalDownloads: number;
        totalUsers: number;
        totalReviews: number;
        averageRating: number;
        categoriesCount: number;
        topCategories: Array<{ category: string; count: number }>;
        recentActivity: Array<{
          id: string;
          type: string;
          sourceName: string;
          createdAt: string;
        }>;
      }
    }>('/community/sources/stats');
    
    if (response.success && response.data) {
      return {
        success: true,
        data: {
          totalSources: response.data.totalSources,
          totalDownloads: response.data.totalDownloads,
          totalUsers: response.data.totalUsers,
          totalReviews: response.data.totalReviews,
          averageRating: response.data.averageRating,
          categoriesCount: response.data.categoriesCount,
          topCategories: response.data.topCategories,
          recentActivity: response.data.recentActivity,
        }
      };
    }
    return { success: false, data: {} as CommunityStats };
  },

  getNotifications: async (page = 1, pageSize = 20): Promise<{
    success: boolean;
    data: PaginatedResponse<{
      id: string;
      type: 'like' | 'review' | 'download' | 'report_resolved';
      sourceId: string;
      sourceName: string;
      actorName: string;
      content: string;
      rating?: number;
      createdAt: number;
    }>;
  }> => {
    const response = await apiClient.get<{
      success: boolean;
      data: {
        items: Array<{
          id: string;
          type: 'like' | 'review' | 'download' | 'report_resolved';
          sourceId: string;
          sourceName: string;
          actorName: string;
          content: string;
          rating?: number;
          createdAt: number;
        }>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      };
    }>(`/community/notifications?page=${page}&pageSize=${pageSize}`);

    if (response.success && response.data) {
      return {
        success: true,
        data: {
          items: response.data.items,
          total: response.data.total,
          page: response.data.page,
          pageSize: response.data.pageSize,
          totalPages: response.data.totalPages,
        },
      };
    }
    return { success: false, data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } };
  },
};
