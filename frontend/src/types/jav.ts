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
  users: number;
  works: number;
  score: number;
}

export interface HotActressRanking {
  items: HotActressItem[];
  updatedAt: number;
}

export const JAV_CACHE_KEY = 'jav_rankings_cache_v2';
// 榜单由每日定时任务更新（见 javdb-ranking-daily.yml），缓存 6 小时；用户点刷新会强制重取
export const JAV_CACHE_TTL = 6 * 60 * 60 * 1000;

export const ACTRESSES_CACHE_KEY = 'jav_actresses_cache_v2';
export const ACTRESSES_CACHE_TTL = 30 * 60 * 1000;

// ── 详情 & 磁力 ──────────────────────────────────────────────────────

export interface MagnetItem {
  name: string;
  size: string;
  date: string;
  magnet: string;
  isHD: boolean;
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
  tags: string[];
  actresses: string[];
  magnets: MagnetItem[];
  detailUrl: string;
}
