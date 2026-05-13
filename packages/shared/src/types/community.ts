export type CommunitySourceStatus = 'pending' | 'approved' | 'rejected';

export type CommunitySourceReportStatus = 'pending' | 'resolved' | 'dismissed';

export interface CommunitySharedSource {
  id: string;
  userId: string;
  userName?: string;
  sourceName: string;
  sourceSubtitle?: string;
  sourceIcon?: string;
  sourceUrlTemplate: string;
  sourceCategory: string;
  description?: string;
  tags?: string;
  status: CommunitySourceStatus;
  isVerified: boolean;
  isFeatured: boolean;
  viewCount: number;
  downloadCount: number;
  likeCount: number;
  ratingScore: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunitySourceReview {
  id: string;
  sharedSourceId: string;
  userId: string;
  rating: number;
  comment?: string;
  isAnonymous: boolean;
  createdAt: string;
}

export interface CommunitySourceTag {
  id: string;
  tagName: string;
  tagDescription?: string;
  tagColor: string;
  usageCount: number;
  isOfficial: boolean;
}