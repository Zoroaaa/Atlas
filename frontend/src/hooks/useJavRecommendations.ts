import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores';
import { recommendApi } from '@/services/api';
import type { JavRecommendationResponse, JavRecommendationSeed } from '@/types';

interface UseJavRecommendationsOptions {
  variant: 'related' | 'for-you';
  seed?: JavRecommendationSeed;
  excludeCodes?: string[];
  enabled?: boolean;
}

function hasValidSeed(seed?: JavRecommendationSeed): boolean {
  if (!seed) return false;
  return Boolean(
    seed.code ||
    seed.actress ||
    (seed.actors && seed.actors.length > 0) ||
    (seed.tags && seed.tags.length > 0) ||
    seed.publisher
  );
}

export function useJavRecommendations({
  variant,
  seed,
  excludeCodes = [],
  enabled = true,
}: UseJavRecommendationsOptions) {
  const { isAuthenticated } = useAuthStore();
  const seedValid = hasValidSeed(seed);
  const queryEnabled = isAuthenticated && enabled && (variant === 'for-you' || seedValid);

  const query = useQuery<JavRecommendationResponse>({
    queryKey: [
      'recommend',
      'jav',
      variant,
      seed?.code ?? '',
      seed?.actress ?? '',
      seed?.actors?.join('|') ?? '',
      seed?.tags?.join('|') ?? '',
      seed?.publisher ?? '',
      excludeCodes.join('|'),
    ],
    queryFn: async () => {
      const response = variant === 'related'
        ? await recommendApi.related({ ...seed, excludeCodes, limit: 8 })
        : await recommendApi.get('for-you');

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || response.message || '获取推荐失败');
      }
      return response.data;
    },
    enabled: queryEnabled,
    // 推荐位是随机分配的，不缓存结果，每次挂载/刷新都重新抽
    staleTime: 0,
    retry: 1,
  });

  return { ...query, hasSeed: seedValid, queryEnabled };
}
