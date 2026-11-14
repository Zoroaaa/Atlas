import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MePage } from '../MePage';

vi.mock('@/stores', () => ({
  useAuthStore: () => ({
    user: { username: 'tester', email: 'tester@example.com', role: 'user', roleDisplayName: '成员' },
    logout: vi.fn(),
  }),
  useAppUpdateStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: 'idle',
      currentVersion: null,
      latestVersion: null,
      releaseUrl: null,
      check: vi.fn(),
    }),
}));

vi.mock('@/utils/nativeShell', () => ({
  hapticTap: vi.fn(),
  isAndroidApp: () => false,
}));

describe('我的菜单页', () => {
  it('设置入口指向独立设置页', () => {
    render(
      <MemoryRouter initialEntries={['/me']}>
        <MePage />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /设置/ })).toHaveAttribute('href', '/settings');
  });

  it('不再保留个人中心里的旧设置链接', () => {
    render(
      <MemoryRouter initialEntries={['/me']}>
        <MePage />
      </MemoryRouter>
    );

    const staleLink = document.querySelector('a[href="/dashboard/settings"]');
    expect(staleLink).toBeNull();
  });
});
