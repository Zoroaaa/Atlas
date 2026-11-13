/** 关注对象类型：女优 + JavBus 实体（导演/制作商/发行商/系列/标签） */
export type FollowEntityType = 'actress' | 'director' | 'studio' | 'label' | 'series' | 'tag';

export interface FollowItem {
  /** 关注对象的唯一 key：女优为 star slug，实体为 `<类型>:<JavBus 路径去掉开头斜杠>` */
  key: string;
  entityType: FollowEntityType;
  /** 去掉类型前缀后的标识：女优 slug / 实体路径 */
  entityKey: string;
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
  /** 作品来源的关注对象类型 */
  entityType: FollowEntityType;
  entityKey: string;
  entityName: string;
  /** 兼容字段：女优关注时等价于 entityKey / entityName */
  actressKey?: string;
  actressName?: string;
  isUnread: boolean;
}

export type FollowFeedTab = 'new' | 'upcoming';

export interface FollowFeedData {
  items: FollowFeedItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 关键词集合搜索：同一番号跨多个关注对象聚合为一条 */
export interface FollowFeedSearchItem {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  entityType: FollowEntityType;
  entityKey: string;
  /** 该作品命中的关注对象名称（多个时聚合） */
  entityNames: string[];
  isUnread: boolean;
}

export interface FollowFeedSearchData {
  q: string;
  items: FollowFeedSearchItem[];
  total: number;
  page: number;
  pageSize: number;
}
