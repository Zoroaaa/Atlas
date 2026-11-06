import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { readPersisted, writePersisted } from '@/utils/persistentCache';

const SYNC_KEY_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * 页面打开后（延迟 2 秒，不占首屏）做一次极轻量校验：
 * 对比服务端的收藏/历史"数量 + 最近修改时间"，和上次记录不同（说明别的设备改过）才让本地缓存失效。
 * 本机的增删改会自己清缓存并清掉这条记录，所以不会重复刷新。
 */
export function useCacheSync() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    const timer = setTimeout(async () => {
      try {
        const response = await userApi.getSyncState();
        if (!response.success || !response.data) return;

        const next = JSON.stringify(response.data);
        const key = `sync:${userId}`;
        const prev = readPersisted<string>(key, SYNC_KEY_TTL)?.data;
        writePersisted(key, next);

        if (prev && prev !== next) {
          void queryClient.invalidateQueries({ queryKey: ['favorites'] });
          void queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
        }
      } catch {
        // 校验失败不影响使用，缓存仍受 TTL 约束
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, userId, queryClient]);
}
