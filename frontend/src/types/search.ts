// API 契约类型 - 从共享包导入
export type {
  SearchHistoryItem,
  FavoriteItem,
  SearchResult,
  SearchRequest,
  SearchResponse,
  SearchSuggestion,
  TrendingSearch,
  AddFavoriteRequest,
  SaveSearchHistoryRequest,
  SearchStats,
} from '@codeseek/shared';

// ─── 聚合搜索结果类型（anime / movie enriched response）───

export interface BangumiSubject {
  id: number;
  name: string;
  nameCN: string;
  cover: string;
  summary: string;
  airDate: string;
  airWeekday?: number;
  rating: number;
  ratingCount?: number;
  rank?: number;
  eps: number;
  url: string;
  /** 作品类型：TV(2)/OVA/Movie(6)/Web(4)/Music(3) — 数字或字符串 */
  type?: string | number;
  /** 制作公司/工作室 */
  studio?: string;
  /** 标签（最多5个热门标签） */
  tags?: string[];
  /** 收藏数据 */
  collection?: { wish: number; collect: number; doing: number; dropped: number };
  /** 放送状态：连载中 / 已完结 / 未开播 */
  status?: string;
}

export interface NyaaTorrent {
  id: string;
  title: string;
  magnet: string;
  torrentUrl: string;
  size: string;
  date: string;
  seeders: number;
  leechers: number;
  completed: number;
  trusted: boolean;
  category: string;
  source?: string;
  sourceLabel?: string;
  hasSeedData?: boolean;
  /** 原站详情页链接 */
  detailUrl?: string;
}

export interface MikanItem {
  title: string;
  magnet: string;
  size: string;
  pubDate: string;
  group: string;
  /** 原站详情页链接 */
  detailUrl?: string;
}

export interface AnimeEnrichedData {
  resultType: 'anime';
  keyword: string;
  page: number;
  bgm: BangumiSubject[];
  nyaa: NyaaTorrent[];
  mikan: MikanItem[];
  animetosho: NyaaTorrent[];
  total: number;
  errors: { bangumi: string | null; nyaa: string | null; mikan: string | null; animetosho: string | null };
}

export interface TMDBResult {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string;
  year: string;
  rating: number;
  voteCount: number;
  mediaType: 'movie' | 'tv';
  source: 'tmdb' | 'douban';
}

export interface ResourceItem {
  title: string;
  magnet: string;
  size: string;
  date: string;
  source: string;
  sourceLabel: string;
  resourceType?: 'magnet' | 'drive' | 'direct';
  driveUrl?: string;
  driveCode?: string;
  /** 原站详情页链接 */
  detailUrl?: string;
}

export interface MovieEnrichedData {
  resultType: 'movie';
  keyword: string;
  page: number;
  results: TMDBResult[];
  resources: ResourceItem[];
  total: number;
  resourceTotal: number;
  tmdbError: string | null;
  doubanError: string | null;
  ytsError: string | null;      // NEW
  eztvError: string | null;     // NEW
  resourceSources?: string[];
}

export type EnrichedSearchData = AnimeEnrichedData | MovieEnrichedData;
