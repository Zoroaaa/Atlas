import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FavoritesPanel } from '../FavoritesPanel';
import type { FavoriteItem } from '@/types';

vi.mock('@/hooks/useNotification', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const favorite = {
  id: 'fav-1',
  title: '测试收藏',
  url: 'https://example.com/item',
  status: 'want',
} as FavoriteItem;

const renderPanel = () =>
  render(
    <FavoritesPanel
      favorites={[favorite]}
      total={1}
      page={1}
      totalPages={1}
      onPageChange={vi.fn()}
      isLoading={false}
      show
      isProxyEnabled={false}
      onToggle={vi.fn()}
      onRemove={vi.fn()}
      onItemSelect={vi.fn()}
      onExport={vi.fn()}
      onUpdate={vi.fn()}
    />
  );

describe('FavoritesPanel', () => {
  it('「想看」按钮与元信息行同高，不再用负边距撑高列表项', () => {
    renderPanel();
    const button = screen.getByTestId('favorite-status-toggle');
    // 固定高度与负边距会让这一行比相邻行更高
    expect(button.className).not.toContain('-my-1.5');
    expect(button.className).not.toContain('h-7');
    expect(button.className).toContain('leading-none');
    expect(button.className).toContain('whitespace-nowrap');
  });
});
