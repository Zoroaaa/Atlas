/**
 * 动漫搜索 API
 * 对应后端 /api/anime 路由
 */
import { apiClient } from './client';

// ─── Types ──────────────────────────────────────────────────────────────

export interface BangumiSubject {
  id: number;
  name: string;
  nameCN: string;
  cover: string;
  summary: string;
  airDate: string;
  rating: number;
  eps: number;
  url: string;
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
}

export interface MikanItem {
  title: string;
  magnet: string;
  size: string;
  pubDate: string;
  group: string;
}

export interface AnimeSearchData {
  keyword: string;
  page: number;
  bgm: BangumiSubject[];
  nyaa: NyaaTorrent[];
  mikan: MikanItem[];
  total: number;
}

// ─── API ────────────────────────────────────────────────────────────────

export const animeApi = {
  /**
   * 搜索动漫
   * @param keyword 搜索关键词
   * @param page 页码（默认1）
   * @param source 数据源：all | nyaa | mikan
   */
  search: (keyword: string, page = 1, source = 'all') =>
    apiClient.get<{ success: boolean; data: AnimeSearchData }>(
      `/anime/search?q=${encodeURIComponent(keyword)}&page=${page}&source=${source}`
    ),
};
