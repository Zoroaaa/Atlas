export interface FollowItem {
  key: string;
  name: string;
  avatar?: string;
  createdAt: number;
  notifyInApp: boolean;
  lastCheckedAt: number;
  checkFailing: boolean;
  unread: number;
}

export interface FollowsData {
  follows: FollowItem[];
  unread: number;
  limit: number;
}

export interface FollowFeedItem {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  actressKey: string;
  actressName: string;
  isUnread: boolean;
}

export type FollowFeedTab = 'new' | 'upcoming';

export interface FollowFeedData {
  items: FollowFeedItem[];
  total: number;
  page: number;
  pageSize: number;
}
