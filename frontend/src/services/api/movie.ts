/**
 * 影视搜索 API
 * 对应后端 /api/movie 路由
 */
import { apiClient } from './client';

// ─── Types ──────────────────────────────────────────────────────────────

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
  genres?: string[];
  /** 数据来源 */
  source?: 'tmdb' | 'douban';
}

export interface ResourceItem {
  title: string;
  magnet: string;
  size: string;
  date: string;
  source: string;
  sourceLabel: string;
}

export interface MovieSearchData {
  keyword: string;
  page: number;
  results: TMDBResult[];
  resources: ResourceItem[];
  total: number;
  resourceTotal: number;
  tmdbError: string | null;
  doubanError?: string | null;
}

// ─── API ────────────────────────────────────────────────────────────────

export const movieApi = {
  /**
   * 搜索影视
   * @param keyword 搜索关键词
   * @param page 页码（默认1）
   */
  search: (keyword: string, page = 1) =>
    apiClient.get<{ success: boolean; data: MovieSearchData }>(
      `/movie/search?q=${encodeURIComponent(keyword)}&page=${page}`
    ),
};
