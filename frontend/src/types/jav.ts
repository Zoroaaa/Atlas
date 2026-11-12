export interface JavItem {
  code: string;
  title: string;
  cover?: string;
  date?: string;
  actress?: string;
  source: string;
}

// ── 榜单 ────────────────────────────────────────────────────────────────

export type JavRankingPeriod = 'weekly' | 'monthly';
export type JavRankingSection = 'censored' | 'uncensored';

export interface JavRankingEntry {
  code: string;
  title: string;
  cover?: string;
  rank: number;
  url?: string;
  /** 相对上一期名次变化：正数=上升，负数=下降 */
  change?: number;
  /** 新上榜 */
  isNew?: boolean;
}

export interface JavRankingSectionView {
  censored: JavRankingEntry[];
  uncensored: JavRankingEntry[];
  updatedAt: number;
}

export interface JavRankings {
  weekly: JavRankingSectionView;
  monthly: JavRankingSectionView;
  source: 'javdb';
}

// ── 热门女优 ───────────────────────────────────────────────────────────

export interface HotActressItem {
  name: string;
  /** 关注这位女优的用户数 */
  followers: number;
  works: number;
  score: number;
}

export interface HotActressRanking {
  items: HotActressItem[];
  updatedAt: number;
}

export const JAV_RANKINGS_PAGE_SIZE = 10;
export const JAV_ACTRESSES_DISPLAY = 18;

export const JAV_CACHE_KEY = 'jav_rankings_cache_v4';
// 榜单由每日定时任务更新（见 javdb-ranking-daily.yml），缓存 6 小时；用户点刷新会强制重取
export const JAV_CACHE_TTL = 6 * 60 * 60 * 1000;

export const ACTRESSES_CACHE_KEY = 'jav_actresses_cache_v5';
export const ACTRESSES_CACHE_TTL = 6 * 60 * 60 * 1000;

// ── 推荐标签 ───────────────────────────────────────────────────────────

export type GenreSection = 'censored' | 'uncensored';
export type GenreTagSource = 'personal' | 'random';

export interface GenreRecTag {
  key: string;
  name: string;
  section: GenreSection;
  source: GenreTagSource;
  score: number;
}

export interface GenreCoverage {
  favorites: number;
  favoritesWithTags: number;
  history: number;
  historyWithTags: number;
}

export interface GenreRecommendationResult {
  tags: GenreRecTag[];
  isNewUser: boolean;
  coverage: GenreCoverage;
}

export interface GenreWorkItem {
  code: string;
  title: string;
  cover?: string;
  actors: string[];
  date?: string;
  tags: string[];
  isFavorite: boolean;
}

export interface GenreWorksResult {
  genre: {
    key: string;
    name: string;
    section: GenreSection;
    url: string;
  };
  page: number;
  maxPage: number;
  hasMore: boolean;
  items: GenreWorkItem[];
}

/** 推荐标签沿用"为你推荐"的 30 分钟本地缓存口径 */
export const GENRE_REC_CACHE_TTL = 30 * 60 * 1000;

// ── 详情 & 磁力 ──────────────────────────────────────────────────────

export interface MagnetItem {
  name: string;
  size: string;
  date: string;
  magnet: string;
  isHD: boolean;
}

/** JavBus 实体分类：导演 / 制作商 / 发行商 / 系列 */
export type JavEntityKind = 'director' | 'studio' | 'label' | 'series';

/** 详情页字段上的实体链接（点击后查看同类作品） */
export interface JavEntityLink {
  kind: JavEntityKind;
  name: string;
  /** JavBus 实体列表页路径，如 /director/o7 */
  path: string;
}

/** 打开实体作品列表所需的信息；老记录没有 path 时用 code 回源解析 */
export interface JavEntityTarget {
  kind: JavEntityKind;
  name: string;
  path?: string;
  code?: string;
}

/** JavBus 实体列表页的作品项（与 parseGrid 输出一致） */
export interface JavEntityWorkItem {
  code: string;
  title: string;
  cover?: string;
  date?: string;
  actress?: string;
  source?: string;
}

export interface JavDetail {
  code: string;
  title: string;
  cover?: string;
  releaseDate?: string;
  duration?: string;
  director?: string;
  maker?: string;
  publisher?: string;
  series?: string;
  /** 实体链接：前端点击后查看该导演/制作商/发行商/系列的作品 */
  directorLinks?: JavEntityLink[];
  makerLinks?: JavEntityLink[];
  publisherLinks?: JavEntityLink[];
  seriesLinks?: JavEntityLink[];
  tags: string[];
  actresses: string[];
  magnets: MagnetItem[];
  detailUrl: string;
  /** 搜索结果显示的来源：true 表示来自本地库，可手动回源 JavBus 刷新 */
  fromLibrary?: boolean;
}
