import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CommunityPanelLayout } from '../CommunityPanelLayout';

vi.mock('@/stores', () => ({
  useAuthStore: () => ({
    user: { username: 'tester', role: 'user' },
    logout: vi.fn(),
  }),
  useThemeStore: () => ({
    resolvedTheme: 'light',
    toggleTheme: vi.fn(),
    sidebarCollapsed: false,
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock('@/hooks', () => ({
  useIsDesktop: () => false,
}));

vi.mock('@/hooks/useRouteEnterAnimation', () => ({
  useRouteEnterAnimation: () => ({ current: null }),
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/community" element={<CommunityPanelLayout />}>
          <Route index element={<div>发现内容</div>} />
          <Route path="browse" element={<div>发现内容</div>} />
          <Route path="my-shares" element={<div>帖子内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('社区移动端菜单页', () => {
  it('菜单页列出发现、我的帖子等入口', () => {
    renderAt('/community');

    expect(screen.getByRole('link', { name: /发现/ })).toHaveAttribute('href', '/community/browse');
    expect(screen.getByRole('link', { name: /我的帖子/ })).toHaveAttribute('href', '/community/my-shares');
  });

  it('点击菜单项进入内容页，返回按钮回到社区菜单页', () => {
    renderAt('/community');

    fireEvent.click(screen.getByRole('link', { name: /发现/ }));
    expect(screen.getByText('发现内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.getByRole('link', { name: /发现/ })).toBeInTheDocument();
  });

  it('直链进入子页时，返回落点为社区菜单页', () => {
    renderAt('/community/my-shares');

    expect(screen.getByText('帖子内容')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    expect(screen.getByRole('link', { name: /发现/ })).toBeInTheDocument();
  });
});
