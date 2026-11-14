import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFollowFeed, useFollows } from '../useFollows';
import { writePersisted } from '@/utils/persistentCache';
import type { FollowFeedData, FollowsData } from '@/types';

const { mockFeed, mockList } = vi.hoisted(() => ({
  mockFeed: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  followApi: {
    feed: mockFeed,
    list: mockList,
    feedSearch: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/stores', () => ({
  useAuthStore: (
    selector: (state: { user: { id: string }; isAuthenticated: boolean }) => unknown
  ) => selector({ user: { id: 'u1' }, isAuthenticated: true }),
}));

vi.mock('@/hooks/useNotification', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const wrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

const cachedFeed: FollowFeedData = {
  items: [
    {
      code: 'ABC-001',
      title: 'Cached work',
      entityType: 'actress',
      entityKey: 'test',
      entityName: 'Test Actress',
      isUnread: true,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
};

const cachedList: FollowsData = {
  follows: [
    {
      key: 'test',
      entityType: 'actress',
      entityKey: 'test',
      name: 'Test Actress',
      createdAt: Date.now(),
      notifyInApp: true,
      lastCheckedAt: Date.now(),
      checkFailing: false,
      unread: 1,
    },
  ],
  unread: 1,
  limit: 100,
};

beforeEach(() => {
  localStorage.clear();
  mockFeed.mockReset();
  mockList.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe('关注动态离线缓存', () => {
  it('关注列表命中新鲜缓存时不请求接口', async () => {
    writePersisted('follow:list:u1', cachedList);

    const { result } = renderHook(() => useFollows(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toEqual(cachedList));
    expect(mockList).not.toHaveBeenCalled();
  });

  it('动态页命中新鲜缓存时不请求接口', async () => {
    writePersisted('follow:feed:u1:new:10:1:all', cachedFeed);

    const { result } = renderHook(() => useFollowFeed('new', 1, true), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toEqual(cachedFeed));
    expect(mockFeed).not.toHaveBeenCalled();
  });

  it('缓存超过 30 分钟后仍先展示旧数据，并在后台刷新', async () => {
    localStorage.setItem(
      'cs_cache_v1:follow:feed:u1:new:10:1:all',
      JSON.stringify({ data: cachedFeed, cachedAt: Date.now() - 31 * 60 * 1000 })
    );
    const fresh: FollowFeedData = { ...cachedFeed, items: [{ ...cachedFeed.items[0], title: 'Fresh work' }] };
    mockFeed.mockResolvedValue(fresh);

    const { result } = renderHook(() => useFollowFeed('new', 1, true), { wrapper: wrapper() });

    await waitFor(() => expect(mockFeed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.data?.items[0]?.title).toBe('Fresh work'));
  });
});
