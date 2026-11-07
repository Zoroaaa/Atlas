import React from 'react';
import { Heart } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { useFollows, useFollowActions } from '@/hooks';

interface FollowButtonProps {
  name: string;
  /** JavBus 女优 key；只有名字时（如热门女优）留空，由后端解析 */
  followKey?: string;
  avatar?: string;
  className?: string;
}

/** 关注/取消关注女优。未登录不显示。 */
export const FollowButton: React.FC<FollowButtonProps> = ({ name, followKey, avatar, className }) => {
  const { t } = useTranslation(['follow']);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useFollows();
  const { follow, unfollow } = useFollowActions();

  if (!isAuthenticated) return null;

  const existing = data?.follows.find((f) => (followKey && f.key === followKey) || f.name === name);
  const isFollowing = Boolean(existing);
  const pending = follow.isPending || unfollow.isPending;

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (pending) return;
    if (existing) unfollow.mutate(existing.key);
    else follow.mutate({ name, key: followKey, avatar });
  };

  const label = isFollowing ? t('follow:following') : t('follow:follow');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={isFollowing}
      aria-label={`${label} ${name}`}
      title={`${label} ${name}`}
      className={clsx(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50',
        isFollowing
          ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
          : 'text-surface-400 hover:bg-surface-100 hover:text-rose-500 dark:hover:bg-surface-800',
        className
      )}
    >
      <Heart className={clsx('h-3.5 w-3.5', isFollowing && 'fill-current')} />
    </button>
  );
};
