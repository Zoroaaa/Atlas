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
//
// ⚠️ 类型同步契约：
//   以下接口与后端 service 文件保持 1:1 结构对应：
//     BangumiSubject  ←→ backend/src/services/anime-search.ts
//     NyaaTorrent      ←→ backend/src/services/anime-search.ts
//     MikanItem         ←→ backend/src/services/anime-search.ts
//     ShowRssItem       ←→ backend/src/services/anime-search.ts
//     AnimeEnrichedData ←→ backend/src/routes/search.ts (聚合响应)
//     TMDBResult        ←→ backend/src/services/movie-search.ts
//     ResourceItem      ←→ backend/src/services/movie-search.ts
//     MovieEnrichedData ←→ backend/src/routes/search.ts (聚合响应)
//
//   修改任一端字段时，必须同步更新另一端，否则运行时可能出现静默错误。

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

export interface ShowRssItem {
  title: string;
  magnet: string;
}

/** 女优资料（minnano-av.com 抓取） */
export interface ActressProfile {
  id: string;
  name: string;
  ruby?: string;
  romaji?: string;
  alias?: string;
  birthday?: string;
  zodiac?: string;
  height?: number;
  bust?: number;
  cup?: string;
  waist?: number;
  hip?: number;
  prefecture?: string;
  agency?: string;
  activePeriod?: string;
  debutWork?: string;
  blogUrl?: string;
  officialUrl?: string;
  tags?: string[];
  cover?: string;
  detailUrl: string;
}

/** 统一资源类型（归组用，合并各源资源） */
export interface AnimeUnifiedResource {
  source: 'nyaa' | 'mikan' | 'animetosho' | 'showrss';
  sourceLabel: string;
  title: string;
  magnet: string;
  size: string;
  date: string;
  seeders: number;
  leechers: number;
  group?: string;
  trusted?: boolean;
}

/** 归组结果项 */
export interface AnimeGroupedItem {
  subject: BangumiSubject;
  resources: AnimeUnifiedResource[];
}

export interface AnimeEnrichedData {
  resultType: 'anime';
  keyword: string;
  page: number;
  bgm: BangumiSubject[];
  nyaa: NyaaTorrent[];
  mikan: MikanItem[];
  animetosho: NyaaTorrent[];
  showrss: ShowRssItem[];
  total: number;
  errors: { bangumi: string | null; nyaa: string | null; mikan: string | null; animetosho: string | null; showrss: string | null };
  /** 作品级归组结果 */
  grouped?: {
    groups: AnimeGroupedItem[];
    ungrouped: AnimeUnifiedResource[];
  };
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
  tpbError: string | null;
  eztvError: string | null;     // NEW
  resourceSources?: string[];
  /** 作品级归组结果 */
  grouped?: {
    groups: Array<{ subject: TMDBResult; resources: ResourceItem[] }>;
    ungrouped: ResourceItem[];
  };
}

export interface JavEnrichedData {
  resultType: 'jav';
  keyword: string;
  /** 归一化后的日文名（actress 子模式）：供「minnano 站内搜索」链接使用 */
  normalizedKeyword?: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  detail?: {
    code: string;
    title: string;
    cover?: string;
    releaseDate?: string;
    duration?: string;
    publisher?: string;
    director?: string;
    maker?: string;
    series?: string;
    tags: string[];
    actresses: string[];
    detailUrl: string;
    magnets: import('./jav').MagnetItem[];
  };
  /** 多源搜索结果（与通用模式格式一致，用于 SearchResultsPanel） */
  results?: Array<{
    id: string;
    name: string;
    subtitle?: string;
    icon?: string;
    url: string;
    siteType: string;
    category: string;
    description?: string;
  }>;
  /** 女优资料（actress 子模式，minnano-av 抓取） */
  actresses?: ActressProfile[];
  /** 女优作品列表（actress 子模式，JavBus 搜索抓取，仅当 minnano 女优搜索成功时才返回） */
  actressWorks?: import('./jav').JavItem[];
}

export interface MangaEnrichedData {
  resultType: 'manga';
  keyword: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  manga: Array<{
    id: string;
    title: string;
    cover: string;
    status: string;
    tags: string[];
  }>;
}

export interface NovelItem {
  /** MD5 */
  id: string;
  /** 书名 */
  title: string;
  /** 作者 */
  author: string;
  /** 图书描述 / 简介（从详情页抓取） */
  description: string;
  /** 出版社 / 来源机构（含年份，如 "shu.im, 2011"） */
  publisher: string;
  /** 封面图 URL */
  cover: string;
  /** 语言（如 "中文 [zh]"） */
  language: string;
  /** 文件格式（如 "PDF" / "EPUB" / "MOBI"） */
  format: string;
  /** 文件大小（如 "1.4MB"） */
  size: string;
  /** 出版年份 */
  year: string;
  /** 分类标签（如 "小说类图书"） */
  category: string;
  /** 来源标识（如 "lgli/upload/zlib"） */
  source: string;
  /** 详情页/下载页 URL */
  detailUrl: string;
}

export interface NovelEnrichedData {
  resultType: 'novel';
  keyword: string;
  page: number;
  total: number;
  errors: Record<string, string | null>;
  novels: NovelItem[];
}

export type EnrichedSearchData = AnimeEnrichedData | MovieEnrichedData | JavEnrichedData | MangaEnrichedData | NovelEnrichedData;
