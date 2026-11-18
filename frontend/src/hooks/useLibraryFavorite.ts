/**
 * 本地存档详情卡的收藏状态与切换。
 *
 * 收藏以 URL 为唯一标识，判定与写入必须和搜索页共用同一套 URL 规则
 * （见 utils/libraryFavorite）；否则同一资源会在两处显示不同的收藏状态。
 */
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useToast } from '@/hooks/useNotification';
import { isSameFavoriteUrl } from '@/utils/favoriteUrl';
import { buildLibraryFavorite } from '@/utils/libraryFavorite';
import type { LibraryRecord } from '@/services/api/library';
import { useAddFavorite, useFavoriteIndex, useRemoveFavorite } from './useFavoritesQuery';

export function useLibraryFavorite(record: LibraryRecord | null) {
  const { t } = useTranslation(['errors']);
  const navigate = useNavigate();
  const toast = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: favorites = [] } = useFavoriteIndex();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  // 无来源页 URL 的记录无法收藏，直接不提供入口
  const payload = useMemo(() => (record ? buildLibraryFavorite(record) : null), [record]);

  const existing = useMemo(
    () => (payload ? favorites.find((f) => isSameFavoriteUrl(f.url, payload.url)) : undefined),
    [favorites, payload]
  );

  const isPending = addFavorite.isPending || removeFavorite.isPending;

  const toggle = useCallback(async () => {
    if (!payload || isPending) return;
    if (!isAuthenticated) {
      toast.warning(t('errors:hooks.favorites.loginRequired'));
      navigate('/login');
      return;
    }
    try {
      if (existing) {
        await removeFavorite.mutateAsync(existing.id);
        toast.success(t('errors:hooks.favorites.removedTitle'));
        return;
      }
      const response = await addFavorite.mutateAsync(payload);
      if (!response.success) {
        toast.error(t('errors:hooks.favorites.addFailedTitle'), response.message || t('errors:hooks.favorites.retryDefault'));
        return;
      }
      toast.success(t('errors:hooks.favorites.addedTitle'));
    } catch {
      toast.error(
        existing ? t('errors:hooks.favorites.removeFailedTitle') : t('errors:hooks.favorites.addFailedTitle'),
        t('errors:hooks.favorites.retryDefault')
      );
    }
  }, [payload, isPending, isAuthenticated, existing, toast, t, navigate, addFavorite, removeFavorite]);

  return {
    /** false 表示当前记录没有可收藏的来源页 URL，调用方应隐藏收藏入口 */
    available: !!payload,
    isFavorited: !!existing,
    isPending,
    toggle,
  };
}
