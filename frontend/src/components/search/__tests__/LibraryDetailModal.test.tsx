import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/components/follow/FollowButton', () => ({
  FollowButton: ({ name }: { name: string }) => <button type="button">follow-{name}</button>,
}));

const addFavoriteMock = vi.fn();
const removeFavoriteMock = vi.fn();
// 收藏索引默认空；取消收藏用例里改成已含目标 URL 的一条
let favoriteIndexItems: Array<{ id: string; url: string; code?: string }> = [];

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    libraryApi: {
      ...actual.libraryApi,
      getRecord: vi.fn().mockResolvedValue({
        found: true,
        record: {
          id: 'r1',
          recordType: 'jav',
          title: '测试标题',
          code: 'ABP-123',
          cover: '/cover.jpg',
          actors: ['女優A'],
          tags: ['巨乳'],
          detailCompleted: true,
          contentData: {
            actresses: ['女優A'],
            detailUrl: 'https://www.javbus.com/ABP-123',
            tagLinks: [{ kind: 'tag', name: '巨乳', path: '/genre/2a' }],
          },
          sources: [{ sourceUrl: 'magnet:?xt=urn:btih:abcdef', sourceData: {} }],
          firstSeenAt: 0,
          lastUpdatedAt: 0,
        },
      }),
    },
    userApi: {
      ...actual.userApi,
      getFavoriteIndex: vi.fn(async () => ({ success: true, data: { items: favoriteIndexItems } })),
      addFavorite: (...args: unknown[]) => addFavoriteMock(...args),
      removeFavorite: (...args: unknown[]) => removeFavoriteMock(...args),
    },
  };
});

import { useAuthStore } from '@/stores';
import { LibraryDetailModal } from '../LibraryDetailModal';

/** 详情卡内的收藏依赖 react-query 与路由上下文，测试需补齐这两个 Provider */
const renderDetail = (ui: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

const login = () => {
  useAuthStore.setState({
    user: { id: 'u1', username: 'tester' } as never,
    token: 'token',
    isAuthenticated: true,
    isLoading: false,
  });
};

describe('历史/收藏详情卡片：与搜索详情共用标签与演员实现', () => {
  beforeEach(() => {
    // 收藏索引会写 localStorage 持久缓存（24h TTL），不清理会让下个用例读到上一个用例的空结果
    localStorage.clear();
    favoriteIndexItems = [];
    addFavoriteMock.mockReset().mockResolvedValue({ success: true, data: {}, message: '' });
    removeFavoriteMock.mockReset().mockResolvedValue({ success: true, message: '' });
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
  });

  it('标签为黄色下划线链接，演员可点击且旁有关注按钮', async () => {
    const onActressClick = vi.fn();
    renderDetail(
      <LibraryDetailModal
        target={{ type: 'jav', code: 'ABP-123' }}
        onClose={vi.fn()}
        onActressClick={onActressClick}
      />
    );

    expect(await screen.findByText('测试标题')).toBeInTheDocument();

    const tag = screen.getByTitle('巨乳');
    expect(tag.className).toContain('text-primary-600');
    expect(tag.className).toContain('underline');
    expect(tag.className).toContain('decoration-dotted');

    const actor = screen.getByTitle('女優A');
    expect(actor.className).toContain('border-accent-500');
    expect(screen.getByText('follow-女優A')).toBeInTheDocument();

    fireEvent.click(actor);
    expect(onActressClick).toHaveBeenCalledWith('女優A');
  });

  it('未收藏时点击收藏，按详情页 URL 写入收藏', async () => {
    login();
    renderDetail(<LibraryDetailModal target={{ type: 'jav', code: 'ABP-123' }} onClose={vi.fn()} />);

    expect(await screen.findByText('测试标题')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收藏' }));

    await waitFor(() => expect(addFavoriteMock).toHaveBeenCalledTimes(1));
    expect(addFavoriteMock.mock.calls[0][0]).toMatchObject({
      url: 'https://www.javbus.com/ABP-123',
      code: 'ABP-123',
      title: '测试标题',
    });
  });

  it('已在收藏索引中时显示已收藏，点击后取消收藏', async () => {
    login();
    favoriteIndexItems = [{ id: 'fav-1', url: 'https://www.javbus.com/ABP-123', code: 'ABP-123' }];
    renderDetail(<LibraryDetailModal target={{ type: 'jav', code: 'ABP-123' }} onClose={vi.fn()} />);

    const button = await screen.findByRole('button', { name: '取消收藏' });
    expect(button).toHaveTextContent('已收藏');

    fireEvent.click(button);
    await waitFor(() => expect(removeFavoriteMock).toHaveBeenCalledWith('fav-1'));
  });
});
