import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { UserAccountMenu } from '../UserAccountMenu';

vi.mock('@/stores', () => ({
  useAuthStore: () => ({ logout: vi.fn() }),
  useThemeStore: () => ({ resolvedTheme: 'light', toggleTheme: vi.fn() }),
}));

const renderAt = (isAdmin: boolean) =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <UserAccountMenu
              isAuthenticated
              user={{ username: 'tester' }}
              isAdmin={isAdmin}
            />
          }
        />
        <Route path="/me" element={<div>个人资料页</div>} />
        <Route path="/settings" element={<div>设置页</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('桌面端头像下拉', () => {
  it('只提供个人资料、设置、主题与退出登录', () => {
    renderAt(false);
    fireEvent.click(screen.getByText('tester'));

    expect(screen.getByText('个人资料')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();
    expect(screen.getByText('切换主题')).toBeInTheDocument();
    expect(screen.getByText('退出登录')).toBeInTheDocument();
  });

  it('产品导航不再出现在账户菜单里', () => {
    renderAt(true);
    fireEvent.click(screen.getByText('tester'));

    expect(screen.queryByText('个人中心')).not.toBeInTheDocument();
    expect(screen.queryByText('社区')).not.toBeInTheDocument();
    expect(screen.queryByText('管理看板')).not.toBeInTheDocument();
  });

  it('设置入口进入独立设置页', () => {
    renderAt(false);
    fireEvent.click(screen.getByText('tester'));
    fireEvent.click(screen.getByText('设置'));

    expect(screen.getByText('设置页')).toBeInTheDocument();
  });

  it('个人资料进入账户页', () => {
    renderAt(false);
    fireEvent.click(screen.getByText('tester'));
    fireEvent.click(screen.getByText('个人资料'));

    expect(screen.getByText('个人资料页')).toBeInTheDocument();
  });
});
