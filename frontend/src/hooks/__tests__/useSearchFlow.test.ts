import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useSearchFlow } from '../useSearchFlow';

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

const mockSetKeyword = vi.fn();

vi.mock('@/stores', () => ({
  useAuthStore: Object.assign(
    () => ({ user: { id: 'user1' }, isAuthenticated: true }),
    { getState: () => ({ user: { id: 'user1' }, isAuthenticated: true, token: 'token' }) }
  ),
  useSearchStore: () => ({
    keyword: '',
    setKeyword: mockSetKeyword,
  }),
}));

const mockSearchMutateAsync = vi.fn();

// useSearchFlow imports from '@/hooks', mock that module
vi.mock('@/hooks', () => ({
  useSearchMutation: () => ({
    mutateAsync: mockSearchMutateAsync,
  }),
  useSearchHistory: () => ({ data: [] }),
  useSearchSuggestions: () => ({
    suggestions: [],
    isLoading: false,
    showSuggestions: false,
    setShowSuggestions: vi.fn(),
  }),
  searchHistoryKeys: { all: ['searchHistory'] },
}));

vi.mock('@/services/api', () => ({
  userApi: { updateSearchHistory: vi.fn() },
  analyticsApi: { recordEvent: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/config/tabs', () => ({
  SEARCH_TABS: {
    jav: { id: 'jav', majorCategoryId: 'jav_sources' },
    anime: { id: 'anime', majorCategoryId: 'anime_sources' },
  },
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

const defaultOptions = {
  activeTab: 'jav' as const,
  selectedCategory: null,
  setSelectedCategory: vi.fn(),
  majorCategories: [],
  categories: [],
  fetchJavDetail: vi.fn(),
  resetJavDetail: vi.fn(),
  javEnrichedDetail: null,
  setJavEnrichedDetail: vi.fn(),
  javSubMode: 'code' as const,
  onSearch: vi.fn(),
};

describe('useSearchFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show warning toast when searching with empty keyword', async () => {
    const { result } = renderHook(() => useSearchFlow(defaultOptions), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleSearch('');
    });

    expect(mockToast.warning).toHaveBeenCalledWith('请输入搜索关键词');
    expect(mockSearchMutateAsync).not.toHaveBeenCalled();
  });

  it('should perform successful search and update state', async () => {
    const mockResponse = {
      success: true,
      data: {
        results: [
          { id: '1', name: 'Test Source', icon: '', url: 'https://example.com', subtitle: '', siteType: '', category: '', description: '' },
        ],
      },
    };
    mockSearchMutateAsync.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useSearchFlow(defaultOptions), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleSearch('test keyword');
    });

    await waitFor(() => {
      expect(mockSearchMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: 'test keyword' })
      );
    });
    expect(result.current.isSearching).toBe(false);
    expect(result.current.searchResults.length).toBeGreaterThan(0);
  });

  it('should show error toast when search fails', async () => {
    mockSearchMutateAsync.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSearchFlow(defaultOptions), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleSearch('test');
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('搜索失败', '请稍后重试');
    });
    expect(result.current.isSearching).toBe(false);
  });

  it('should call onSearch callback with trimmed keyword', async () => {
    mockSearchMutateAsync.mockResolvedValueOnce({
      success: true,
      data: { results: [] },
    });

    const onSearch = vi.fn();
    const { result } = renderHook(() => useSearchFlow({ ...defaultOptions, onSearch }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleSearch('  hello  ');
    });

    expect(onSearch).toHaveBeenCalledWith('hello');
  });

  it('should show info toast when no results found', async () => {
    mockSearchMutateAsync.mockResolvedValueOnce({
      success: true,
      data: { results: [] },
    });

    const { result } = renderHook(() => useSearchFlow(defaultOptions), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.handleSearch('nonexistent');
    });

    await waitFor(() => {
      expect(mockToast.info).toHaveBeenCalledWith('未找到结果', '尝试更换关键词搜索');
    });
  });
});
