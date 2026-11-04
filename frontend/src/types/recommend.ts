export type RecommendReasonType = 'actor' | 'tag' | 'publisher' | 'popular' | 'ranking';

export interface JavRecommendationItem {
  code: string;
  title: string;
  cover?: string;
  actors?: string[];
  tags?: string[];
  publisher?: string;
  rating?: string;
  /** 仅推荐列表返回 */
  score?: number;
  /** 仅热门列表返回 */
  rank?: number;
  reason: {
    type: RecommendReasonType;
    value?: string;
    /** 榜单来源周期（仅 type='ranking'） */
    period?: 'weekly' | 'monthly';
  };
}

export interface JavRecommendationResponse {
  mode: 'for-you' | 'popular' | 'related';
  isNewUser: boolean;
  items: JavRecommendationItem[];
  basis?: {
    actors: string[];
    tags: string[];
  };
  generatedAt: number;
}

export interface JavRecommendationSeed {
  code?: string;
  actress?: string;
  actors?: string[];
  tags?: string[];
  publisher?: string;
}

export interface JavRelatedRequest extends JavRecommendationSeed {
  excludeCodes?: string[];
  limit?: number;
}
