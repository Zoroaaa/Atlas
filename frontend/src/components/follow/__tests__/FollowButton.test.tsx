import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const followMutate = vi.fn();
const unfollowMutate = vi.fn();
let mockFollows: Array<Record<string, unknown>> = [];

vi.mock('@/hooks', () => ({
  useFollows: () => ({ data: { follows: mockFollows } }),
  useFollowActions: () => ({
    follow: { mutate: followMutate, isPending: false },
    unfollow: { mutate: unfollowMutate, isPending: false },
  }),
}));

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
}));

import { FollowButton } from '../FollowButton';

describe('FollowButton 实体关注', () => {
  beforeEach(() => {
    followMutate.mockClear();
    unfollowMutate.mockClear();
    mockFollows = [];
  });

  it('标签实体的已关注态与关注动作使用统一的 watch key', () => {
    render(<FollowButton name="巨乳" entityType="tag" entityPath="/genre/2a" />);
    fireEvent.click(screen.getByRole('button', { name: /关注 巨乳/ }));
    expect(followMutate).toHaveBeenCalledWith({
      name: '巨乳',
      key: 'tag:genre/2a',
      avatar: undefined,
      entityType: 'tag',
    });
  });

  it('已关注的实体展示已关注态，点击执行取消关注', () => {
    mockFollows = [{ key: 'tag:genre/2a', name: '巨乳', entityType: 'tag', entityKey: 'genre/2a' }];
    render(<FollowButton name="巨乳" entityType="tag" entityPath="/genre/2a" />);
    const button = screen.getByRole('button', { name: /已关注 巨乳/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(unfollowMutate).toHaveBeenCalledWith('tag:genre/2a');
  });

  it('旧记录没有实体路径时不渲染关注按钮，避免误建成女优关注', () => {
    const { container } = render(<FollowButton name="巨乳" entityType="tag" />);
    expect(container.firstChild).toBeNull();
  });

  it('女优关注仍按 slug 使用原有逻辑', () => {
    render(<FollowButton name="三上悠亚" followKey="abc123" />);
    fireEvent.click(screen.getByRole('button', { name: /关注 三上悠亚/ }));
    expect(followMutate).toHaveBeenCalledWith({
      name: '三上悠亚',
      key: 'abc123',
      avatar: undefined,
      entityType: 'actress',
    });
  });
});
