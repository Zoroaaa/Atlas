import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropdownMenu, userMenuItems } from '../DropdownMenu';

const items = [{ id: 'item-a', label: '菜单项 A' }];

const renderMenu = () =>
  render(<DropdownMenu trigger={<button>打开菜单</button>} items={items} triggerMode="click" />);

describe('DropdownMenu', () => {
  it('菜单锚定在触发器下方（使用 top-full），不会回落到触发器上方', () => {
    renderMenu();
    fireEvent.click(screen.getByText('打开菜单'));

    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('top-full');
  });

  it('点击外部立即卸载菜单，不依赖延时卸载', () => {
    renderMenu();
    fireEvent.click(screen.getByText('打开菜单'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('再次点击触发器可关闭菜单', () => {
    renderMenu();
    const trigger = screen.getByText('打开菜单');

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('userMenuItems', () => {
  const t = ((key: string) => key) as never;
  const navigate = vi.fn();
  const logout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ids = () =>
    userMenuItems(t, navigate, logout, { isDark: false, onToggleTheme: vi.fn() }).map((item) => item.id);

  it('账户菜单只保留个人资料、设置、主题与退出登录', () => {
    expect(ids()).toEqual(expect.arrayContaining(['profile', 'settings', 'theme', 'logout']));
  });

  it('产品导航入口全部移出账户菜单', () => {
    const menuIds = ids();

    expect(menuIds).not.toContain('dashboard');
    expect(menuIds).not.toContain('community');
    expect(menuIds).not.toContain('admin-panel');
    expect(menuIds).not.toContain('favorites');
    expect(menuIds).not.toContain('history');
  });

  it('设置项进入独立设置页，而不是个人中心子路由', () => {
    const settings = userMenuItems(t, navigate, logout, { isDark: false, onToggleTheme: vi.fn() })
      .find((item) => item.id === 'settings');

    settings?.onClick?.();

    expect(navigate).toHaveBeenCalledWith('/settings');
  });

  it('主题项调用切换回调', () => {
    const onToggleTheme = vi.fn();
    const theme = userMenuItems(t, navigate, logout, { isDark: true, onToggleTheme })
      .find((item) => item.id === 'theme');

    theme?.onClick?.();

    expect(onToggleTheme).toHaveBeenCalled();
  });
});
