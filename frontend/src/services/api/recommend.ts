/**
 * JAV 推荐 API：推荐结果随搜索/收藏变化，请求带时间戳绕过浏览器与中间层缓存。
 */

import { apiClient } from './client';
import { parseRequest } from '../validation';
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

/** 推荐接口：mode 区分个性化与热门；失败时返回 error 字段由调用方降级。 */
export const recommendApi = {
  get: async (mode: 'for-you' | 'popular'): Promise<RecommendApiResponse> => {
    return apiClient.get<RecommendApiResponse>(
      `/recommend/jav?mode=${mode}&_t=${Date.now()}`
    );
  },

  related: async (body: JavRelatedRequest): Promise<RecommendApiResponse> => {
    const { relatedSchema } = await import('@codeseek/shared/schemas/recommend');
    const payload = await parseRequest<JavRelatedRequest>(relatedSchema, body);
    return apiClient.post<RecommendApiResponse>(
      `/recommend/jav/related?_t=${Date.now()}`,
      payload
    );
  },
};
