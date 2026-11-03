import { apiClient } from './client';
import type {
  JavRecommendationResponse,
  JavRelatedRequest,
} from '@/types';

interface RecommendApiResponse {
  success: boolean;
  data?: JavRecommendationResponse;
  message?: string;
  error?: { code?: string; message?: string };
}

export const recommendApi = {
  get: async (mode: 'for-you' | 'popular'): Promise<RecommendApiResponse> => {
    return apiClient.get<RecommendApiResponse>(
      `/recommend/jav?mode=${mode}&_t=${Date.now()}`
    );
  },

  related: async (body: JavRelatedRequest): Promise<RecommendApiResponse> => {
    return apiClient.post<RecommendApiResponse>(
      `/recommend/jav/related?_t=${Date.now()}`,
      body
    );
  },
};
