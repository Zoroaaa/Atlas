import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { useFavoriteIndex, useFavoritesPage, useAddFavorite, useRemoveFavorite, invalidateFavorites, FAVORITES_PAGE_SIZE } from '@/hooks';
import { userApi } from '@/services/api';
import { useToast } from '@/hooks/useNotification';
import i18next from '@/i18n';
import type { JavDetail } from '@/types/jav';
import type { BangumiSubject, TMDBResult, MangaEnrichedData, NovelItem } from '@/types/search';
import type { SearchResultItem } from './useSearchFlow';

interface UseFavoritesManagerOptions {
  keyword: string;
}

export function useFavoritesManager({ keyword }: UseFavoritesManagerOptions) {
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  // 轻量索引：搜索结果判断"已收藏"（仅 id/url/code，本地缓存）
  const { data: favorites = [] } = useFavoriteIndex();
  // 面板分页：每页 FAVORITES_PAGE_SIZE 条，按需请求
  const [favoritesPageNo, setFavoritesPageNo] = useState(1);
  const pageQuery = useFavoritesPage(favoritesPageNo);
  const favoritesPage = pageQuery.data?.favorites ?? [];
  const favoritesTotal = pageQuery.data?.total ?? 0;
  const favoritesTotalPages = Math.max(1, Math.ceil(favoritesTotal / FAVORITES_PAGE_SIZE));
  const isLoadingFavorites = pageQuery.isLoading;
  const refetchFavorites = () => invalidateFavorites(queryClient);

  // 删除后当前页可能越界（如删光最后一页），回退到最后一页
  useEffect(() => {
    if (!pageQuery.isPlaceholderData && pageQuery.data && favoritesPageNo > favoritesTotalPages) {
      setFavoritesPageNo(favoritesTotalPages);
    }
  }, [pageQuery.data, pageQuery.isPlaceholderData, favoritesPageNo, favoritesTotalPages]);
  const addFavoriteMutation = useAddFavorite();
  const removeFavoriteMutation = useRemoveFavorite();

  const getFavoriteId = (url: string) => favorites.find(f => f.url === url)?.id;

  const favoritedCodes = useMemo(() => {
    const codes = new Set<string>();
    favorites.forEach(f => { if (f.code) codes.add(f.code); });
    return codes;
  }, [favorites]);

  const handleToggleFavorite = async (result: SearchResultItem) => {
    if (!isAuthenticated) { toast.warning(i18next.t('errors:hooks.favorites.loginRequired')); navigate('/login'); return; }
    const existingFavoriteId = getFavoriteId(result.url || '');
    if (existingFavoriteId) {
      try {
        await removeFavoriteMutation.mutateAsync(existingFavoriteId);
        toast.success(i18next.t('errors:hooks.favorites.removedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.removeFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    } else {
      try {
        const response = await addFavoriteMutation.mutateAsync({
          title: result.sourceName,
          url: result.url || '',
          subtitle: result.subtitle,
          keyword: keyword.trim() || undefined,
        });
        if (!response.success) { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), response.message || i18next.t('errors:hooks.favorites.retryDefault')); return; }
        toast.success(i18next.t('errors:hooks.favorites.addedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    }
  };

  const handleFavoriteJavDetail = async (detail: JavDetail) => {
    if (!isAuthenticated) { toast.warning(i18next.t('errors:hooks.favorites.loginRequired')); navigate('/login'); return; }
    const detailUrl = detail.detailUrl || `https://javdb.com/search?q=${detail.code}&f=all`;
    const existingFavoriteId = getFavoriteId(detailUrl);
    if (existingFavoriteId) {
      try {
        await removeFavoriteMutation.mutateAsync(existingFavoriteId);
        toast.success(i18next.t('errors:hooks.favorites.removedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.removeFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    } else {
      try {
        const response = await addFavoriteMutation.mutateAsync({
          title: detail.title,
          url: detailUrl,
          code: detail.code,
          cover: detail.cover,
          actors: detail.actresses?.join(', '),
          duration: detail.duration,
          tags: detail.tags?.join(', '),
          releaseDate: detail.releaseDate,
          publisher: detail.publisher || detail.maker,
          keyword: detail.code,
        });
        if (!response.success) { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), response.message || i18next.t('errors:hooks.favorites.retryDefault')); return; }
        toast.success(i18next.t('errors:hooks.favorites.addedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    }
  };

  const handleToggleFavoriteAnime = async (subject: BangumiSubject) => {
    if (!isAuthenticated) { toast.warning(i18next.t('errors:hooks.favorites.loginRequired')); navigate('/login'); return; }
    const existingFavoriteId = getFavoriteId(subject.url);
    if (existingFavoriteId) {
      try {
        await removeFavoriteMutation.mutateAsync(existingFavoriteId);
        toast.success(i18next.t('errors:hooks.favorites.removedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.removeFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    } else {
      try {
        const response = await addFavoriteMutation.mutateAsync({
          title: subject.nameCN || subject.name,
          url: subject.url,
          cover: subject.cover,
          subtitle: subject.name !== subject.nameCN ? subject.name : undefined,
          tags: subject.tags?.join(', '),
          keyword: keyword.trim() || undefined,
        });
        if (!response.success) { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), response.message || i18next.t('errors:hooks.favorites.retryDefault')); return; }
        toast.success(i18next.t('errors:hooks.favorites.addedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    }
  };

  const handleToggleFavoriteMovie = async (item: TMDBResult) => {
    if (!isAuthenticated) { toast.warning(i18next.t('errors:hooks.favorites.loginRequired')); navigate('/login'); return; }
    const url = `https://www.themoviedb.org/${item.mediaType}/${item.id}`;
    const existingFavoriteId = getFavoriteId(url);
    if (existingFavoriteId) {
      try {
        await removeFavoriteMutation.mutateAsync(existingFavoriteId);
        toast.success(i18next.t('errors:hooks.favorites.removedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.removeFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    } else {
      try {
        const response = await addFavoriteMutation.mutateAsync({
          title: item.title,
          url,
          cover: item.poster ?? undefined,
          subtitle: item.originalTitle && item.originalTitle !== item.title ? item.originalTitle : undefined,
          tags: item.year ? String(item.year) : undefined,
          keyword: keyword.trim() || undefined,
        });
        if (!response.success) { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), response.message || i18next.t('errors:hooks.favorites.retryDefault')); return; }
        toast.success(i18next.t('errors:hooks.favorites.addedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    }
  };

  const handleToggleFavoriteManga = async (item: MangaEnrichedData['manga'][0]) => {
    if (!isAuthenticated) { toast.warning(i18next.t('errors:hooks.favorites.loginRequired')); navigate('/login'); return; }
    const url = `https://mangadex.org/title/${item.id}`;
    const existingFavoriteId = favorites.find(f => f.url?.includes(item.id))?.id;
    if (existingFavoriteId) {
      try {
        await removeFavoriteMutation.mutateAsync(existingFavoriteId);
        toast.success(i18next.t('errors:hooks.favorites.removedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.removeFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    } else {
      try {
        const response = await addFavoriteMutation.mutateAsync({
          title: item.title,
          url,
          cover: item.cover,
          tags: item.tags?.slice(0, 5).join(', '),
          keyword: keyword.trim() || undefined,
        });
        if (!response.success) { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), response.message || i18next.t('errors:hooks.favorites.retryDefault')); return; }
        toast.success(i18next.t('errors:hooks.favorites.addedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    }
  };

  const handleToggleFavoriteNovel = async (item: NovelItem) => {
    if (!isAuthenticated) { toast.warning(i18next.t('errors:hooks.favorites.loginRequired')); navigate('/login'); return; }
    const url = item.detailUrl;
    const existingFavoriteId = favorites.find(f => f.url?.includes(item.id))?.id;
    if (existingFavoriteId) {
      try {
        await removeFavoriteMutation.mutateAsync(existingFavoriteId);
        toast.success(i18next.t('errors:hooks.favorites.removedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.removeFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    } else {
      try {
        const response = await addFavoriteMutation.mutateAsync({
          title: item.title,
          url,
          cover: item.cover,
          code: `md5:${item.id}`,
          actors: item.author || undefined,
          publisher: item.publisher || undefined,
          tags: [item.format, item.year, item.category].filter(Boolean).join(', '),
          keyword: keyword.trim() || undefined,
        });
        if (!response.success) { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), response.message || i18next.t('errors:hooks.favorites.retryDefault')); return; }
        toast.success(i18next.t('errors:hooks.favorites.addedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.addFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    }
  };

  const handleRemoveFavorite = async (id: string) => {
    try {
      await removeFavoriteMutation.mutateAsync(id);
      toast.success(i18next.t('errors:hooks.favorites.removedFromListTitle'));
    } catch { toast.error(i18next.t('errors:hooks.favorites.removeFavoriteFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
  };

  const handleExportFavorites = async () => {
    // 导出需要完整数据：点击时才拉取全量，平时不请求
    try {
      const result = await userApi.getFavorites();
      if (!result.success || !result.data) throw new Error('export fetch failed');
      const data = JSON.stringify(result.data.favorites, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `favorites-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(i18next.t('errors:hooks.favorites.exportSuccessTitle'));
    } catch {
      toast.error(i18next.t('errors:hooks.favorites.exportFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault'));
    }
  };

  return {
    favorites,
    favoritesPage,
    favoritesTotal,
    favoritesTotalPages,
    favoritesPageNo,
    setFavoritesPageNo,
    isLoadingFavorites,
    favoritedCodes,
    handleToggleFavorite,
    handleFavoriteJavDetail,
    handleToggleFavoriteAnime,
    handleToggleFavoriteMovie,
    handleToggleFavoriteManga,
    handleToggleFavoriteNovel,
    handleRemoveFavorite,
    handleExportFavorites,
    refetchFavorites,
  };
}
