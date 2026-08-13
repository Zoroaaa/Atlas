import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { communityApi } from '@/services/api/community';
import type {
  CommunityPost,
  CommunityTag,
  CommunityComment,
  CreatePostRequest,
  UpdatePostRequest,
  CreateCommentRequest,
  CommunityUserStats,
  CommunityStats,
  CommunityNotification,
} from '@/types';

interface CommunityState {
  // 帖子数据
  posts: CommunityPost[];
  currentPost: CommunityPost | null;
  postsLoading: boolean;
  postsTotal: number;
  postsPage: number;

  // 筛选状态
  postTypeFilter: 'all' | 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress';
  sortBy: 'latest' | 'hot';
  searchQuery: string;

  // 标签
  tags: CommunityTag[];
  tagsLoading: boolean;

  // 评论
  comments: CommunityComment[];
  commentsLoading: boolean;

  // 用户数据
  myPosts: CommunityPost[];
  myFavorites: CommunityPost[];
  userStats: CommunityUserStats | null;

  // 社区统计
  communityStats: CommunityStats | null;

  // 通知
  notifications: CommunityNotification[];
  notificationsUnread: number;

  // Actions - 帖子操作
  fetchPosts: (params?: { page?: number; pageSize?: number; postType?: string; tags?: string; sort?: string; search?: string }) => Promise<void>;
  fetchPost: (id: string) => Promise<void>;
  createPost: (data: CreatePostRequest) => Promise<void>;
  updatePost: (id: string, data: UpdatePostRequest) => Promise<void>;
  deletePost: (id: string) => Promise<void>;

  // Actions - 互动功能（乐观更新）
  toggleLike: (postId: string) => Promise<void>;
  toggleFavorite: (postId: string) => Promise<void>;

  // Actions - 评论操作
  fetchComments: (postId: string) => Promise<void>;
  addComment: (data: CreateCommentRequest) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;

  // Actions - 标签操作
  fetchTags: () => Promise<void>;

  // Actions - 个人中心
  fetchMyPosts: (params?: { page?: number; pageSize?: number; status?: string }) => Promise<void>;
  fetchMyFavorites: (params?: { page?: number; pageSize?: number }) => Promise<void>;
  fetchUserStats: () => Promise<void>;

  // Actions - 统计数据
  fetchCommunityStats: () => Promise<void>;

  // Actions - 通知
  fetchNotifications: (params?: { page?: number; pageSize?: number }) => Promise<void>;

  // Actions - 筛选器
  setPostTypeFilter: (filter: 'all' | 'jav' | 'anime' | 'movie' | 'manga' | 'novel' | 'actress') => void;
  setSortBy: (sort: 'latest' | 'hot') => void;
  setSearchQuery: (query: string) => void;

  // Actions - 重置
  reset: () => void;
}

const initialState = {
  posts: [],
  currentPost: null,
  postsLoading: false,
  postsTotal: 0,
  postsPage: 1,

  postTypeFilter: 'all' as const,
  sortBy: 'latest' as const,
  searchQuery: '',

  tags: [],
  tagsLoading: false,

  comments: [],
  commentsLoading: false,

  myPosts: [],
  myFavorites: [],
  userStats: null,

  communityStats: null,

  notifications: [],
  notificationsUnread: 0,
};

