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
  it('「想看」按钮不参与行高计算，但仍保留可点击高度', () => {
    renderPanel();
    // 语言检测在并行测试中可能落到英文，按样式类定位这个按钮，避免依赖文案
    const button = screen
      .getAllByRole('button')
      .find((element) => element.className.includes('-my-1.5'));
    expect(button).toBeTruthy();
    if (!button) throw new Error('未找到「想看」按钮');
    expect(button.className).toContain('-my-1.5');
    expect(button.className).toContain('h-7');
    expect(button.className).toContain('leading-none');
    expect(button.className).toContain('whitespace-nowrap');
    expect(button.className).toContain('self-center');
  });
});
