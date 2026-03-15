export interface JavItem {
  code: string;
  title: string;
  cover?: string;
  date?: string;
  actress?: string;
  source: string;
}

export interface GroupRanking {
  name: string;   // 类别名 或 女优名
  key: string;    // slug
  items: JavItem[];
}

// 向后兼容旧命名
export type GenreRanking = GroupRanking;

export interface JavRankings {
  censored: JavItem[];        // 有码精选
  uncensored: JavItem[];      // 无码精选
  hd: JavItem[];              // 高清
  subtitle: JavItem[];        // 字幕
  genres: GroupRanking[];     // 随机10类别
  actresses: GroupRanking[];  // 随机10女优
  suggestions: string[];
  fetchedAt: number;
  sources: string[];
}

export const JAV_CACHE_KEY = 'jav_rankings_cache';
export const JAV_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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
