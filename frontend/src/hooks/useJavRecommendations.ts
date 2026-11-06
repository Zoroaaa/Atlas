import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores';
import { recommendApi } from '@/services/api';
import { readPersisted, writePersisted } from '@/utils/persistentCache';
import type { JavRecommendationResponse, JavRecommendationSeed } from '@/types';

interface UseJavRecommendationsOptions {
  variant: 'related' | 'for-you';
  seed?: JavRecommendationSeed;
  excludeCodes?: string[];
  enabled?: boolean;
}

// "为你推荐"本地缓存 30 分钟；点面板上的刷新按钮会强制重新获取
const FOR_YOU_CACHE_TTL = 30 * 60 * 1000;

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
  const { isAuthenticated, user } = useAuthStore();
  const isForYou = variant === 'for-you';
  const forYouCacheKey = `jav-rec:for-you:${user?.id}`;
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
      // for-you 请求不使用 excludeCodes，key 中去掉，避免收藏变化导致缓存失效重取
      isForYou ? '' : excludeCodes.join('|'),
    ],
    queryFn: async () => {
      const response = variant === 'related'
        ? await recommendApi.related({ ...seed, excludeCodes, limit: 8 })
        : await recommendApi.get('for-you');

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || response.message || '获取推荐失败');
      }
      if (isForYou) writePersisted(forYouCacheKey, response.data);
      return response.data;
    },
    enabled: queryEnabled,
    // 为你推荐：半小时内直接读本地缓存；相关推荐依赖当前搜索，仍每次重新获取
    staleTime: isForYou ? FOR_YOU_CACHE_TTL : 0,
    initialData: isForYou && user?.id
      ? () => readPersisted<JavRecommendationResponse>(forYouCacheKey, FOR_YOU_CACHE_TTL)?.data
      : undefined,
    initialDataUpdatedAt: isForYou && user?.id
      ? () => readPersisted<JavRecommendationResponse>(forYouCacheKey, FOR_YOU_CACHE_TTL)?.cachedAt
      : undefined,
    retry: 1,
  });

  return { ...query, hasSeed: seedValid, queryEnabled };
}
