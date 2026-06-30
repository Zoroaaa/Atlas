import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFavoritesManager } from '../useFavoritesManager';
import type { SearchResultItem } from '../useSearchFlow';

// ── Mocks ──

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => mockToast,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockFavorites = [
  { id: 'fav1', url: 'https://example.com/1', code: 'ABC-123', title: 'Test', userId: 'u1', createdAt: Date.now() },
];

const mockAddMutateAsync = vi.fn();
const mockRemoveMutateAsync = vi.fn();
const mockRefetch = vi.fn();

vi.mock('@/stores', () => ({
  useAuthStore: Object.assign(
    () => ({ isAuthenticated: true }),
    { getState: () => ({ isAuthenticated: true, token: 'token' }) }
  ),
}));

// useFavoritesManager imports from '@/hooks', so we mock that module
vi.mock('@/hooks', () => ({
  useFavoritesQuery: () => ({
    data: mockFavorites,
    isLoading: false,
    refetch: mockRefetch,
  }),
  useAddFavorite: () => ({
    mutateAsync: mockAddMutateAsync,
  }),
  useRemoveFavorite: () => ({
    mutateAsync: mockRemoveMutateAsync,
  }),
  favoritesKeys: { all: ['favorites'] },
}));

// ── Helpers ──

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const sampleResult: SearchResultItem = {
  sourceId: '1',
  sourceName: 'Test Source',
  sourceIcon: '',
  url: 'https://example.com/new',
  subtitle: '',
  siteType: '',
  category: '',
  description: '',
};

describe('useFavoritesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add a favorite and show success toast', async () => {
    mockAddMutateAsync.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useFavoritesManager({ keyword: 'test' }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleToggleFavorite(sampleResult);
    });

    expect(mockAddMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Source',
        url: 'https://example.com/new',
        keyword: 'test',
      })
    );
    expect(mockToast.success).toHaveBeenCalledWith('已添加到收藏');
  });

  it('should remove a favorite when URL already exists', async () => {
    const existingResult: SearchResultItem = {
      ...sampleResult,
      url: 'https://example.com/1', // matches mockFavorites[0].url
    };

    mockRemoveMutateAsync.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useFavoritesManager({ keyword: 'test' }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleToggleFavorite(existingResult);
    });

    expect(mockRemoveMutateAsync).toHaveBeenCalledWith('fav1');
    expect(mockToast.success).toHaveBeenCalledWith('已取消收藏');
  });

  it('should show error toast when add favorite fails', async () => {
    mockAddMutateAsync.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFavoritesManager({ keyword: 'test' }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleToggleFavorite(sampleResult);
    });

    expect(mockToast.error).toHaveBeenCalledWith('收藏失败', '请稍后重试');
  });

  it('should compute favoritedCodes from favorites', () => {
    const { result } = renderHook(() => useFavoritesManager({ keyword: 'test' }), {
      wrapper: createWrapper(),
    });

    expect(result.current.favoritedCodes.has('ABC-123')).toBe(true);
    expect(result.current.favoritedCodes.size).toBe(1);
  });

  it('should handle remove favorite by id', async () => {
    mockRemoveMutateAsync.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useFavoritesManager({ keyword: 'test' }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleRemoveFavorite('fav1');
    });

    expect(mockRemoveMutateAsync).toHaveBeenCalledWith('fav1');
    expect(mockToast.success).toHaveBeenCalledWith('已移除收藏');
  });

  it('should show error toast when remove favorite fails', async () => {
    mockRemoveMutateAsync.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFavoritesManager({ keyword: 'test' }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleRemoveFavorite('fav1');
    });

    expect(mockToast.error).toHaveBeenCalledWith('移除失败', '请稍后重试');
  });
});
