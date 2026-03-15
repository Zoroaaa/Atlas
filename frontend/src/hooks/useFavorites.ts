import { useState, useCallback, useEffect } from 'react';
import { useSearchStore, useAuthStore } from '@/stores';
import { userApi } from '@/services/api';
import { useNotification } from './useNotification';
import type { FavoriteItem, AddFavoriteRequest } from '@/types';

interface UseFavoritesReturn {
  favorites: FavoriteItem[];
  isLoading: boolean;
  loadFavorites: () => Promise<void>;
  addFavorite: (data: AddFavoriteRequest) => Promise<boolean>;
  removeFavorite: (id: string) => Promise<boolean>;
  isFavorited: (url: string) => boolean;
  getFavoriteByUrl: (url: string) => FavoriteItem | undefined;
}

export function useFavorites(): UseFavoritesReturn {
  const notification = useNotification();
  const { isAuthenticated } = useAuthStore();
  const { favorites, setFavorites, addToFavorites, removeFromFavorites } = useSearchStore();
  const [isLoading, setIsLoading] = useState(false);

  const loadFavorites = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await userApi.getFavorites();
      if (response.success && response.data) {
        setFavorites(response.data.favorites);
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
      notification.favorite.loadFailed();
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, setFavorites, notification]);

  const addFavorite = useCallback(async (data: AddFavoriteRequest): Promise<boolean> => {
    if (!isAuthenticated) {
      notification.common.loginRequired();
      return false;
    }

    try {
      const response = await userApi.addFavorite(data);
      if (response.success && response.data) {
        addToFavorites(response.data);
        notification.favorite.added();
        return true;
      }
      notification.favorite.addFailed(response.message);
      return false;
    } catch (error) {
      console.error('Failed to add favorite:', error);
      notification.favorite.addFailed();
      return false;
    }
  }, [isAuthenticated, addToFavorites, notification]);

  const removeFavorite = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await userApi.removeFavorite(id);
      if (response.success) {
        removeFromFavorites(id);
        notification.favorite.removed();
        return true;
      }
      notification.favorite.removeFailed(response.message);
      return false;
    } catch (error) {
      console.error('Failed to remove favorite:', error);
      notification.favorite.removeFailed();
      return false;
    }
  }, [removeFromFavorites, notification]);

  const isFavorited = useCallback((url: string): boolean => {
    return favorites.some(f => f.url === url);
  }, [favorites]);

  const getFavoriteByUrl = useCallback((url: string): FavoriteItem | undefined => {
    return favorites.find(f => f.url === url);
  }, [favorites]);

  useEffect(() => {
    if (isAuthenticated) {
      loadFavorites();
    }
  }, [isAuthenticated, loadFavorites]);

  return {
    favorites,
    isLoading,
    loadFavorites,
    addFavorite,
    removeFavorite,
    isFavorited,
    getFavoriteByUrl,
  };
}
