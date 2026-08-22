import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { useFavoritesQuery, useAddFavorite, useRemoveFavorite } from '@/hooks';
import { useToast } from '@/components/ui/Toast';
import i18next from '@/i18n';
import type { JavDetail } from '@/types/jav';
import type { BangumiSubject, TMDBResult, MangaEnrichedData, NovelItem, ActressProfile } from '@/types/search';
import type { SearchResultItem } from './useSearchFlow';

interface UseFavoritesManagerOptions {
  keyword: string;
}

export function useFavoritesManager({ keyword }: UseFavoritesManagerOptions) {
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: favorites = [], isLoading: isLoadingFavorites, refetch: refetchFavorites } = useFavoritesQuery();
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
    const url = item.source === 'douban'
      ? `https://movie.douban.com/subject/${Math.abs(item.id)}/`
      : `https://www.themoviedb.org/${item.mediaType}/${item.id}`;
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

  const handleToggleFavoriteActress = async (actress: ActressProfile) => {
    if (!isAuthenticated) { toast.warning(i18next.t('errors:hooks.favorites.loginRequired')); navigate('/login'); return; }
    const actressCode = `actress:${actress.id}`;
    const existingFavoriteId = favorites.find(f => f.code === actressCode)?.id;
    if (existingFavoriteId) {
      try {
        await removeFavoriteMutation.mutateAsync(existingFavoriteId);
        toast.success(i18next.t('errors:hooks.favorites.removedTitle'));
      } catch { toast.error(i18next.t('errors:hooks.favorites.removeFailedTitle'), i18next.t('errors:hooks.favorites.retryDefault')); }
    } else {
      try {
        const response = await addFavoriteMutation.mutateAsync({
          title: actress.name,
          url: actress.detailUrl,
          code: actressCode,
          cover: actress.cover,
          subtitle: [actress.ruby, actress.romaji].filter(Boolean).join(' / ') || undefined,
          actors: actress.name,
          tags: actress.tags?.join(', '),
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

  const handleExportFavorites = () => {
    const data = JSON.stringify(favorites, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `favorites-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(i18next.t('errors:hooks.favorites.exportSuccessTitle'));
  };

  return {
    favorites,
    isLoadingFavorites,
    favoritedCodes,
    handleToggleFavorite,
    handleFavoriteJavDetail,
    handleToggleFavoriteAnime,
    handleToggleFavoriteMovie,
    handleToggleFavoriteManga,
    handleToggleFavoriteNovel,
    handleToggleFavoriteActress,
    handleRemoveFavorite,
    handleExportFavorites,
    refetchFavorites,
  };
}