export const useCommunityStore = create<CommunityState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ==================== 帖子操作 ====================

      fetchPosts: async (params) => {
        set({ postsLoading: true });
        try {
          const response = await communityApi.getPosts({
            ...params,
            postType: params?.postType || (get().postTypeFilter === 'all' ? undefined : get().postTypeFilter),
            sort: params?.sort || get().sortBy,
            search: params?.search || get().searchQuery || undefined,
          });

          set({
            posts: response.items || [],
            postsTotal: response.total || 0,
            postsPage: response.page || 1,
            postsLoading: false,
          });
        } catch (error) {
          console.error('获取帖子列表失败:', error);
          set({ postsLoading: false });
        }
      },

      fetchPost: async (id) => {
        set({ postsLoading: true });
        try {
          const post = await communityApi.getPost(id);

          set({
            currentPost: post,
            postsLoading: false,
          });
        } catch (error) {
          console.error('获取帖子详情失败:', error);
          set({ postsLoading: false });
        }
      },

      createPost: async (data) => {
        set({ postsLoading: true });
        try {
          const response = await communityApi.createPost(data);

          set((state) => ({
            posts: [response.data, ...state.posts],
            postsTotal: state.postsTotal + 1,
            postsLoading: false,
          }));
        } catch (error) {
          console.error('创建帖子失败:', error);
          set({ postsLoading: false });
        }
      },

      updatePost: async (id, data) => {
        try {
          await communityApi.updatePost(id, data);

          set((state) => ({
            posts: state.posts.map((p) =>
              p.id === id ? { ...p, ...data } : p
            ),
            currentPost:
              state.currentPost && state.currentPost.id === id
                ? { ...state.currentPost, ...data }
                : state.currentPost,
          }));
        } catch (error) {
          console.error('更新帖子失败:', error);
        }
      },

      deletePost: async (id) => {
        try {
          await communityApi.deletePost(id);

          set((state) => ({
            posts: state.posts.filter((p) => p.id !== id),
            postsTotal: state.postsTotal - 1,
            currentPost: state.currentPost && state.currentPost.id === id ? null : state.currentPost,
          }));
        } catch (error) {
          console.error('删除帖子失败:', error);
        }
      },

      // ==================== 互动功能（乐观更新）====================

      toggleLike: async (postId) => {
        const { posts, currentPost } = get();
        const post = posts.find((p) => p.id === postId) || currentPost;

        if (!post) return;

        // 乐观更新：立即更新 UI
        const newLikedState = !post.isLiked;
        const newLikeCount = newLikedState ? post.likeCount + 1 : post.likeCount - 1;

        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === postId
              ? { ...p, isLiked: newLikedState, likeCount: newLikeCount }
              : p
          ),
          currentPost:
            state.currentPost && state.currentPost.id === postId
              ? { ...state.currentPost, isLiked: newLikedState, likeCount: newLikeCount }
              : state.currentPost,
        }));

        try {
          const result = await communityApi.toggleLike(postId);

          // 如果服务端返回失败，回滚状态
          if (result.liked !== newLikedState) {
            set((state) => ({
              posts: state.posts.map((p) =>
                p.id === postId
                  ? { ...p, isLiked: post.isLiked, likeCount: post.likeCount }
                  : p
              ),
              currentPost:
                state.currentPost && state.currentPost.id === postId
                  ? { ...state.currentPost, isLiked: post.isLiked, likeCount: post.likeCount }
                  : state.currentPost,
            }));
          }
        } catch (error) {
          console.error('点赞操作失败:', error);
          // 回滚状态
          set((state) => ({
            posts: state.posts.map((p) =>
              p.id === postId
                ? { ...p, isLiked: post.isLiked, likeCount: post.likeCount }
                : p
            ),
            currentPost:
              state.currentPost && state.currentPost.id === postId
                ? { ...state.currentPost, isLiked: post.isLiked, likeCount: post.likeCount }
                : state.currentPost,
          }));
        }
      },

      toggleFavorite: async (postId) => {
        const { posts, currentPost } = get();
        const post = posts.find((p) => p.id === postId) || currentPost;

        if (!post) return;

        // 乐观更新：立即更新 UI
        const newFavoritedState = !post.isFavorited;
        const newFavoriteCount = newFavoritedState
          ? post.favoriteCount + 1
          : post.favoriteCount - 1;

        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === postId
              ? { ...p, isFavorited: newFavoritedState, favoriteCount: newFavoriteCount }
              : p
          ),
          currentPost:
            state.currentPost && state.currentPost.id === postId
              ? { ...state.currentPost, isFavorited: newFavoritedState, favoriteCount: newFavoriteCount }
              : state.currentPost,
        }));

        try {
          const result = await communityApi.toggleFavorite(postId);

          // 如果服务端返回失败，回滚状态
          if (result.favorited !== newFavoritedState) {
            set((state) => ({
              posts: state.posts.map((p) =>
                p.id === postId
                  ? {
                      ...p,
                      isFavorited: post.isFavorited,
                      favoriteCount: post.favoriteCount,
                    }
                  : p
              ),
              currentPost:
                state.currentPost && state.currentPost.id === postId
                  ? {
                      ...state.currentPost,
                      isFavorited: post.isFavorited,
                      favoriteCount: post.favoriteCount,
                    }
                  : state.currentPost,
            }));
          }
        } catch (error) {
          console.error('收藏操作失败:', error);
          // 回滚状态
          set((state) => ({
            posts: state.posts.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    isFavorited: post.isFavorited,
                    favoriteCount: post.favoriteCount,
                  }
                : p
            ),
            currentPost:
              state.currentPost && state.currentPost.id === postId
                ? {
                    ...state.currentPost,
                    isFavorited: post.isFavorited,
                    favoriteCount: post.favoriteCount,
                  }
                : state.currentPost,
          }));
        }
      },

      // ==================== 评论操作 ====================

      fetchComments: async (postId) => {
        set({ commentsLoading: true });
        try {
          const response = await communityApi.getComments(postId);

          set({
            comments: response.items || [],
            commentsLoading: false,
          });
        } catch (error) {
          console.error('获取评论列表失败:', error);
          set({ commentsLoading: false });
        }
      },

      addComment: async (data) => {
        try {
          const response = await communityApi.createComment(data);

          set((state) => ({
            comments: [...state.comments, response.data],
            // 更新帖子的评论数
            posts: state.posts.map((p) =>
              p.id === data.postId
                ? { ...p, commentCount: p.commentCount + 1 }
                : p
            ),
            currentPost:
              state.currentPost && state.currentPost.id === data.postId
                ? {
                    ...state.currentPost,
                    commentCount: state.currentPost.commentCount + 1,
                  }
                : state.currentPost,
          }));
        } catch (error) {
          console.error('添加评论失败:', error);
        }
      },

      deleteComment: async (id) => {
        try {
          await communityApi.deleteComment(id);

          const comment = get().comments.find((c) => c.id === id);
          set((state) => ({
            comments: state.comments.filter((c) => c.id !== id),
            // 更新帖子的评论数
            posts: state.posts.map((p) =>
              p.id === comment?.postId
                ? { ...p, commentCount: Math.max(0, p.commentCount - 1) }
                : p
            ),
            currentPost:
              state.currentPost && state.currentPost.id === comment?.postId
                ? {
                    ...state.currentPost,
                    commentCount: Math.max(0, state.currentPost.commentCount - 1),
                  }
                : state.currentPost,
          }));
        } catch (error) {
          console.error('删除评论失败:', error);
        }
      },

      // ==================== 标签操作 ====================

      fetchTags: async () => {
        set({ tagsLoading: true });
        try {
          const tags = await communityApi.getTags();

          set({
            tags,
            tagsLoading: false,
          });
        } catch (error) {
          console.error('获取标签列表失败:', error);
          set({ tagsLoading: false });
        }
      },

      // ==================== 个人中心 ====================

      fetchMyPosts: async (params) => {
        set({ postsLoading: true });
        try {
          const response = await communityApi.getMyPosts(params);

          set({
            myPosts: response.items || [],
            postsLoading: false,
          });
        } catch (error) {
          console.error('获取我的帖子失败:', error);
          set({ postsLoading: false });
        }
      },

      fetchMyFavorites: async (params) => {
        set({ postsLoading: true });
        try {
          const response = await communityApi.getMyFavorites(params);

          set({
            myFavorites: response.items || [],
            postsLoading: false,
          });
        } catch (error) {
          console.error('获取我的收藏失败:', error);
          set({ postsLoading: false });
        }
      },

      fetchUserStats: async () => {
        try {
          const stats = await communityApi.getUserStats();
          set({ userStats: stats });
        } catch (error) {
          console.error('获取用户统计失败:', error);
        }
      },

      // ==================== 统计数据 ====================

      fetchCommunityStats: async () => {
        try {
          const stats = await communityApi.getCommunityStats();
          set({ communityStats: stats });
        } catch (error) {
          console.error('获取社区统计失败:', error);
        }
      },

      // ==================== 通知 ====================

      fetchNotifications: async (params) => {
        try {
          const response = await communityApi.getNotifications(params);

          set({
            notifications: response.items || [],
            notificationsUnread: (response.items || []).filter((n) => !n.isRead).length,
          });
        } catch (error) {
          console.error('获取通知列表失败:', error);
        }
      },

      // ==================== 筛选器 ====================

      setPostTypeFilter: (filter) => {
        set({ postTypeFilter: filter, postsPage: 1 });
      },

      setSortBy: (sort) => {
        set({ sortBy: sort, postsPage: 1 });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query, postsPage: 1 });
      },

      // ==================== 重置 ====================

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'community-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        postTypeFilter: state.postTypeFilter,
        sortBy: state.sortBy,
        searchQuery: state.searchQuery,
      }),
    }
  )
);
