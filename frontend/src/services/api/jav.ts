import { apiClient } from './client';
import type { GenreRecommendationResult, GenreWorksResult } from '@/types';

export interface JavApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { code?: string; message?: string };
}

export const javApi = {
  genreRecommendations: async (refresh = false): Promise<JavApiResponse<GenreRecommendationResult>> => {
    return apiClient.get<JavApiResponse<GenreRecommendationResult>>(
      `/jav/genre-recommendations?refresh=${refresh ? 1 : 0}&_t=${Date.now()}`
    );
  },

  genreWorks: async (params: {
    genre: string;
    refresh?: boolean;
    prevPage?: number;
  }): Promise<JavApiResponse<GenreWorksResult>> => {
    const query = new URLSearchParams({
      genre: params.genre,
      refresh: params.refresh ? '1' : '0',
      _t: String(Date.now()),
    });
    if (params.prevPage && params.prevPage > 0) {
      query.set('prevPage', String(params.prevPage));
    }
    return apiClient.get<JavApiResponse<GenreWorksResult>>(`/jav/genre-works?${query.toString()}`);
  },
};
