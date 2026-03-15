export interface Tag {
  id: string;
  name: string;
  description?: string;
  color: string;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

export interface SharedSource {
  id: string;
  sourceName: string;
  sourceSubtitle?: string;
  sourceIcon?: string;
  sourceUrlTemplate: string;
  sourceCategory: string;
  description?: string;
  tags: string[];
  authorId: string;
  authorName: string;
  viewCount: number;
  downloadCount: number;
  likeCount: number;
  ratingScore: number;
  ratingCount: number;
  status: 'pending' | 'active' | 'rejected';
  createdAt: string;
  updatedAt: string;
  isLiked?: boolean;
}

export interface Review {
  id: string;
  sharedSourceId: string;
  userId: string;
  userName: string;
  rating: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSharedSourceRequest {
  sourceName: string;
  sourceSubtitle?: string;
  sourceIcon?: string;
  sourceUrlTemplate: string;
  sourceCategory: string;
  description?: string;
  tags?: string[];
}

export interface UpdateSharedSourceRequest {
  sourceName?: string;
  sourceSubtitle?: string;
  sourceIcon?: string;
  description?: string;
  tags?: string[];
  sourceCategory?: string;
}

export interface CreateReviewRequest {
  sharedSourceId: string;
  rating: number;
  comment?: string;
}

export interface UpdateReviewRequest {
  rating?: number;
  comment?: string;
}

export interface CreateTagRequest {
  name: string;
  description?: string;
  color: string;
}

export interface UpdateTagRequest {
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

export interface ReportRequest {
  reason: string;
  details?: string;
}

export interface CommunityUserStats {
  sharedSources: number;
  pendingSources: number;
  totalDownloads: number;
  totalLikes: number;
  totalViews: number;
  avgRating: number;
  reviewsGiven: number;
  tagsCreated: number;
  recentShares: Array<{
    id: string;
    sourceName: string;
    status: string;
    downloadCount: number;
    likeCount: number;
    viewCount: number;
    ratingScore: number;
    createdAt: number;
  }>;
}

export interface CommunityStats {
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
