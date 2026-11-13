import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/follow/FollowButton', () => ({
  FollowButton: ({ name }: { name: string }) => <button type="button">follow-{name}</button>,
}));

import { JavActressList, JavTagButton, JAV_ENTITY_LINK_CLASS } from '../JavDetailShared';

describe('JavDetailShared 复用的实体/演员样式', () => {
  it('标签与导演等实体使用同一条链接样式类', () => {
    expect(JAV_ENTITY_LINK_CLASS).toContain('text-primary-600');
    expect(JAV_ENTITY_LINK_CLASS).toContain('underline');
    expect(JAV_ENTITY_LINK_CLASS).toContain('decoration-dotted');
  });

  it('标签按钮复用实体链接样式且可点击', () => {
    const onClick = vi.fn();
    render(<JavTagButton tag="巨乳" onClick={onClick} />);
    const tag = screen.getByTitle('巨乳');
    expect(tag.className).toContain('text-primary-600');
    expect(tag.className).toContain('underline');
    fireEvent.click(tag);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('演员保持红字红底并加红色下划线，点击复用女优卡片回调', () => {
    const onActressClick = vi.fn();
    render(<JavActressList actresses={['女優A', '女優A', '女優B']} onActressClick={onActressClick} />);

    const actorA = screen.getByTitle('女優A');
    expect(actorA.className).toContain('border-accent-500');
    expect(actorA.textContent).toBe('女優A');

    // 去重后每位演员旁各有一个关注按钮
    expect(screen.getAllByRole('button', { name: /follow-/ })).toHaveLength(2);
    expect(screen.getByText('follow-女優A')).toBeInTheDocument();

    fireEvent.click(actorA);
    expect(onActressClick).toHaveBeenCalledWith('女優A');
  });
});
